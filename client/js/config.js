// ─────────────────────────────────────────────────────────────
// ONLINE GYM 환경 설정
// 배포 환경에 맞게 이 파일만 수정하면 됩니다.
// index.html 에서 window.ONLINE_GYM_CONFIG 로 덮어쓸 수도 있습니다.
// ─────────────────────────────────────────────────────────────

const override = (typeof window !== 'undefined' && window.ONLINE_GYM_CONFIG) || {};

export const CONFIG = {
  // Phase 2부터 사용: Socket.IO 게임 서버 주소
  SERVER_URL: override.SERVER_URL || 'http://localhost:3000',

  // 렌더링
  MAX_PIXEL_RATIO: 1.5, // "높음" 품질의 최대 해상도 배율

  // 이동
  WALK_SPEED: 3.2, // m/s
  RUN_SPEED: 6.0, // m/s (Shift)
  ACCELERATION: 14,
  TURN_SPEED: 12,
  PLAYER_RADIUS: 0.35,

  // 카메라
  CAMERA_MIN_DISTANCE: 2.0,
  CAMERA_MAX_DISTANCE: 10,
  CAMERA_DEFAULT_DISTANCE: 4.6,
  CAMERA_TARGET_HEIGHT: 1.05,
  MOUSE_SENSITIVITY: 0.0045,

  // 상호작용
  INTERACT_RANGE: 1.6,

  // 로컬 저장소 키
  STORAGE_KEY_PROFILE: 'onlinegym.profile.v1',
  STORAGE_KEY_SETTINGS: 'onlinegym.settings.v1',
};
