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

export const DEFAULT_SETTINGS = Object.freeze({
  mouseSensitivity: 1.0, // 배율
  invertY: false,
  shadows: true,
  showNameTags: true,
});

export function loadSettings() {
  const data = read(CONFIG.STORAGE_KEY_SETTINGS) || {};
  const s = { ...DEFAULT_SETTINGS };
  if (Number.isFinite(data.mouseSensitivity)) s.mouseSensitivity = Math.min(3, Math.max(0.2, data.mouseSensitivity));
  if (typeof data.invertY === 'boolean') s.invertY = data.invertY;
  if (typeof data.shadows === 'boolean') s.shadows = data.shadows;
  if (typeof data.showNameTags === 'boolean') s.showNameTags = data.showNameTags;
  return s;
}

export function saveSettings(settings) {
  return write(CONFIG.STORAGE_KEY_SETTINGS, settings);
}
