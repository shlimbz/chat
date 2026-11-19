// 사용자 계정 (닉네임 + 재접속 토큰)
// - 처음 접속: 닉네임이 비어 있으면 계정을 만들고 비밀 토큰을 발급 (토큰 원문은 저장하지 않고 해시만 저장)
// - 재접속: 토큰으로만 본인 확인 → 닉네임만 알아서는 다른 사람을 사칭할 수 없음
import crypto from 'node:crypto';
import { sanitizeAppearance, sanitizeBodyStats, validateNickname } from '../../../client/js/shared/appearance.js';

export const hashToken = (token) => crypto.createHash('sha256').update(String(token)).digest('hex');

function rowToUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    nickname: row.nickname,
    appearance: sanitizeAppearance(safeJson(row.appearance)),
    bodyStats: sanitizeBodyStats(safeJson(row.body_stats)),
    level: row.level,
    exp: row.exp,
    lastPos: row.last_x == null ? null : { x: row.last_x, z: row.last_z, r: row.last_r ?? 0 },
  };
}

function safeJson(s) {
  try { return s ? JSON.parse(s) : null; } catch { return null; }
}

export class UserService {
  constructor(db) {
    this.db = db;
    this.q = {
      byToken: db.prepare('SELECT * FROM users WHERE token_hash = ?'),
      byNick: db.prepare('SELECT * FROM users WHERE nickname = ?'),
      byId: db.prepare('SELECT * FROM users WHERE id = ?'),
      insert: db.prepare('INSERT INTO users (nickname, token_hash, appearance, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?)'),
      setAppearance: db.prepare('UPDATE users SET appearance = ? WHERE id = ?'),
      setLastSeen: db.prepare('UPDATE users SET last_seen_at = ?, last_x = ?, last_z = ?, last_r = ? WHERE id = ?'),
    };
  }

  findByToken(token) {
    if (typeof token !== 'string' || token.length < 16 || token.length > 128) return null;
    return rowToUser(this.q.byToken.get(hashToken(token)));
  }

  findByNickname(nickname) {
    return rowToUser(this.q.byNick.get(String(nickname)));
  }

  findById(id) {
    return rowToUser(this.q.byId.get(Number(id)));
  }

  /**
   * @returns {{ok:true,user:object,token:string}|{ok:false,error:'NICK_INVALID'|'NICK_TAKEN'}}
   */
  register(nickname, appearance) {
    const nick = validateNickname(nickname);
    if (!nick.ok) return { ok: false, error: 'NICK_INVALID' };
    if (this.q.byNick.get(nick.value)) return { ok: false, error: 'NICK_TAKEN' };
    const token = crypto.randomBytes(24).toString('base64url');
    const now = Date.now();
    try {
      const res = this.q.insert.run(nick.value, hashToken(token), JSON.stringify(sanitizeAppearance(appearance)), now, now);
      return { ok: true, user: this.findById(res.lastInsertRowid), token };
    } catch (err) {
      // 동시에 같은 닉네임으로 가입하는 경우 (UNIQUE 제약)
      if (String(err.message).includes('UNIQUE')) return { ok: false, error: 'NICK_TAKEN' };
      throw err;
    }
  }

  updateAppearance(userId, appearance) {
    const clean = sanitizeAppearance(appearance);
    this.q.setAppearance.run(JSON.stringify(clean), userId);
    return clean;
  }

  saveLastSeen(userId, pos) {
    this.q.setLastSeen.run(Date.now(), pos?.x ?? null, pos?.z ?? null, pos?.r ?? null, userId);
  }
}
