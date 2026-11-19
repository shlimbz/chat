// 채팅 저장/조회 + 명령어 해석
// 저장 항목: 발신자 ID, 수신자 ID, 메시지, 전송 시각, 메시지 유형
import { CHAT_MAX_LENGTH, CHAT_PAGE_SIZE, CHAT_TYPES } from '../../../client/js/shared/protocol.js';
import { displayNickname } from './CharacterService.js';

/** 제어문자 제거, 공백 정리, 길이 제한 */
export function cleanText(raw) {
  if (typeof raw !== 'string') return '';
  // eslint-disable-next-line no-control-regex
  return raw.replace(/[\u0000-\u001f\u007f\u200b-\u200f\u2028\u2029]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, CHAT_MAX_LENGTH);
}

/**
 * 채팅 입력 해석 (마인크래프트 방식 명령어)
 * @returns {{kind:'global'|'whisper'|'reply'|'help'|'who'|'empty'|'error'|'admin', [k:string]:any}}
 */
export function parseChatInput(raw) {
  const text = cleanText(raw);
  if (!text) return { kind: 'empty' };
  if (!text.startsWith('/')) return { kind: 'global', text };

  const [cmdRaw, ...rest] = text.split(' ');
  const cmd = cmdRaw.toLowerCase();
  switch (cmd) {
    case '/help':
    case '/?':
      return { kind: 'help' };
    case '/who':
    case '/list':
      return { kind: 'who' };
    case '/w':
    case '/msg':
    case '/tell': {
      const [target, ...words] = rest;
      const body = words.join(' ').trim();
      if (!target || !body) return { kind: 'error', error: `사용법: ${cmd} 닉네임 메시지` };
      return { kind: 'whisper', target, text: body };
    }
    case '/r': {
      const body = rest.join(' ').trim();
      if (!body) return { kind: 'error', error: '사용법: /r 메시지 (마지막 귓속말 상대에게 답장)' };
      return { kind: 'reply', text: body };
    }
    // ── 관리자 명령어 (권한 확인은 서버 처리부에서) ──
    case '/kick':
    case '/ban':
    case '/delchar': {
      const [target, ...why] = rest;
      if (!target) return { kind: 'error', error: `사용법: ${cmd} 닉네임${cmd === '/delchar' ? '' : ' [사유]'}` };
      return { kind: 'admin', action: cmd.slice(1), target, reason: why.join(' ').trim() || null };
    }
    case '/unban':
    case '/deluser': {
      const [target] = rest;
      if (!target) return { kind: 'error', error: `사용법: ${cmd} 계정아이디` };
      return { kind: 'admin', action: cmd.slice(1), target };
    }
    case '/mute': {
      const [target, mins] = rest;
      if (!target) return { kind: 'error', error: '사용법: /mute 닉네임 [분, 기본 10]' };
      const minutes = Math.min(1440, Math.max(1, Number.parseInt(mins, 10) || 10));
      return { kind: 'admin', action: 'mute', target, minutes };
    }
    case '/unmute': {
      const [target] = rest;
      if (!target) return { kind: 'error', error: '사용법: /unmute 닉네임' };
      return { kind: 'admin', action: 'unmute', target };
    }
    case '/notice':
    case '/공지': {
      const body = rest.join(' ').trim();
      if (!body) return { kind: 'error', error: '사용법: /notice 공지내용' };
      return { kind: 'admin', action: 'notice', text: body };
    }
    default:
      return { kind: 'error', error: `알 수 없는 명령어입니다: ${cmd} (/help 로 목록 확인)` };
  }
}

export const HELP_TEXT = [
  '채팅 명령어',
  '/w 닉네임 메시지 — 귓속말 (/msg, /tell 도 가능)',
  '/r 메시지 — 마지막 귓속말 상대에게 답장',
  '/who — 현재 접속자 목록',
  '/help — 명령어 안내',
  '채팅창의 닉네임을 클릭하면 귓속말을 시작합니다.',
];

export const ADMIN_HELP_TEXT = [
  '관리자 명령어',
  '/kick 닉네임 [사유] — 추방 (다시 접속 가능)',
  '/ban 닉네임 [사유] — 그 캐릭터의 계정 이용 제한 + 추방',
  '/unban 계정아이디 — 이용 제한 해제',
  '/mute 닉네임 [분] — 채팅 금지 (기본 10분) · /unmute 닉네임',
  '/notice 내용 — 전체 공지',
  '/delchar 닉네임 — 캐릭터 삭제 · /deluser 계정아이디 — 계정 삭제',
];

const SELECT = `SELECT m.id, m.type, m.message, m.created_at, m.sender_id, m.receiver_id,
                        s.nickname AS sender, r.nickname AS receiver
                 FROM chat_messages m
                 JOIN users s ON s.id = m.sender_id
                 LEFT JOIN users r ON r.id = m.receiver_id`;

