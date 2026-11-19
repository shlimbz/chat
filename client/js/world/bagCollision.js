// 샌드백 공격 판정에 쓰는 순수 계산 로직 (Three.js에 의존하지 않음)
export function findPunchingBagTarget(
  bags,
  { hitX, hitZ, fromX, fromZ, rotY },
  { minDistance = 0.45, maxDistance = 2.1, hitRadius = 0.95, minForwardDot = 0.58 } = {},
) {
  const forwardX = Math.sin(rotY);
  const forwardZ = Math.cos(rotY);
  let best = null;
  let bestDistance = Infinity;

  for (const bag of bags || []) {
    const dx = bag.worldX - fromX;
    const dz = bag.worldZ - fromZ;
    const distance = Math.hypot(dx, dz);
    if (distance < minDistance || distance > maxDistance) continue;
    if (Math.hypot(hitX - bag.worldX, hitZ - bag.worldZ) > hitRadius) continue;
    const forwardDot = (dx * forwardX + dz * forwardZ) / distance;
    if (forwardDot < minForwardDot || distance >= bestDistance) continue;
    best = bag;
    bestDistance = distance;
  }
  return best;
}
