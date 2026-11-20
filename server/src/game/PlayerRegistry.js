// 접속 중인 플레이어 (메모리) + 이동 검증 + 변경분 스냅샷
import {
  WORLD_BOUNDS, MAX_MOVE_SPEED, SPAWN, ACTIONS,
} from '../../../client/js/shared/protocol.js';
import {
  MAPS, mapBounds, towerSupport, RISE_LIMIT, RISE_LIMIT_PAD,
} from '../../../client/js/shared/towerLayout.js';

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

  /**
   * @param {string} socketId
   * @param {object} user 캐릭터
   * @param {number} now
   * @param {{accountId?:number, username?:string, admin?:boolean}} account
   */
  add(socketId, user, now = Date.now(), account = {}) {
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
      accountId: account.accountId ?? null,
      username: account.username ?? null,
      admin: !!account.admin,
      attackAt: {},
      hitLog: [],
      downUntil: 0,
      knockbackUntil: 0,
      map: MAPS.GYM, // 'gym' | 'tower' (서버만 바꿈 — 포탈/나가기)
      baseY: 0, // 타워: 마지막으로 확인된 바닥 높이 (날기 방지)
      riseLimit: RISE_LIMIT,
      lastDy: 0,
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

  listByAccount(accountId) {
    return this.list().filter((p) => p.accountId === accountId);
  }

  /** 다른 클라이언트에 보낼 공개 정보 */
  static info(p) {
    return {
      id: p.id,
      nickname: p.nickname,
      appearance: p.appearance,
      bodyStats: p.bodyStats,
      level: p.level,
      admin: p.admin,
      npc: !!p.npc,
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
    // 넉백 직후에는 날아가는 속도를 고려해 여유를 더 줌
    const boost = now < player.knockbackUntil ? 2 : 1;
    // +1.5m: 기구에 앉거나 내려올 때 자리로 옮겨지는 거리 허용
    const allowed = MAX_MOVE_SPEED * 1.5 * boost * dt + 1.5;
    const dist = Math.hypot(x - player.x, z - player.z);
    player.lastMoveAt = now;
    if (dist > allowed) return 'corrected';

    const B = mapBounds(player.map);
    x = Math.min(B.maxX - RADIUS, Math.max(B.minX + RADIUS, x));
    z = Math.min(B.maxZ - RADIUS, Math.max(B.minZ + RADIUS, z));
    y = Math.min(B.maxY, Math.max(0, y));
    r = Math.atan2(Math.sin(r), Math.cos(r));
    a = Number.isInteger(a) && a >= 0 && a < ACTIONS.length ? a : 0;

    // 타워: 받쳐주는 발판 없이 점프 높이 이상 올라가면 "날기" 로 보고 되돌림
    if (player.map === MAPS.TOWER && !this._towerHeightOk(player, x, y, z)) return 'corrected';

    if (x !== player.x || y !== player.y || z !== player.z || r !== player.r || a !== player.a) {
      Object.assign(player, { x, y, z, r, a });
      player.dirty = true;
    }
    return 'ok';
  }

  /**
   * 타워 높이 검증
   * - 발판 위(윗면 ±0.15)에 있으면 그 높이를 기준(baseY)으로 기억
   * - 올라가다가 다시 내려오는 순간(최저점)이 발판 근처면 그 발판을 기준으로 (바로 다시 점프한 경우)
   * - 기준보다 RISE_LIMIT(점프대는 RISE_LIMIT_PAD) 넘게 높으면 비정상
   */
  _towerHeightOk(player, x, y, z) {
    const dy = y - player.y;
    const here = towerSupport(x, y, z);
    if (here) {
      player.baseY = here.top;
      player.riseLimit = here.pad ? RISE_LIMIT_PAD : RISE_LIMIT;
    } else if (dy > 0 && player.lastDy < 0) {
      // 직전 위치가 최저점 → 착지했다가 바로 뛴 경우. 직전 위치 근처 발판을 기준으로
      const low = towerSupport(player.x, player.y, player.z, 0.5);
      if (low) {
        player.baseY = low.top;
        player.riseLimit = low.pad ? RISE_LIMIT_PAD : RISE_LIMIT;
      }
    }
    if (y - player.baseY > player.riseLimit) return false;
    if (dy !== 0) player.lastDy = dy;
    return true;
  }

  /** 서버가 직접 위치를 옮김 (포탈 이동 / 체크포인트로 되돌리기) */
  place(player, { x, y = 0, z, r }, map = player.map, now = Date.now()) {
    player.map = map;
    player.x = x;
    player.y = y;
    player.z = z;
    if (r !== undefined) player.r = r;
    player.a = 0;
    player.baseY = y;
    player.riseLimit = RISE_LIMIT;
    player.lastDy = 0;
    player.lastMoveAt = now;
    player.dirty = true;
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
