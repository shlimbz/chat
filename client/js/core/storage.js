// 브라우저 localStorage 저장/불러오기
// Phase 1 은 서버가 없으므로 프로필(닉네임/외형)을 브라우저에 저장합니다.
// Phase 2 부터는 서버 DB 가 원본이 되고, 여기에는 재접속용 토큰만 보관합니다.
import { CONFIG } from '../config.js';
import { sanitizeAppearance, validateNickname } from '../shared/appearance.js';

function read(key) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function write(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function loadProfile() {
  const data = read(CONFIG.STORAGE_KEY_PROFILE);
  if (!data) return null;
  const nick = validateNickname(data.nickname);
  return {
    nickname: nick.ok ? nick.value : '',
    appearance: sanitizeAppearance(data.appearance),
  };
}

export function saveProfile(profile) {
  return write(CONFIG.STORAGE_KEY_PROFILE, {
    nickname: profile.nickname,
    appearance: sanitizeAppearance(profile.appearance),
  });
}

// 그래픽 품질 프리셋
//  low    : 해상도 75%, 블롭 그림자
//  medium : 해상도 100% (고해상도 화면에서도 1배), 블롭 그림자  ← 기본값
//  high   : 해상도 최대 1.5배, 실시간 그림자, 실시간 거울 반사
export const QUALITY_PRESETS = {
  low: { label: '낮음', pixelRatio: 0.75, shadows: false, mirror: false },
  medium: { label: '보통', pixelRatio: 1, shadows: false, mirror: false },
  high: { label: '높음', pixelRatio: 1.5, shadows: true, mirror: true },
};

export const DEFAULT_SETTINGS = Object.freeze({
  mouseSensitivity: 1.0, // 배율
  invertY: false,
  quality: 'medium',
  showNameTags: true,
  showFps: false,
  sound: true,
  autoRes: true, // 프레임이 낮으면 해상도 자동 조절
  keys: Object.freeze({ punch: 'KeyJ', kick: 'KeyK' }), // 공격 키 (설정에서 변경)
});

// 공격 키로 쓸 수 없는 키 (이동·점프·채팅·메뉴 등)
export const RESERVED_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyE', 'Space', 'Enter', 'NumpadEnter', 'Escape', 'Slash',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight', 'Tab', 'MetaLeft', 'MetaRight']);

export function loadSettings() {
  const data = read(CONFIG.STORAGE_KEY_SETTINGS) || {};
  const s = { ...DEFAULT_SETTINGS };
  if (Number.isFinite(data.mouseSensitivity)) s.mouseSensitivity = Math.min(3, Math.max(0.2, data.mouseSensitivity));
  if (typeof data.invertY === 'boolean') s.invertY = data.invertY;
  if (typeof data.quality === 'string' && QUALITY_PRESETS[data.quality]) s.quality = data.quality;
  if (typeof data.showNameTags === 'boolean') s.showNameTags = data.showNameTags;
  if (typeof data.showFps === 'boolean') s.showFps = data.showFps;
  if (typeof data.sound === 'boolean') s.sound = data.sound;
  if (typeof data.autoRes === 'boolean') s.autoRes = data.autoRes;
  const k = data.keys && typeof data.keys === 'object' ? data.keys : {};
  const ok = (c) => typeof c === 'string' && /^[A-Za-z0-9]{2,20}$/.test(c) && !RESERVED_KEYS.has(c);
  s.keys = {
    punch: ok(k.punch) ? k.punch : DEFAULT_SETTINGS.keys.punch,
    kick: ok(k.kick) && k.kick !== k.punch ? k.kick : DEFAULT_SETTINGS.keys.kick,
  };
  return s;
}

export function saveSettings(settings) {
  return write(CONFIG.STORAGE_KEY_SETTINGS, settings);
}

// ── 서버별 재접속 토큰 ─────────────────────────────────
// 토큰은 "이 브라우저가 그 캐릭터의 주인" 이라는 증명입니다. 다른 사람에게 알려주지 마세요.
const TOKENS_KEY = 'onlinegym.tokens.v1';

/** @returns {{nickname:string, token:string}|null} */
export function loadToken(serverUrl) {
  const all = read(TOKENS_KEY) || {};
  const t = all[serverUrl];
  return t && typeof t.token === 'string' && typeof t.nickname === 'string' ? t : null;
}

export function saveToken(serverUrl, nickname, token) {
  const all = read(TOKENS_KEY) || {};
  all[serverUrl] = { nickname, token };
  return write(TOKENS_KEY, all);
}

export function clearTokens(serverUrl) {
  const all = read(TOKENS_KEY) || {};
  delete all[serverUrl];
  return write(TOKENS_KEY, all);
}

// ── 로그인 세션 (서버별) ───────────────────────────────
// 로그인하면 서버가 주는 세션 토큰을 저장 → 다음 접속 때 자동 로그인
const SESSIONS_KEY = 'onlinegym.sessions.v1';

/** @returns {{token:string, username:string, lastCharacterId?:number}|null} */
export function loadSession(serverUrl) {
  const all = read(SESSIONS_KEY) || {};
  const s = all[serverUrl];
  return s && typeof s.token === 'string' ? s : null;
}

export function saveSession(serverUrl, session) {
  const all = read(SESSIONS_KEY) || {};
  all[serverUrl] = { ...(all[serverUrl] || {}), ...session };
  return write(SESSIONS_KEY, all);
}

export function clearSession(serverUrl) {
  const all = read(SESSIONS_KEY) || {};
  delete all[serverUrl];
  return write(SESSIONS_KEY, all);
}
