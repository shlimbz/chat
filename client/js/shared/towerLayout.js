// 득근 타워 (점프맵) — 코스 정의 (서버/클라이언트 공용)
// - 클라이언트: 이 목록대로 발판을 만들고 움직임/사라짐/회전 바를 서버 시각 기준으로 계산
// - 서버: 체크포인트 통과·클리어 판정, "날기" 같은 비정상 높이 검증
//
// 타워는 헬스장과 같은 좌표계의 먼 곳(x≈300)에 있습니다. → 위치만 보고 어느 맵인지 알 수 있음
// 코스는 가운데 기둥을 나선형으로 돌며 올라갑니다. 발판 위치는 아래 build() 가 계산합니다.

export const MAPS = { GYM: 'gym', TOWER: 'tower' };
export const TOWER_ORIGIN = { x: 300, z: 0 };
const OX = TOWER_ORIGIN.x;
const OZ = TOWER_ORIGIN.z;
export const TOWER_HALF = 16;
export const TOWER_BOUNDS = {
  minX: OX - TOWER_HALF, maxX: OX + TOWER_HALF, minZ: OZ - TOWER_HALF, maxZ: OZ + TOWER_HALF, maxY: 40,
};
export const GYM_BOUNDS = {
  minX: -20, maxX: 20, minZ: -15, maxZ: 15, maxY: 3.5,
};

/** x 좌표만으로 어느 맵인지 */
export const mapOf = (x) => (x > 150 ? MAPS.TOWER : MAPS.GYM);
export const mapBounds = (map) => (map === MAPS.TOWER ? TOWER_BOUNDS : GYM_BOUNDS);

/** 헬스장 북동쪽 구석의 타워 포탈 (걸어 들어가거나 E) — 헬스장 가운데를 바라봄 */
const PORTAL_FACE = Math.atan2(-18.4, 13.4);
export const GYM_PORTAL = { x: 18.4, z: -13.4, rotY: PORTAL_FACE, range: 2.6 };
/** 타워 → 헬스장 으로 돌아왔을 때 서는 자리 (포탈 바로 앞, 헬스장 쪽을 바라봄) */
export const GYM_RETURN = {
  x: Math.round((18.4 + Math.sin(PORTAL_FACE) * 1.9) * 100) / 100,
  z: Math.round((-13.4 + Math.cos(PORTAL_FACE) * 1.9) * 100) / 100,
  r: PORTAL_FACE,
};
/** 포탈 범위 (서버 확인): 포탈 중심에서 이 거리 안 */
export const PORTAL_RANGE = 3.0;

/** 타워 1층: 도착 지점 · 돌아가는 포탈 · 안내원 */
export const TOWER_SPAWN = { x: OX, z: OZ + 12.6, r: Math.PI };
export const TOWER_EXIT_PORTAL = { x: OX - 4.2, z: OZ + 13.4 };
export const TOWER_NPC = { x: OX + 3.4, z: OZ + 12.2, r: Math.PI * 0.85 };

// 물리 (클라이언트 CONFIG 와 같은 값: 점프 5 m/s, 중력 13 → 최고 0.96 m)
export const PAD_VELOCITY = 9.5; // 점프대: 최고 약 3.5 m
export const FALL_RESET = 3.5; // 마지막 체크포인트보다 이만큼 아래로 떨어지면 체크포인트로
export const MIN_CLEAR_MS = 22000; // 이보다 빨리 깬 기록은 보상 없음 (최고 속도로 달려도 이보다 오래 걸림 — 순간이동 핵 방지)
export const CLEAR_REWARD = 40; // 클리어 코인 (시간당 상한 적용)

/** 회전 바 판정 */
export const BAR = { radius: 0.13, height: 0.5 };

const COLORS = {
  plate: ['#ff8fab', '#ffd166', '#7bdff2', '#b8f2a1', '#cdb4db'],
  beam: '#9aa4b2',
  move: '#4cc9f0',
  pad: '#f9a03f',
  spin: '#e9ecef',
  fade: '#c77dff',
  cp: '#39d98a',
  goal: '#ffd84a',
  kill: '#ff3b5c',
};

