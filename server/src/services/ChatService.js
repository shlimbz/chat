// 채팅 저장/조회 + 명령어 해석
// 저장 항목: 발신자 ID, 수신자 ID, 메시지, 전송 시각, 메시지 유형
import { CHAT_MAX_LENGTH, CHAT_PAGE_SIZE, CHAT_TYPES } from '../../../client/js/shared/protocol.js';

/** 제어문자 제거, 공백 정리, 길이 제한 */
export function cleanText(raw) {
  if (typeof raw !== 'string') return '';
  // eslint-disable-next-line no-control-regex
  return raw.replace(/[\u0000-\u001f\u007f\u200b-\u200f\u2028\u2029]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, CHAT_MAX_LENGTH);
}

/**
 * 채팅 입력 해석 (마인크래프트 방식 명령어)
 * @returns {{kind:'global',text:string}|{kind:'whisper',target:string,text:string}|{kind:'reply',text:string}|{kind:'help'}|{kind:'who'}|{kind:'empty'}|{kind:'error',error:string}}
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

export class ChatService {
  constructor(db) {
    this.db = db;
    const select = `SELECT m.id, m.type, m.message, m.created_at, m.sender_id, m.receiver_id,
                           s.nickname AS sender, r.nickname AS receiver
                    FROM chat_messages m
                    JOIN users s ON s.id = m.sender_id
                    LEFT JOIN users r ON r.id = m.receiver_id`;
    this.q = {
      insert: db.prepare('INSERT INTO chat_messages (type, sender_id, receiver_id, message, created_at) VALUES (?, ?, ?, ?, ?)'),
      byId: db.prepare(`${select} WHERE m.id = ?`),
      globalBefore: db.prepare(`${select} WHERE m.type = 'global' AND m.id < ? ORDER BY m.id DESC LIMIT ?`),
      whispersOf: db.prepare(`${select} WHERE m.type = 'whisper' AND (m.sender_id = ? OR m.receiver_id = ?) AND m.id < ? ORDER BY m.id DESC LIMIT ?`),
      whispersBetween: db.prepare(`${select} WHERE m.type = 'whisper'
        AND ((m.sender_id = ? AND m.receiver_id = ?) OR (m.sender_id = ? AND m.receiver_id = ?))
        AND m.id < ? ORDER BY m.id DESC LIMIT ?`),
      partners: db.prepare(`SELECT u.nickname AS nickname, MAX(m.id) AS lastId
        FROM chat_messages m
        JOIN users u ON u.id = CASE WHEN m.sender_id = ? THEN m.receiver_id ELSE m.sender_id END
        WHERE m.type = 'whisper' AND (m.sender_id = ? OR m.receiver_id = ?)
        GROUP BY u.id ORDER BY lastId DESC LIMIT 50`),
    };
  }

  static toDto(row) {
    return {
      id: row.id,
      type: row.type,
      from: row.sender,
      to: row.receiver || null,
      text: row.message,
      time: row.created_at,
    };
  }

  static system(text) {
    return { id: null, type: CHAT_TYPES.SYSTEM, from: null, to: null, text, time: Date.now() };
  }

  saveGlobal(senderId, text) {
    const res = this.q.insert.run(CHAT_TYPES.GLOBAL, senderId, null, text, Date.now());
    return ChatService.toDto(this.q.byId.get(res.lastInsertRowid));
  }

  saveWhisper(senderId, receiverId, text) {
    const res = this.q.insert.run(CHAT_TYPES.WHISPER, senderId, receiverId, text, Date.now());
    return ChatService.toDto(this.q.byId.get(res.lastInsertRowid));
  }

  globalHistory(beforeId = Number.MAX_SAFE_INTEGER, limit = CHAT_PAGE_SIZE) {
    return this.q.globalBefore.all(toId(beforeId), clampLimit(limit)).reverse().map(ChatService.toDto);
  }

  /** 접속 직후 보여줄 기록: 최근 전체 채팅 + 본인 관련 최근 귓속말 (id 순 정렬) */
  initialHistory(userId, limit = CHAT_PAGE_SIZE) {
    const global = this.globalHistory(Number.MAX_SAFE_INTEGER, limit);
    const whispers = this.q.whispersOf.all(userId, userId, Number.MAX_SAFE_INTEGER, 30).map(ChatService.toDto);
    return [...global, ...whispers].sort((a, b) => a.id - b.id);
  }

  whisperPartners(userId) {
    return this.q.partners.all(userId, userId, userId).map((r) => ({ nickname: r.nickname, lastId: r.lastId }));
  }

  whispersBetween(userId, otherId, beforeId = Number.MAX_SAFE_INTEGER, limit = CHAT_PAGE_SIZE) {
    return this.q.whispersBetween
      .all(userId, otherId, otherId, userId, toId(beforeId), clampLimit(limit))
      .reverse()
      .map(ChatService.toDto);
  }
}

const toId = (v) => (Number.isInteger(v) && v > 0 ? v : Number.MAX_SAFE_INTEGER);
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
