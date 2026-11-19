// 캐릭터 (계정 하나에 최대 MAX_CHARACTERS 개)
// DB 테이블 이름은 호환을 위해 users 그대로 사용합니다. (users = 캐릭터)
import crypto from 'node:crypto';
import { sanitizeAppearance, sanitizeBodyStats, validateNickname } from '../../../client/js/shared/appearance.js';
import { MAX_CHARACTERS } from '../../../client/js/shared/protocol.js';

/** 예전 버전(계정 없이 닉네임+토큰) 캐릭터 토큰 해시 */
export const hashToken = (token) => crypto.createHash('sha256').update(String(token)).digest('hex');

export const DELETED_PREFIX = '__deleted_';
export const displayNickname = (n) => (typeof n === 'string' && n.startsWith(DELETED_PREFIX) ? '(삭제된 캐릭터)' : n);

function rowToCharacter(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    accountId: row.account_id == null ? null : Number(row.account_id),
    nickname: row.nickname,
    // 보유 여부는 접속할 때 계정 지갑 기준으로 다시 확인합니다.
    appearance: sanitizeAppearance(safeJson(row.appearance), { ownedItems: null }),
    bodyStats: sanitizeBodyStats(safeJson(row.body_stats)),
    level: Number(row.level),
    exp: Number(row.exp),
    lastPos: row.last_x == null ? null : { x: Number(row.last_x), z: Number(row.last_z), r: Number(row.last_r ?? 0) },
  };
}

function safeJson(s) {
  try { return s ? JSON.parse(s) : null; } catch { return null; }
}

/** 클라이언트에 보낼 캐릭터 요약 */
export const characterSummary = (c) => ({ id: c.id, nickname: c.nickname, appearance: c.appearance, level: c.level });

export class CharacterService {
  constructor(db) {
    this.db = db;
  }

  async findById(id) {
    return rowToCharacter(await this.db.get('SELECT * FROM users WHERE id = ? AND deleted_at IS NULL', [Number(id)]));
  }

  async findByNickname(nickname) {
    if (typeof nickname !== 'string' || nickname.length > 40) return null;
    return rowToCharacter(await this.db.get('SELECT * FROM users WHERE nickname = ? AND deleted_at IS NULL', [nickname]));
  }

  async listByAccount(accountId) {
    const rows = await this.db.all('SELECT * FROM users WHERE account_id = ? AND deleted_at IS NULL ORDER BY id', [accountId]);
    return rows.map(rowToCharacter);
  }

  /** 이 계정의 캐릭터인지 확인 후 반환 */
  async findOwned(accountId, characterId) {
    const c = await this.findById(characterId);
    return c && c.accountId === accountId ? c : null;
  }

  /** @returns {Promise<{ok:true, character}|{ok:false, error:string}>} */
  async create(accountId, nickname, appearance) {
    const nick = validateNickname(nickname);
    if (!nick.ok) return { ok: false, error: nick.error };
    const list = await this.listByAccount(accountId);
    if (list.length >= MAX_CHARACTERS) return { ok: false, error: `캐릭터는 계정당 최대 ${MAX_CHARACTERS}개까지 만들 수 있습니다.` };
    if (await this.db.get('SELECT id FROM users WHERE nickname = ?', [nick.value])) {
      return { ok: false, error: '이미 사용 중인 닉네임입니다.' };
    }
    const now = Date.now();
    try {
      const res = await this.db.run(
        'INSERT INTO users (nickname, token_hash, appearance, account_id, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?)',
        [nick.value, `acct_${crypto.randomBytes(16).toString('hex')}`, JSON.stringify(sanitizeAppearance(appearance)), accountId, now, now],
      );
      return { ok: true, character: await this.findById(res.lastInsertRowid) };
    } catch (err) {
      if (String(err.message).includes('UNIQUE')) return { ok: false, error: '이미 사용 중인 닉네임입니다.' };
      throw err;
    }
  }

  /** 캐릭터 삭제 (채팅 기록 보존을 위해 실제 행은 남기고 닉네임을 비움) */
  async softDelete(characterId) {
    await this.db.run(
      `UPDATE users SET deleted_at = ?, nickname = '${DELETED_PREFIX}' || id, account_id = NULL WHERE id = ? AND deleted_at IS NULL`,
      [Date.now(), characterId],
    );
  }

  /**
   * 예전 버전에서 만든 캐릭터(브라우저에 토큰 저장) 를 계정으로 가져오기
   * @returns {Promise<object|null>} 가져온 캐릭터
   */
  async claimLegacy(accountId, token) {
    if (typeof token !== 'string' || token.length < 16 || token.length > 128) return null;
    const row = await this.db.get('SELECT * FROM users WHERE token_hash = ? AND account_id IS NULL AND deleted_at IS NULL', [hashToken(token)]);
    if (!row) return null;
    const list = await this.listByAccount(accountId);
    if (list.length >= MAX_CHARACTERS) return null;
    await this.db.run('UPDATE users SET account_id = ? WHERE id = ? AND account_id IS NULL', [accountId, row.id]);
    return this.findById(row.id);
  }

  async updateAppearance(characterId, appearance, ownedItems = []) {
    const clean = sanitizeAppearance(appearance, { ownedItems });
    await this.db.run('UPDATE users SET appearance = ? WHERE id = ?', [JSON.stringify(clean), characterId]);
    return clean;
  }

  async saveLastSeen(characterId, pos) {
    await this.db.run(
      'UPDATE users SET last_seen_at = ?, last_x = ?, last_z = ?, last_r = ? WHERE id = ?',
      [Date.now(), pos?.x ?? null, pos?.z ?? null, pos?.r ?? null, characterId],
    );
  }
}