/**
 * 두 상자 사이 수평 거리 (가장자리끼리, 겹치면 0)
 */
function aabbGap(a, b) {
  const dx = Math.max(0, Math.abs(a.x - b.x) - (a.w + b.w) / 2);
  const dz = Math.max(0, Math.abs(a.z - b.z) - (a.d + b.d) / 2);
  return Math.hypot(dx, dz);
}

function build() {
  const els = [];
  const cps = [];
  let theta = Math.PI / 2; // +z 쪽(도착 지점 앞)에서 시작
  let prev = null;
  let stage = 0;
  let n = 0;
  const DIR = -1; // 위에서 봤을 때 시계 방향

  /**
   * 이전 발판에서 가장자리 간격 gap 만큼 떨어진 다음 자리(원 위)를 찾아 배치
   * @param {object} s { w, d, rise, gap, R, kind, ... }
   */
  const place = (s) => {
    const R = s.R ?? 7;
    const top = Math.round(((prev ? prev.top : 0) + s.rise) * 100) / 100;
    let t = theta;
    const cand = { w: s.w, d: s.d };
    if (prev) {
      for (let i = 1; i < 2000; i++) {
        t = theta + DIR * i * 0.004;
        cand.x = Math.cos(t) * R;
        cand.z = Math.sin(t) * R;
        if (aabbGap(prev, cand) >= s.gap) break;
      }
    }
    theta = t;
    const el = {
      id: `t${n++}`,
      kind: s.kind || 'plat',
      stage,
      x: Math.round((OX + Math.cos(t) * R) * 1000) / 1000,
      z: Math.round((OZ + Math.sin(t) * R) * 1000) / 1000,
      w: s.w,
      d: s.d,
      h: s.h ?? 0.4,
      top,
      color: s.color,
    };
    // 이전 발판과의 간격 계산은 기둥 중심 기준 좌표로
    prev = {
      x: Math.cos(t) * R, z: Math.sin(t) * R, w: s.w, d: s.d, top,
    };
    if (s.move) el.move = s.move;
    if (s.fade) el.fade = s.fade;
    if (s.pad) el.pad = PAD_VELOCITY;
    if (s.spin) el.spin = s.spin;
    els.push(el);
    if (s.kills) {
      // 발판 가운데를 가로지르는 빨간 줄 (닿으면 체크포인트로) — 진행 방향과 직각
      const tx = -Math.sin(t);
      const tz = Math.cos(t);
      const across = Math.abs(tx) > Math.abs(tz); // 진행 방향이 x 축 쪽이면 줄은 z 방향
      els.push({
        id: `t${n++}`,
        kind: 'kill',
        stage,
        x: el.x,
        z: el.z,
        w: across ? s.kills : s.w - 0.02,
        d: across ? s.d - 0.02 : s.kills,
        h: 0.08,
        top: top + 0.06,
        color: COLORS.kill,
        solid: false,
      });
    }
    return el;
  };

  const checkpoint = (rise, gap, R = 7, goal = false) => {
    const el = place({
      w: goal ? 4.6 : 3, d: goal ? 4.6 : 3, rise, gap, R, kind: 'cp', color: goal ? COLORS.goal : COLORS.cp,
    });
    el.cp = cps.length;
    if (goal) el.goal = true;
    cps.push(el);
    stage++;
    return el;
  };

  // ── 출발: 체크포인트 0 (1층 바닥에서 한 칸 올라선 출발대) ──
  checkpoint(0.3, 0, 7);
  // ── 1단계: 원판 계단 (기본 점프) ──
  for (let i = 0; i < 7; i++) place({ w: 1.6, d: 1.6, rise: 0.5, gap: 1.0 + (i % 3) * 0.2, color: COLORS.plate[i % 5] });
  checkpoint(0.4, 1.1);
  // ── 2단계: 덤벨 다리 (좁은 길 + 빨간 줄 넘기) ──
  for (let i = 0; i < 6; i++) {
    const narrowX = i % 2 === 0;
    place({
      w: narrowX ? 0.7 : 2.4, d: narrowX ? 2.4 : 0.7, rise: 0.35, gap: 0.9, color: COLORS.beam,
    });
    if (i === 2) place({ w: 2.6, d: 2.6, rise: 0.2, gap: 0.9, kills: 0.7, color: COLORS.plate[1] });
  }
  checkpoint(0.35, 1.0);
  // ── 3단계: 러닝머신 발판 (좌우로 움직임 — 가까이 올 때 점프) ──
  for (let i = 0; i < 5; i++) {
    place({
      w: 1.7, d: 1.7, rise: 0.45, gap: 1.0, kind: 'move', color: COLORS.move,
      move: { radial: true, amp: 1.3, period: 3400, phase: i * 0.21 },
    });
  }
  checkpoint(0.45, 1.0);
  // ── 4단계: 프로틴 점프대 (밟으면 높이 튀어 오름) ──
  for (let i = 0; i < 3; i++) {
    place({ w: 1.8, d: 1.8, rise: i === 0 ? 0.3 : 2.6, gap: 1.0, pad: true, color: COLORS.pad });
  }
  place({ w: 2.0, d: 2.0, rise: 2.6, gap: 1.0, color: COLORS.plate[2] });
  checkpoint(0.4, 1.1);
  // ── 5단계: 바벨 회전 (돌아오는 바를 점프로 넘기) ──
  for (let i = 0; i < 3; i++) {
    place({
      w: 3.6, d: 3.6, rise: 0.4, gap: 1.1, R: 7.6, kind: 'spin', color: COLORS.spin,
      spin: { len: 1.75, speed: (i % 2 ? -1 : 1) * (1.5 + i * 0.25), phase: i * 1.3 },
    });
  }
  checkpoint(0.4, 1.1);
  // ── 6단계: 사라지는 요가매트 (깜빡이면 곧 사라짐) ──
  for (let i = 0; i < 6; i++) {
    place({
      w: 1.7, d: 1.7, rise: 0.3, gap: 1.05, kind: 'fade', color: COLORS.fade,
      fade: { period: 3600, on: 0.6, phase: (i % 2) * 0.5 }, // 짝수·홀수 매트가 번갈아 나타남 (겹치는 동안 건너가기)
    });
  }
  // ── 정상 ──
  checkpoint(0.5, 1.2, 7, true);
  return { els, cps };
}

