// 샌드백 좌우 흔들림 (서버/클라이언트 공용)
// 서버 시각만 알면 어느 화면에서든 같은 위치에 있으므로, 서버가 "가운데(초록 불)에서 쳤는지" 판정할 수 있습니다.
export const BAG_SWING = {
  periodMs: 2600, // 왼쪽 → 오른쪽 → 왼쪽 한 번
  amplitude: 0.3, // 최대 기울기 (라디안) → 샌드백 몸통이 좌우 약 45cm 움직임
  zone: 0.28, // 가운데 판정: |sin| < zone (한 번 지나갈 때 약 0.23초)
};

/** 샌드백 i 의 기울기 (라디안, 세계 x 방향) */
export function bagAngle(i, serverMs) {
  return BAG_SWING.amplitude * Math.sin((serverMs / BAG_SWING.periodMs) * Math.PI * 2 + i * 1.7);
}

/** 가운데(퍼펙트 구간)에 있는지 */
export function bagInZone(i, serverMs) {
  return Math.abs(Math.sin((serverMs / BAG_SWING.periodMs) * Math.PI * 2 + i * 1.7)) < BAG_SWING.zone;
}
