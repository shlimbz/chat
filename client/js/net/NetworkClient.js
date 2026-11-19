// Socket.IO 연결 관리
// - 최초 접속: 성공(welcome) 또는 실패(사유) 를 Promise 로 반환
// - 접속 후 끊기면 자동 재접속 → 서버가 welcome 을 다시 보내면 'resync' 로 전체 상태 재동기화
import { io } from 'socket.io-client';
import { EV, AUTH_ERRORS, PROTOCOL_VERSION } from '../shared/protocol.js';
import { CONFIG } from '../config.js';

export class NetworkClient {
  /**
   * @param {string} url 서버 주소
   * @param {() => object} getAuth 접속(재접속) 때마다 호출되어 인증 정보를 반환
   */
  constructor(url, getAuth) {
    this.url = url;
    this.getAuth = getAuth;
    this.socket = null;
    this.status = 'idle'; // idle | connecting | online | reconnecting | offline | kicked
    this._handlers = new Map();
    this._established = false;
  }

  /** 서버 → 클라이언트 이벤트 구독 (+ 내부 이벤트: status, resync) */
  on(event, fn) {
    if (!this._handlers.has(event)) this._handlers.set(event, new Set());
    this._handlers.get(event).add(fn);
    return () => this._handlers.get(event).delete(fn);
  }

  _emitLocal(event, data) {
    const set = this._handlers.get(event);
    if (set) for (const fn of set) fn(data);
  }

  _setStatus(s, detail) {
    this.status = s;
    this._emitLocal('status', { status: s, detail });
  }

  /** @returns {Promise<object>} welcome 데이터 */
  connect() {
    this._setStatus('connecting');
    return new Promise((resolve, reject) => {
      let settled = false;
      const fail = (code) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.socket?.disconnect();
        this._setStatus('offline');
        reject(Object.assign(new Error(code), { code }));
      };
      const timer = setTimeout(() => fail('TIMEOUT'), CONFIG.CONNECT_TIMEOUT_MS);

      const socket = io(this.url, {
        auth: (cb) => cb({ v: PROTOCOL_VERSION, ...this.getAuth() }),
        // 처음부터 웹소켓으로 연결 (HTTP 폴링을 거치면 무료 서버에서 위치 패킷이 몰리거나 늦어져 버벅임)
        transports: ['websocket'],
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        timeout: CONFIG.CONNECT_TIMEOUT_MS,
      });
      this.socket = socket;

      // 서버 이벤트를 등록된 핸들러로 전달
      for (const ev of [EV.PLAYER_JOIN, EV.PLAYER_LEAVE, EV.PLAYER_APPEARANCE, EV.STATE, EV.CORRECT, EV.CHAT, EV.ATTACK_FX, EV.HIT, EV.WALLET, EV.RANKING_LIVE, EV.BAG_RESULT, EV.TOWER_STATE]) {
        socket.on(ev, (data) => this._emitLocal(ev, data));
      }

      socket.on(EV.WELCOME, (data) => {
        this._setStatus('online');
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          this._established = true;
          resolve(data);
        } else {
          this._emitLocal('resync', data); // 재접속 성공
        }
      });

      socket.on('connect_error', (err) => {
        const code = err?.data?.code || err?.message || 'NETWORK';
        if (!this._established) {
          // 최초 접속 실패: 인증 거부든 서버 다운이든 즉시 알림
          fail(Object.values(AUTH_ERRORS).includes(code) ? code : 'NETWORK');
          return;
        }
        if (Object.values(AUTH_ERRORS).includes(code)) {
          socket.disconnect();
          this._setStatus('offline', code);
        }
        // 그 외 네트워크 오류는 socket.io 가 자동 재시도
      });

      socket.on(EV.KICKED, (data) => {
        this._setStatus('kicked', data?.reason);
      });

      socket.on('disconnect', (reason) => {
        if (this.status === 'kicked') return;
        if (reason === 'io client disconnect') {
          this._setStatus('offline');
        } else if (reason === 'io server disconnect') {
          this._setStatus('offline', 'SERVER_CLOSED');
        } else {
          this._setStatus('reconnecting', reason);
        }
      });
    });
  }

  get connected() {
    return !!this.socket?.connected;
  }

  sendMove(state) {
    // volatile(버려도 되는 패킷) 대신 일반 전송: 패킷 유실로 인한 끊김 방지 (크기가 작아 부담 없음)
    if (this.connected) this.socket.emit(EV.MOVE, state);
  }

  sendAttack(type, t) {
    if (this.connected) this.socket.emit(EV.ATTACK, { type, t });
  }

  /** 서버 왕복 시간(ms) */
  async ping() {
    const t = performance.now();
    await this.request(EV.PING, Date.now(), 3000);
    return Math.round(performance.now() - t);
  }

  /** 관리자 명령 → { ok, message } */
  admin(action, target, extra = {}) {
    return this.request(EV.ADMIN_ACTION, { action, target, ...extra });
  }

  sendChat(text) {
    if (!this.connected) return false;
    this.socket.emit(EV.CHAT_SEND, text);
    return true;
  }

  /** 상점: 구매/판매 → { ok, message, coins, items } */
  buy(itemId) {
    return this.request(EV.SHOP_BUY, itemId);
  }

  sell(itemId) {
    return this.request(EV.SHOP_SELL, itemId);
  }

  /** 맵 이동 (포탈) → 서버가 위치를 확인하고 옮겨 줌 */
  travel(to) {
    return this.request(EV.MAP_TRAVEL, { to });
  }

  /** 타워: 마지막 체크포인트로 (restart=true 면 처음부터) */
  towerRespawn(restart = false) {
    return this.request(EV.TOWER_RESPAWN, { restart });
  }

  setAppearance(appearance) {
    if (this.connected) this.socket.emit(EV.SET_APPEARANCE, appearance);
  }

  /** 응답(ack)을 받는 요청 */
  request(event, payload, timeoutMs = 5000) {
    return new Promise((resolve, reject) => {
      if (!this.connected) { reject(new Error('OFFLINE')); return; }
      this.socket.timeout(timeoutMs).emit(event, payload, (err, res) => {
        if (err) reject(err);
        else resolve(res);
      });
    });
  }

  disconnect() {
    this.socket?.disconnect();
  }
}
