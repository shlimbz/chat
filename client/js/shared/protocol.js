// 클라이언트 ↔ 서버 통신 규약 (양쪽이 같은 파일을 import)
// 이벤트 이름과 값의 범위를 한곳에서 관리합니다.

export const PROTOCOL_VERSION = 3;

export const EV = {
  // 서버 → 클라이언트
  WELCOME: 'welcome', // { self, players, chat, serverTime, maxPlayers }
  PLAYER_JOIN: 'player:join', // PlayerInfo
  PLAYER_LEAVE: 'player:leave', // { id }
  PLAYER_APPEARANCE: 'player:appearance', // { id, appearance }
  STATE: 'state', // { t: 서버시각(ms), p: [ [id, x, y, z, r, actionIndex], ... ] }
  CORRECT: 'correct', // { x, y, z }  서버가 위치를 되돌릴 때
  KICKED: 'kicked', // { reason }
  CHAT: 'chat', // ChatMessage
  ATTACK_FX: 'attack:fx', // { id, type }  다른 사람이 공격 모션을 함
  HIT: 'hit', // { from, to, type, kx, kz, down }  누가 누구를 맞혔는지
  // 클라이언트 → 서버
  MOVE: 'move', // [x, y, z, r, actionIndex]
  ATTACK: 'attack', // 'punch' | 'kick'
  SET_APPEARANCE: 'appearance:set', // appearance
  CHAT_SEND: 'chat:send', // text  (명령어 포함, 서버가 해석)
  CHAT_HISTORY: 'chat:history', // { beforeId } → ack(ChatMessage[])
  CHAT_PARTNERS: 'chat:partners', // → ack([{ nickname, lastId }])
  CHAT_WHISPERS: 'chat:whispers', // { nickname, beforeId } → ack(ChatMessage[])
  ADMIN_ACTION: 'admin:action', // { action, target, reason?, minutes? } → ack({ ok, message })
  PING: 'net:ping', // 클라이언트 시각 → ack(같은 값)  (핑 측정)
};

// 접속 거부 사유 (connect_error 의 message)
export const AUTH_ERRORS = {
  SESSION_INVALID: 'SESSION_INVALID',
  CHARACTER_INVALID: 'CHARACTER_INVALID',
  BANNED: 'BANNED',
  SERVER_FULL: 'SERVER_FULL',
  BAD_VERSION: 'BAD_VERSION',
};

export const AUTH_ERROR_TEXT = {
  SESSION_INVALID: '로그인이 만료되었습니다. 다시 로그인해 주세요.',
  CHARACTER_INVALID: '선택한 캐릭터를 찾을 수 없습니다.',
  BANNED: '이 계정은 관리자에 의해 이용이 제한되었습니다.',
  SERVER_FULL: '헬스장이 가득 찼습니다 (최대 인원 초과). 잠시 후 다시 시도해 주세요.',
  BAD_VERSION: '게임 버전이 서버와 다릅니다. 새로고침(Ctrl+Shift+R) 해주세요.',
};

// 동작 상태 → 숫자로 전송해 데이터량 절감 (앉기·기구 운동 포함)
export const ACTIONS = ['idle', 'walk', 'run', 'jump', 'sit', 'ex_tread', 'ex_bench', 'ex_curl', 'ex_legpress', 'ex_shoulder', 'ex_lat'];
export const actionToIndex = (a) => Math.max(0, ACTIONS.indexOf(a));
export const indexToAction = (i) => ACTIONS[i] || 'idle';

// 위치 검증용 수치 (서버)
export const WORLD_BOUNDS = { minX: -16, maxX: 16, minZ: -12, maxZ: 12, maxY: 3.5 };
export const MAX_MOVE_SPEED = 6.0; // 클라이언트 RUN_SPEED 와 같아야 함
export const SPAWN = { x: 0, y: 0, z: 8, r: Math.PI };

// 네트워크 주기
export const CLIENT_SEND_HZ = 12;
export const SERVER_TICK_HZ = 12;

// 채팅
export const CHAT_MAX_LENGTH = 200;
export const CHAT_PAGE_SIZE = 50;
export const CHAT_TYPES = { GLOBAL: 'global', WHISPER: 'whisper', SYSTEM: 'system', NOTICE: 'notice' };

// 계정
export const MAX_CHARACTERS = 3;
export const USERNAME_RE = /^[a-zA-Z0-9_]{4,16}$/;
export const PASSWORD_MIN = 6;
export const PASSWORD_MAX = 64;

export function validateUsername(v) {
  const s = typeof v === 'string' ? v.trim() : '';
  if (!USERNAME_RE.test(s)) return { ok: false, value: s, error: '아이디는 영문/숫자/밑줄(_) 4~16자입니다.' };
  return { ok: true, value: s, error: null };
}

export function validatePassword(v) {
  const s = typeof v === 'string' ? v : '';
  if (s.length < PASSWORD_MIN) return { ok: false, error: `비밀번호는 ${PASSWORD_MIN}자 이상이어야 합니다.` };
  if (s.length > PASSWORD_MAX) return { ok: false, error: `비밀번호는 ${PASSWORD_MAX}자 이하여야 합니다.` };
  return { ok: true, error: null };
}

// 전투 (서버가 판정, 클라이언트는 애니메이션/쿨다운 표시에 사용)
export const ATTACKS = {
  punch: { range: 1.15, cooldownMs: 380, knockback: 4.2, lift: 1.6, points: 1, windupMs: 110, durationMs: 330 },
  kick: { range: 1.4, cooldownMs: 700, knockback: 6.8, lift: 3.0, points: 2, windupMs: 180, durationMs: 480 },
};
export const KNOCKDOWN = { points: 5, windowMs: 4000, durationMs: 2500 };