export class ChatService {
  /** @param {Awaited<ReturnType<import('../db.js').openDatabase>>} db */
  constructor(db) {
    this.db = db;
  }

  static toDto(row) {
    return {
      id: Number(row.id),
      type: row.type,
      from: displayNickname(row.sender),
      to: row.receiver ? displayNickname(row.receiver) : null,
      text: row.message,
      time: Number(row.created_at),
    };
  }

  static system(text) {
    return { id: null, type: CHAT_TYPES.SYSTEM, from: null, to: null, text, time: Date.now() };
  }

  /** 관리자 공지 (저장하지 않음) */
  static notice(from, text) {
    return { id: null, type: CHAT_TYPES.NOTICE, from, to: null, text, time: Date.now() };
  }

  /**
   * 메시지 저장 (DB 왕복 1회: INSERT ... RETURNING)
   * @param {{id:number,nickname:string}} sender
   * @param {{id:number,nickname:string}|null} receiver
   */
  async _save(type, sender, receiver, text) {
    const now = Date.now();
    const row = await this.db.get(
      'INSERT INTO chat_messages (type, sender_id, receiver_id, message, created_at) VALUES (?, ?, ?, ?, ?) RETURNING id',
      [type, sender.id, receiver ? receiver.id : null, text, now],
    );
    return {
      id: Number(row.id), type, from: sender.nickname, to: receiver ? receiver.nickname : null, text, time: now, admin: !!sender.admin,
    };
  }

  saveGlobal(sender, text) {
    return this._save(CHAT_TYPES.GLOBAL, sender, null, text);
  }

  saveWhisper(sender, receiver, text) {
    return this._save(CHAT_TYPES.WHISPER, sender, receiver, text);
  }

  async globalHistory(beforeId, limit = CHAT_PAGE_SIZE) {
    const rows = await this.db.all(
      `${SELECT} WHERE m.type = 'global' AND m.id < ? ORDER BY m.id DESC LIMIT ?`,
      [toId(beforeId), clampLimit(limit)],
    );
    return rows.reverse().map(ChatService.toDto);
  }

  /** 접속 직후 보여줄 기록: 최근 전체 채팅 + 본인 관련 최근 귓속말 (id 순 정렬) */
  async initialHistory(userId, limit = CHAT_PAGE_SIZE) {
    const [global, whisperRows] = await Promise.all([
      this.globalHistory(undefined, limit),
      this.db.all(
        `${SELECT} WHERE m.type = 'whisper' AND (m.sender_id = ? OR m.receiver_id = ?) ORDER BY m.id DESC LIMIT 30`,
        [userId, userId],
      ),
    ]);
    return [...global, ...whisperRows.map(ChatService.toDto)].sort((a, b) => a.id - b.id);
  }

  async whisperPartners(userId) {
    const rows = await this.db.all(
      `SELECT u.nickname AS nickname, MAX(m.id) AS lastId
       FROM chat_messages m
       JOIN users u ON u.id = CASE WHEN m.sender_id = ? THEN m.receiver_id ELSE m.sender_id END
       WHERE m.type = 'whisper' AND (m.sender_id = ? OR m.receiver_id = ?)
       GROUP BY u.id ORDER BY lastId DESC LIMIT 50`,
      [userId, userId, userId],
    );
    return rows.filter((r) => !String(r.nickname).startsWith('__deleted_')).map((r) => ({ nickname: r.nickname, lastId: Number(r.lastId) }));
  }

  async whispersBetween(userId, otherId, beforeId, limit = CHAT_PAGE_SIZE) {
    const rows = await this.db.all(
      `${SELECT} WHERE m.type = 'whisper'
         AND ((m.sender_id = ? AND m.receiver_id = ?) OR (m.sender_id = ? AND m.receiver_id = ?))
         AND m.id < ? ORDER BY m.id DESC LIMIT ?`,
      [userId, otherId, otherId, userId, toId(beforeId), clampLimit(limit)],
    );
    return rows.reverse().map(ChatService.toDto);
  }
}

// 정수 범위 안의 큰 값 (SQLite 정수로 안전하게 전달)
const toId = (v) => (Number.isInteger(v) && v > 0 ? v : 2147483647);
const clampLimit = (v) => Math.min(CHAT_PAGE_SIZE, Math.max(1, Number(v) || CHAT_PAGE_SIZE));

/** 사용자별 채팅 도배 방지 */
export class RateLimiter {
  constructor(max, windowMs) {
    this.max = max;
    this.windowMs = windowMs;
    this.hits = new Map();
  }

  allow(key, now = Date.now()) {
    const list = (this.hits.get(key) || []).filter((t) => now - t < this.windowMs);
    if (list.length >= this.max) {
      this.hits.set(key, list);
      return false;
    }
    list.push(now);
    this.hits.set(key, list);
    return true;
  }

  forget(key) {
    this.hits.delete(key);
  }
}
