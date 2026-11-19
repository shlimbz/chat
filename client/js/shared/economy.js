// 게임 재화(코인) 규칙 — 서버가 지급/차감하고, 클라이언트는 안내 표시에만 사용합니다.
export const ECONOMY = {
  STARTING_COINS: 300, // 새 계정 / 기존 계정 1회 지급
  EXERCISE_SECONDS_PER_COIN: 3, // 기구 운동 3초마다 1코인
  // 샌드백: 좌우로 흔들리는 샌드백이 가운데(초록 불)에 왔을 때 맞히면 PERFECT → 코인
  BAG_PERFECT_PUNCH: 2,
  BAG_PERFECT_KICK: 3,
  BAG_COIN_COOLDOWN_MS: 500, // 한 번 지나갈 때 한 번만
  HOURLY_CAP: 1500, // 한 시간에 벌 수 있는 최대 코인 (매크로 방지)
  SELL_RATE: 0.5, // 되팔면 구매가의 50%
  SPOT_TOLERANCE: 0.6, // 운동 자리 판정 거리 (m)
  FLUSH_MS: 20000, // 번 코인을 DB 에 모아서 저장하는 주기
};

export const sellPrice = (item) => Math.floor((item?.price || 0) * ECONOMY.SELL_RATE);
