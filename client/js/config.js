// ─────────────────────────────────────────────────────────────
// ONLINE GYM 환경 설정
// 배포 환경에 맞게 이 파일만 수정하면 됩니다.
// ─────────────────────────────────────────────────────────────

// ★ 게임 서버를 배포한 뒤, 그 주소를 여기에 입력하세요. (예: 'https://online-gym-server.onrender.com')
//   비워두면 localhost 에서 접속할 때만 http://localhost:3000 서버를 사용합니다. (오프라인 모드는 없음)
const DEPLOYED_SERVER_URL = 'https://online-gym-server.onrender.com';

const override = (typeof window !== 'undefined' && window.ONLINE_GYM_CONFIG) || {};
const SERVER_KEY = 'onlinegym.server.v1';

/**
 * 서버 주소 결정 순서
 *  1) 주소창의 ?server=주소  (테스트용, 브라우저에 기억됨)  ?server= (빈 값) → 기억한 주소 삭제
 *  2) index.html 의 window.ONLINE_GYM_CONFIG.SERVER_URL
 *  3) 위의 DEPLOYED_SERVER_URL
 *  4) localhost 로 접속 중이면 http://localhost:3000
 */
export function resolveServerUrl() {
  if (typeof window === 'undefined') return '';
  try {
    const q = new URLSearchParams(window.location.search).get('server');
    if (q !== null) {
      if (q === '') window.localStorage.removeItem(SERVER_KEY); // ?server=  → 기본값으로 되돌림
      else if (q !== 'off') window.localStorage.setItem(SERVER_KEY, q.replace(/\/$/, ''));
    }
    const saved = window.localStorage.getItem(SERVER_KEY);
    if (saved === 'off') window.localStorage.removeItem(SERVER_KEY); // 예전 오프라인 설정은 지움
    else if (saved) return saved;
  } catch { /* localStorage 사용 불가 */ }
  if (override.SERVER_URL) return override.SERVER_URL.replace(/\/$/, '');
  if (DEPLOYED_SERVER_URL) return DEPLOYED_SERVER_URL.replace(/\/$/, '');
  const host = window.location.hostname;
  if (host === 'localhost' || host === '127.0.0.1') return `${window.location.protocol}//${host}:3000`;
  return '';
}

export const CONFIG = {
  // 렌더링
  MAX_PIXEL_RATIO: 1.5, // "높음" 품질의 최대 해상도 배율

  // 이동
  WALK_SPEED: 3.2, // m/s
  RUN_SPEED: 6.0, // m/s (Shift) — 서버 MAX_MOVE_SPEED 와 같아야 함
  ACCELERATION: 14,
  TURN_SPEED: 12,
  PLAYER_RADIUS: 0.35,
  JUMP_VELOCITY: 5.0, // m/s → 최고 높이 약 0.96m (벤치 쿠션·휴식 벤치 위로 올라설 수 있음)
  GRAVITY: 13, // m/s²

  // 카메라
  CAMERA_MIN_DISTANCE: 2.0,
  CAMERA_MAX_DISTANCE: 10,
  CAMERA_DEFAULT_DISTANCE: 4.6,
  CAMERA_TARGET_HEIGHT: 1.05,
  MOUSE_SENSITIVITY: 0.0045,

  // 상호작용
  INTERACT_RANGE: 1.6,

  // 네트워크
  CONNECT_TIMEOUT_MS: 10000,
  INTERPOLATION_DELAY_MS: 130, // 다른 플레이어를 이만큼 과거 시점(서버 시각 기준)으로 그려 끊김 없이 보간

  // 로컬 저장소 키
  STORAGE_KEY_PROFILE: 'onlinegym.profile.v1',
  STORAGE_KEY_SETTINGS: 'onlinegym.settings.v1',
};
