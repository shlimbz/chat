// 클라이언트 ↔ 서버 통신 규약 (양쪽이 같은 파일을 import)
// 이벤트 이름과 값의 범위를 한곳에서 관리합니다.

export const PROTOCOL_VERSION = 1;

export const EV = {
  // 서버 → 클라이언트
  WELCOME: 'welcome', // { self, players, chat, serverTime }
  PLAYER_JOIN: 'player:join', // PlayerInfo
  PLAYER_LEAVE: 'player:leave', // { id }
  PLAYER_APPEARANCE: 'player:appearance', // { id, appearance }
  STATE: 'state', // [ [id, x, y, z, r, actionIndex], ... ]
  CORRECT: 'correct', // { x, y, z }  서버가 위치를 되돌릴 때
  KICKED: 'kicked', // { reason }
  CHAT: 'chat', // ChatMessage
  // 클라이언트 → 서버
  MOVE: 'move', // [x, y, z, r, actionIndex]
  SET_APPEARANCE: 'appearance:set', // appearance
  CHAT_SEND: 'chat:send', // text  (명령어 포함, 서버가 해석)
  CHAT_HISTORY: 'chat:history', // { beforeId } → ack(ChatMessage[])
  CHAT_PARTNERS: 'chat:partners', // → ack([{ nickname, lastId }])
  CHAT_WHISPERS: 'chat:whispers', // { nickname, beforeId } → ack(ChatMessage[])
};

// 접속 거부 사유 (connect_error 의 message)
export const AUTH_ERRORS = {
  NICK_TAKEN: 'NICK_TAKEN',
  NICK_INVALID: 'NICK_INVALID',
  SERVER_FULL: 'SERVER_FULL',
  BAD_VERSION: 'BAD_VERSION',
};

export const AUTH_ERROR_TEXT = {
  NICK_TAKEN: '이미 다른 사람이 사용 중인 닉네임입니다. 다른 닉네임을 입력해 주세요.',
  NICK_INVALID: '닉네임 형식이 올바르지 않습니다.',
  SERVER_FULL: '헬스장이 가득 찼습니다 (최대 인원 초과). 잠시 후 다시 시도해 주세요.',
  BAD_VERSION: '게임 버전이 서버와 다릅니다. 새로고침(Ctrl+Shift+R) 해주세요.',
};

// 동작 상태 → 숫자로 전송해 데이터량 절감
export const ACTIONS = ['idle', 'walk', 'run', 'jump'];
export const actionToIndex = (a) => Math.max(0, ACTIONS.indexOf(a));
export const indexToAction = (i) => ACTIONS[i] || 'idle';

// 위치 검증용 수치 (서버)
export const WORLD_BOUNDS = { minX: -16, maxX: 16, minZ: -12, maxZ: 12, maxY: 1.6 };
export const MAX_MOVE_SPEED = 6.0; // 클라이언트 RUN_SPEED 와 같아야 함
export const SPAWN = { x: 0, y: 0, z: 8, r: Math.PI };

// 네트워크 주기
export const CLIENT_SEND_HZ = 10;
export const SERVER_TICK_HZ = 10;

// 채팅
export const CHAT_MAX_LENGTH = 200;
export const CHAT_PAGE_SIZE = 50;
export const CHAT_TYPES = { GLOBAL: 'global', WHISPER: 'whisper', SYSTEM: 'system' };
