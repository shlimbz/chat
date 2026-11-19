// 주먹/발차기 판정 (서버가 최종 판정 — 클라이언트가 "맞았다" 고 주장하는 값은 받지 않음)
import { ATTACKS, KNOCKDOWN } from '../../../client/js/shared/protocol.js';

const BODY_RADIUS = 0.35;

/**
 * @param {object} attacker PlayerRegistry 의 플레이어
 * @param {Iterable<object>} players 접속 중인 모든 플레이어
 * @param {'punch'|'kick'} type
 * @param {number} now ms
 * @returns {{ok:false, reason:string} | {ok:true, hits:Array<{target:object, kx:number, kz:number, down:boolean}>}}
 */
export function resolveAttack(attacker, players, type, now = Date.now()) {
  const spec = ATTACKS[type];
  if (!spec) return { ok: false, reason: 'unknown' };
  if (attacker.downUntil > now) return { ok: false, reason: 'down' };
  attacker.attackAt ||= {};
  // 쿨다운 (네트워크 오차 80ms 허용)
  if (now - (attacker.attackAt[type] || 0) < spec.cooldownMs - 80) return { ok: false, reason: 'cooldown' };
  attacker.attackAt[type] = now;

  const fx = Math.sin(attacker.r);
  const fz = Math.cos(attacker.r);
  const hits = [];
  for (const t of players) {
    if (t === attacker || t.downUntil > now) continue;
    const dx = t.x - attacker.x;
    const dz = t.z - attacker.z;
    const dist = Math.hypot(dx, dz);
    if (dist > spec.range + BODY_RADIUS) continue;
    if (Math.abs((t.y || 0) - (attacker.y || 0)) > 1.0) continue;
    // 앞쪽 약 120도 범위 안 (아주 가까우면 방향 무시)
    if (dist > 0.3 && (dx * fx + dz * fz) / dist < 0.5) continue;

    const nx = dist > 0.01 ? dx / dist : fx;
    const nz = dist > 0.01 ? dz / dist : fz;

    // 연타 누적 → 기절(넘어짐)
    t.hitLog = (t.hitLog || []).filter((h) => now - h.t < KNOCKDOWN.windowMs);
    t.hitLog.push({ t: now, p: spec.points });
    const points = t.hitLog.reduce((s, h) => s + h.p, 0);
    const down = points >= KNOCKDOWN.points;
    if (down) {
      t.downUntil = now + KNOCKDOWN.durationMs;
      t.hitLog = [];
    }
    // 넉백 이동은 피격자 클라이언트가 수행 → 서버 이동 검증이 막지 않도록 여유 시간 부여
    t.knockbackUntil = now + 600;
    hits.push({ target: t, kx: round2(nx * spec.knockback), kz: round2(nz * spec.knockback), down });
  }
  return { ok: true, hits };
}

const round2 = (n) => Math.round(n * 100) / 100;