const BUILT = build();
/** 모든 코스 요소 */
export const TOWER_ELEMENTS = BUILT.els;
/** 체크포인트 (0 = 출발, 마지막 = 정상) */
export const TOWER_CHECKPOINTS = BUILT.cps;
export const TOWER_GOAL = BUILT.cps[BUILT.cps.length - 1];
export const TOWER_STAGES = BUILT.cps.length - 1;
export const STAGE_NAMES = ['원판 계단', '덤벨 다리', '러닝머신 발판', '프로틴 점프대', '바벨 회전', '사라지는 요가매트'];
/** 정상의 돌아가는 포탈 */
export const TOWER_TOP_PORTAL = {
  x: TOWER_GOAL.x + Math.sign(OX - TOWER_GOAL.x || 1) * 1.4, z: TOWER_GOAL.z, y: TOWER_GOAL.top,
};

// ── 시간에 따라 움직이는 요소 (서버 시각 ms 기준 → 모든 화면에서 같은 위치) ──

/** 움직이는 발판의 현재 중심 이동량 {dx, dz} */
export function moveOffset(el, ms) {
  const m = el.move;
  if (!m) return { dx: 0, dz: 0 };
  const s = Math.sin(((ms / m.period) + m.phase) * Math.PI * 2) * m.amp;
  if (m.radial) {
    const rx = el.x - OX;
    const rz = el.z - OZ;
    const L = Math.hypot(rx, rz) || 1;
    return { dx: (rx / L) * s, dz: (rz / L) * s };
  }
  return { dx: (m.ax || 0) * s, dz: (m.az || 0) * s };
}

