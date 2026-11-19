// 접속 중인 플레이어 (메모리) + 이동 검증 + 변경분 스냅샷
import {
  WORLD_BOUNDS, MAX_MOVE_SPEED, SPAWN, ACTIONS,
} from '../../../client/js/shared/protocol.js';

const RADIUS = 0.35;
const round2 = (n) => Math.round(n * 100) / 100;

export class PlayerRegistry {
  constructor() {
    this.bySocket = new Map(); // socketId → player
    this.byUser = new Map(); // userId → player
  }

  get count() {
    return this.bySocket.size;
  }

  add(socketId, user, now = Date.now()) {
    const start = user.lastPos && inBounds(user.lastPos) ? user.lastPos : SPAWN;
    const player = {
      socketId,
      id: user.id,
      nickname: user.nickname,
      appearance: user.appearance,
      bodyStats: user.bodyStats,
      level: user.level,
      x: start.x,
      y: 0,
      z: start.z,
      r: start.r ?? SPAWN.r,
      a: 0,
      lastMoveAt: now,
      dirty: false,
      lastWhisperPartner: null,
      joinedAt: now,
    };
    this.bySocket.set(socketId, player);
    this.byUser.set(user.id, player);
    return player;
  }

  remove(socketId) {
    const p = this.bySocket.get(socketId);
    if (!p) return null;
    this.bySocket.delete(socketId);
    if (this.byUser.get(p.id) === p) this.byUser.delete(p.id);
    return p;
  }

  get(socketId) {
    return this.bySocket.get(socketId) || null;
  }

  getByUserId(id) {
    return this.byUser.get(id) || null;
  }

  getByNickname(nickname) {
    const n = String(nickname).toLowerCase();
    for (const p of this.bySocket.values()) if (p.nickname.toLowerCase() === n) return p;
    return null;
  }

  list() {
    return [...this.bySocket.values()];
  }

  /** 다른 클라이언트에 보낼 공개 정보 */
  static info(p) {
    return {
      id: p.id,
      nickname: p.nickname,
      appearance: p.appearance,
      bodyStats: p.bodyStats,
      level: p.level,
      x: round2(p.x), y: round2(p.y), z: round2(p.z), r: round2(p.r), a: p.a,
    };
  }

  /**
   * 클라이언트 이동 패킷 검증 후 반영. 클라이언트 값은 신뢰하지 않습니다.
   * @param {any} msg [x, y, z, r, actionIndex]
   * @returns {'ok'|'invalid'|'corrected'}
   */
  applyMove(player, msg, now = Date.now()) {
    if (!Array.isArray(msg) || msg.length < 5) return 'invalid';
    let [x, y, z, r, a] = msg.map(Number);
    if (![x, y, z, r, a].every(Number.isFinite)) return 'invalid';

    // 순간이동/스피드핵 방지: 경과 시간 대비 이동 거리 확인 (네트워크 지연 여유 포함)
    const dt = Math.min(2, Math.max(0.1, (now - player.lastMoveAt) / 1000));
    const allowed = MAX_MOVE_SPEED * 1.5 * dt + 0.5;
    const dist = Math.hypot(x - player.x, z - player.z);
    player.lastMoveAt = now;
    if (dist > allowed) return 'corrected';

    const B = WORLD_BOUNDS;
    x = Math.min(B.maxX - RADIUS, Math.max(B.minX + RADIUS, x));
    z = Math.min(B.maxZ - RADIUS, Math.max(B.minZ + RADIUS, z));
    y = Math.min(B.maxY, Math.max(0, y));
    r = Math.atan2(Math.sin(r), Math.cos(r));
    a = Number.isInteger(a) && a >= 0 && a < ACTIONS.length ? a : 0;

    if (x !== player.x || y !== player.y || z !== player.z || r !== player.r || a !== player.a) {
      Object.assign(player, { x, y, z, r, a });
      player.dirty = true;
    }
    return 'ok';
  }

  /** 지난 틱 이후 변경된 플레이어만 압축 배열로 반환 */
  takeStatePacket() {
    const out = [];
    for (const p of this.bySocket.values()) {
      if (!p.dirty) continue;
      out.push([p.id, round2(p.x), round2(p.y), round2(p.z), round2(p.r), p.a]);
      p.dirty = false;
    }
    return out;
  }
}

function inBounds(pos) {
  const B = WORLD_BOUNDS;
  return Number.isFinite(pos.x) && Number.isFinite(pos.z) && pos.x > B.minX && pos.x < B.maxX && pos.z > B.minZ && pos.z < B.maxZ;
}
