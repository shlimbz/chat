// 계정 (아이디 + 비밀번호) 과 로그인 세션
// - 비밀번호는 scrypt 로 해시해서 저장 (원문 저장 안 함)
// - 로그인하면 30일짜리 세션 토큰 발급 → 브라우저가 보관 → 자동 로그인
// - 관리자: 환경 변수 ADMIN_USERNAMES 에 적힌 아이디 (또는 DB role='admin')
import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { validateUsername, validatePassword } from '../../../client/js/shared/protocol.js';
import { ECONOMY } from '../../../client/js/shared/economy.js';

const scrypt = promisify(crypto.scrypt);
const SESSION_DAYS = 30;
const SCRYPT_N = 16384;

export const hashSessionToken = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password, salt, 32, { N: SCRYPT_N, r: 8, p: 1 });
  return `scrypt$${SCRYPT_N}$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password, stored) {
  const [algo, n, saltB64, keyB64] = String(stored).split('$');
  if (algo !== 'scrypt') return false;
  const expected = Buffer.from(keyB64, 'base64');
  const key = await scrypt(String(password), Buffer.from(saltB64, 'base64'), expected.length, { N: Number(n), r: 8, p: 1 });
  return crypto.timingSafeEqual(key, expected);
}

function parseItems(s) {
  try {
    const v = JSON.parse(s || '[]');
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export class AccountService {
  /**
   * @param {object} db
   * @param {{adminUsernames?: string[]}} opts
   */
  constructor(db, { adminUsernames = [], reservedUsernames = [] } = {}) {
    this.db = db;
    this.admins = new Set(adminUsernames.map((u) => u.toLowerCase()));
    // 일반 가입으로는 만들 수 없는 아이디 (환경 변수로 만드는 관리자 계정)
    this.reserved = new Set(reservedUsernames.map((u) => u.toLowerCase()));
  }

  /**
   * 관리자 계정 준비: 없으면 만들고, 있으면 비밀번호·권한을 환경 변수 값으로 맞춤
   * @returns {Promise<{ok:boolean, created?:boolean, error?:string}>}
   */
  async ensureAdmin(username, password) {
    const u = validateUsername(username);
    if (!u.ok) return { ok: false, error: `ADMIN_USERNAME: ${u.error}` };
    const p = validatePassword(password);
    if (!p.ok) return { ok: false, error: `ADMIN_PASSWORD: ${p.error}` };
    const hash = await hashPassword(password);
    const row = await this.db.get('SELECT id FROM accounts WHERE username = ?', [u.value]);
    if (row) {
      await this.db.run("UPDATE accounts SET password_hash = ?, role = 'admin', banned = 0, ban_reason = NULL WHERE id = ?", [hash, row.id]);
      return { ok: true, created: false };
    }
    await this.db.run(
      "INSERT INTO accounts (username, password_hash, role, created_at) VALUES (?, ?, 'admin', ?)",
      [u.value, hash, Date.now()],
    );
    return { ok: true, created: true };
  }

  /** 만료된 로그인 세션 정리 */
  async cleanupSessions() {
    const r = await this.db.run('DELETE FROM sessions WHERE expires_at < ?', [Date.now()]);
    return r.changes;
  }

  _toAccount(row) {
    if (!row) return null;
    return {
      id: Number(row.id),
      username: row.username,
      isAdmin: row.role === 'admin' || this.admins.has(String(row.username).toLowerCase()),
      banned: Number(row.banned) === 1,
      banReason: row.ban_reason || null,
      coins: Number(row.coins ?? 0),
      items: parseItems(row.items),
    };
  }

  async findByUsername(username) {
    if (typeof username !== 'string' || username.length > 32) return null;
    return this._toAccount(await this.db.get('SELECT * FROM accounts WHERE username = ?', [username]));
  }

  async findById(id) {
    return this._toAccount(await this.db.get('SELECT * FROM accounts WHERE id = ?', [Number(id)]));
  }

  /** @returns {Promise<{ok:true, account, token}|{ok:false, error:string}>} */
  async register(username, password) {
    const u = validateUsername(username);
    if (!u.ok) return { ok: false, error: u.error };
    const p = validatePassword(password);
    if (!p.ok) return { ok: false, error: p.error };
    if (this.reserved.has(u.value.toLowerCase())) return { ok: false, error: '사용할 수 없는 아이디입니다.' };
    if (await this.db.get('SELECT id FROM accounts WHERE username = ?', [u.value])) {
      return { ok: false, error: '이미 사용 중인 아이디입니다.' };
    }
    const hash = await hashPassword(password);
    try {
      const res = await this.db.run(
        'INSERT INTO accounts (username, password_hash, created_at, last_login_at, coins) VALUES (?, ?, ?, ?, ?)',
        [u.value, hash, Date.now(), Date.now(), ECONOMY.STARTING_COINS],
      );
      const account = await this.findById(res.lastInsertRowid);
      return { ok: true, account, token: await this._createSession(account.id) };
    } catch (err) {
      if (String(err.message).includes('UNIQUE')) return { ok: false, error: '이미 사용 중인 아이디입니다.' };
      throw err;
    }
  }

  async login(username, password) {
    const row = typeof username === 'string' && username.length <= 32
      ? await this.db.get('SELECT * FROM accounts WHERE username = ?', [username.trim()])
      : null;
    // 아이디가 없어도 같은 시간이 걸리도록 더미 검증 (아이디 존재 여부 추측 방지)
    const ok = row ? await verifyPassword(password, row.password_hash) : (await hashPassword('dummy-password'), false);
    if (!row || !ok) return { ok: false, error: '아이디 또는 비밀번호가 올바르지 않습니다.' };
    const account = this._toAccount(row);
    if (account.banned) return { ok: false, error: `이용이 제한된 계정입니다.${account.banReason ? ` (사유: ${account.banReason})` : ''}`, code: 'BANNED' };
    await this.db.run('UPDATE accounts SET last_login_at = ? WHERE id = ?', [Date.now(), account.id]);
    return { ok: true, account, token: await this._createSession(account.id) };
  }

  async _createSession(accountId) {
    const token = crypto.randomBytes(32).toString('base64url');
    const now = Date.now();
    await this.db.run(
      'INSERT INTO sessions (token_hash, account_id, created_at, expires_at) VALUES (?, ?, ?, ?)',
      [hashSessionToken(token), accountId, now, now + SESSION_DAYS * 86400000],
    );
    return token;
  }

  /** 세션 토큰 → 계정 (만료/차단이면 null) */
  async fromSession(token) {
    if (typeof token !== 'string' || token.length < 20 || token.length > 128) return null;
    const row = await this.db.get(
      `SELECT a.* FROM sessions s JOIN accounts a ON a.id = s.account_id
       WHERE s.token_hash = ? AND s.expires_at > ?`,
      [hashSessionToken(token), Date.now()],
    );
    return this._toAccount(row);
  }

  async logout(token) {
    if (typeof token === 'string') await this.db.run('DELETE FROM sessions WHERE token_hash = ?', [hashSessionToken(token)]);
  }

  // ── 관리자 기능 ───────────────────────────────────────
  async setBanned(accountId, banned, reason = null) {
    await this.db.run('UPDATE accounts SET banned = ?, ban_reason = ? WHERE id = ?', [banned ? 1 : 0, banned ? reason : null, accountId]);
    if (banned) await this.db.run('DELETE FROM sessions WHERE account_id = ?', [accountId]);
  }

  /** 계정 삭제: 캐릭터는 삭제 처리, 세션 삭제, 계정 행 삭제 */
  async deleteAccount(accountId) {
    const now = Date.now();
    await this.db.run(
      "UPDATE users SET deleted_at = ?, nickname = '__deleted_' || id, token_hash = 'deleted_' || id, account_id = NULL WHERE account_id = ?",
      [now, accountId],
    );
    await this.db.run('DELETE FROM sessions WHERE account_id = ?', [accountId]);
    await this.db.run('DELETE FROM accounts WHERE id = ?', [accountId]);
  }
}