/** 사라지는 발판: { solid, blink(곧 사라짐) } */
export function fadeState(el, ms) {
  const f = el.fade;
  if (!f) return { solid: true, blink: false };
  const k = (((ms / f.period) + f.phase) % 1 + 1) % 1;
  return { solid: k < f.on, blink: k > f.on - 0.22 && k < f.on };
}

/** 회전 바 각도 */
export function spinAngle(el, ms) {
  return (ms / 1000) * el.spin.speed + el.spin.phase;
}

/** 회전 바에 닿았는지 (발 위치 기준) */
export function hitsSpinBar(el, ms, px, py, pz, radius = 0.35) {
  if (!el.spin) return false;
  const barY = el.top + BAR.height;
  // 바 높이보다 충분히 위(점프로 넘는 중)거나 발판 아래면 안 닿음
  if (py > barY + BAR.radius - 0.02 || py < el.top - 0.3) return false;
  const a = spinAngle(el, ms);
  const ex = Math.cos(a);
  const ez = Math.sin(a);
  // 가운데를 지나는 양쪽 바 (선분 -len ~ +len)
  const rx = px - el.x;
  const rz = pz - el.z;
  const t = Math.max(-el.spin.len, Math.min(el.spin.len, rx * ex + rz * ez));
  const d = Math.hypot(rx - ex * t, rz - ez * t);
  return d < radius + BAR.radius;
}

/** 빨간 줄(킬 브릭)을 밟았는지 */
export function onKillStrip(el, px, py, pz, r = 0.15) {
  if (el.kind !== 'kill') return false;
  if (Math.abs(py - (el.top - el.h)) > 0.35) return false;
  return Math.abs(px - el.x) < el.w / 2 + r && Math.abs(pz - el.z) < el.d / 2 + r;
}

/** 발 위치가 이 발판 위인지 (체크포인트 판정, 서버) */
export function standingOn(el, x, y, z, r = 0.2) {
  return Math.abs(x - el.x) <= el.w / 2 + r && Math.abs(z - el.z) <= el.d / 2 + r && Math.abs(y - el.top) < 0.45;
}

// ── 서버 높이 검증 ("날기" 방지) ──
// 받쳐주는 바닥(발판 윗면) 없이 계속 올라가는 높이를 누적해서, 점프로 갈 수 있는 높이보다 크면 비정상으로 봅니다.
// (점프 최고 0.96 m, 점프대 3.5 m — 여유 포함)
export const RISE_LIMIT = 1.3;
export const RISE_LIMIT_PAD = 4.0;
const SUPPORTS = TOWER_ELEMENTS.filter((e) => e.solid !== false).map((e) => {
  const grow = 0.45 + (e.move ? e.move.amp : 0);
  return {
    minX: e.x - e.w / 2 - grow, maxX: e.x + e.w / 2 + grow, minZ: e.z - e.d / 2 - grow, maxZ: e.z + e.d / 2 + grow,
    top: e.top, pad: !!e.pad,
  };
});

/**
 * 발 높이 y 에서 받쳐주는 바닥이 있는지
 * @param {number} above 윗면보다 이만큼 위까지 인정 (착지 직후 바로 점프한 경우 등 샘플 사이 오차)
 * @returns {null | {top:number, pad:boolean}}
 */
export function towerSupport(x, y, z, above = 0.15) {
  if (y < Math.max(0.12, above)) return { top: 0, pad: false }; // 1층 바닥
  let best = null;
  for (const s of SUPPORTS) {
    // 점프대는 밟는 순간 튀어 오르므로 위쪽 1 m 까지 "점프대 위" 로 인정
    const up = s.pad ? Math.max(above, 1.0) : above;
    if (y < s.top - 0.15 || y > s.top + up) continue;
    if (x < s.minX || x > s.maxX || z < s.minZ || z > s.maxZ) continue;
    if (!best || s.top > best.top) best = s;
  }
  return best;
}
