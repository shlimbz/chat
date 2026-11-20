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

/** 회전 바벨 판정 */
export const BAR = { radius: 0.13, height: 0.5 };
/** 줄넘기: 회전축 높이·반지름 */
export const ROPE = { height: 1.25, radius: 1.15, thick: 0.06 };
/** 샌드백 진자 */
export const SANDBAG = { len: 2.2, radius: 0.34, half: 0.55, pivot: 3.0 };
/** 덤벨 프레스(위에서 쿵 내려오는 덤벨) */
export const CRUSH = { up: 3.0, down: 0.12, thick: 0.5 };

// 범퍼 원판 색 (25kg 빨강 / 20kg 파랑 / 15kg 노랑 / 10kg 초록 / 5kg 검정)
const PLATES = ['#e8505b', '#3d7dd8', '#f6d55c', '#3caea3', '#2b2d33'];
const COLORS = {
  bench: '#b43c45',
  move: '#4a5160',
  belt: '#3a3f4b',
  pad: '#3d7dd8',
  slip: '#7fc8f8',
  ring: '#3d7dd8',
  spin: '#2b2d33',
  turn: '#f6d55c',
  rope: '#c49a6c',
  crush: '#59606e',
  fade: '#c77dff',
  cp: '#39d98a',
  goal: '#ffd84a',
  kill: '#ff3b5c',
};

/** 두 발판 가장자리 사이 수평 거리 (원판은 원, 나머지는 상자) */
export function shapeGap(a, b) {
  const ra = a.round ? a.w / 2 : 0;
  const rb = b.round ? b.w / 2 : 0;
  if (a.round && b.round) return Math.max(0, Math.hypot(a.x - b.x, a.z - b.z) - ra - rb);
  if (a.round || b.round) {
    const c = a.round ? a : b;
    const q = a.round ? b : a;
    const dx = Math.max(0, Math.abs(c.x - q.x) - q.w / 2);
    const dz = Math.max(0, Math.abs(c.z - q.z) - q.d / 2);
    return Math.max(0, Math.hypot(dx, dz) - c.w / 2);
  }
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
  const r3 = (v) => Math.round(v * 1000) / 1000;

  /**
   * 이전 발판에서 가장자리 간격 gap 만큼 떨어진 다음 자리(원 위)를 찾아 배치
   * @param {object} s { w, d, rise, gap, R, kind, round, ... }
   */
  const place = (s) => {
    const R = s.R ?? 7;
    const top = Math.round(((prev ? prev.top : 0) + s.rise) * 100) / 100;
    let t = theta;
    const cand = { w: s.w, d: s.round ? s.w : s.d, round: !!s.round };
    if (prev) {
      for (let i = 1; i < 3000; i++) {
        t = theta + DIR * i * 0.003;
        cand.x = Math.cos(t) * R;
        cand.z = Math.sin(t) * R;
        if (shapeGap(prev, cand) >= s.gap) break;
      }
    }
    theta = t;
    const el = {
      id: `t${n++}`,
      kind: s.kind || 'plat',
      stage,
      x: r3(OX + Math.cos(t) * R),
      z: r3(OZ + Math.sin(t) * R),
      w: s.w,
      d: cand.d,
      h: s.h ?? 0.4,
      top,
      color: s.color,
    };
    if (s.round) el.round = true;
    // 진행 방향(접선)과 바깥 방향(반지름) — 기믹 방향 계산용
    const path = { x: -Math.sin(t) * DIR, z: Math.cos(t) * DIR };
    const out = { x: Math.cos(t), z: Math.sin(t) };
    prev = {
      x: Math.cos(t) * R, z: Math.sin(t) * R, w: s.w, d: cand.d, top, round: !!s.round,
    };
    if (s.move) el.move = s.move;
    if (s.fade) el.fade = s.fade;
    if (s.pad) el.pad = PAD_VELOCITY;
    if (s.spin) el.spin = s.spin;
    if (s.slip) el.slip = true;
    if (s.turn) el.turn = s.turn;
    if (s.conveyor) el.conveyor = { vx: r3(-path.x * s.conveyor), vz: r3(-path.z * s.conveyor) };
    if (s.wind) el.wind = { vx: r3(out.x * s.wind.speed), vz: r3(out.z * s.wind.speed), period: s.wind.period, on: s.wind.on, phase: s.wind.phase };
    if (s.rope) el.rope = { px: r3(path.x), pz: r3(path.z), period: s.rope.period, phase: s.rope.phase };
    if (s.crush) el.crush = s.crush;
    if (s.sandbag) el.sandbag = { ax: r3(out.x), az: r3(out.z), period: s.sandbag.period, amp: s.sandbag.amp, phase: s.sandbag.phase };
    els.push(el);
    if (s.kills) {
      // 발판 가운데를 가로지르는 빨간 줄 (닿으면 체크포인트로) — 진행 방향과 직각
      const across = Math.abs(path.x) > Math.abs(path.z); // 진행 방향이 x 축 쪽이면 줄은 z 방향
      els.push({
        id: `t${n++}`, kind: 'kill', stage, x: el.x, z: el.z,
        w: across ? s.kills : s.w - 0.02, d: across ? cand.d - 0.02 : s.kills,
        h: 0.08, top: top + 0.06, color: COLORS.kill, solid: false,
      });
    }
    if (s.decoy) {
      // 트롤: 같은 각도의 안쪽/바깥쪽에 진짜와 똑같이 생긴 가짜 원판 (밟으면 떨어짐)
      const dR = s.decoy;
      els.push({
        id: `t${n++}`, kind: 'fake', stage, round: true,
        x: r3(OX + Math.cos(t) * (R + dR)), z: r3(OZ + Math.sin(t) * (R + dR)),
        w: s.w, d: s.w, h: 0.4, top, color: s.color, solid: false,
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

  // ── 출발 ──
  checkpoint(0.3, 0, 7);
  // ── 1단계: 원판 계단 (기본 점프) ──
  for (let i = 0; i < 7; i++) {
    place({ w: 1.8, round: true, rise: 0.5, gap: 1.0 + (i % 3) * 0.2, kind: 'plate', color: PLATES[i % 5] });
  }
  checkpoint(0.4, 1.1);
  // ── 2단계: 벤치 다리 (좁은 벤치 + 빨간 줄 넘기) ──
  for (let i = 0; i < 6; i++) {
    const narrowX = i % 2 === 0;
    place({
      w: narrowX ? 0.7 : 2.4, d: narrowX ? 2.4 : 0.7, rise: 0.35, gap: 0.9, kind: 'bench', color: COLORS.bench,
    });
    if (i === 2) place({ w: 2.6, d: 2.6, rise: 0.2, gap: 0.9, kind: 'mat', kills: 0.7, color: '#4a5160' });
  }
  checkpoint(0.35, 1.0, 7.6);
  // ── 3단계: 러닝머신 (움직이는 기계 + 뒤로 미는 벨트) ──
  for (let i = 0; i < 5; i++) {
    if (i % 2 === 1) {
      place({
        w: 2.4, d: 2.4, rise: 0.4, gap: 1.0, R: 7.6, kind: 'tread', color: COLORS.move, conveyor: 1.8,
      });
    } else {
      place({
        w: 1.7, d: 1.7, rise: 0.45, gap: 1.0, R: 7.6, kind: 'move', color: COLORS.move,
        move: { radial: true, amp: 1.3, period: 3400, phase: i * 0.21 },
      });
    }
  }
  checkpoint(0.45, 1.0);
  // ── 4단계: 트램펄린 (밟으면 높이 튀어 오름) ──
  for (let i = 0; i < 3; i++) place({ w: 2.0, round: true, rise: i === 0 ? 0.3 : 2.6, gap: 1.0, pad: true, kind: 'tramp', color: COLORS.pad });
  place({ w: 2.0, round: true, rise: 2.6, gap: 1.0, kind: 'plate', color: PLATES[1] });
  checkpoint(0.4, 1.1, 8);
  // ── 5단계: 땀 범벅 원판 (미끄럽고, 선풍기 바람이 바깥으로 밀어냄) ──
  for (let i = 0; i < 5; i++) {
    place({
      w: 2.2, round: true, rise: 0.35, gap: 1.0, R: 8, kind: 'plate', color: PLATES[(i + 1) % 4], slip: true,
      wind: i % 2 === 0 ? { speed: 2.0, period: 4000, on: 0.5, phase: i * 0.13 } : null,
    });
  }
  checkpoint(0.35, 1.0, 7.2);
  // ── 6단계: 샌드백 구간 (좌우로 크게 흔들리는 샌드백에 맞으면 날아감) ──
  for (let i = 0; i < 4; i++) {
    place({
      w: 3.0, d: 3.0, rise: 0.3, gap: 1.0, R: 7.2, kind: 'ring', color: COLORS.ring,
      sandbag: { period: 2600 - i * 150, amp: 0.85, phase: i * 0.37 },
    });
  }
  checkpoint(0.5, 1.0, 7.8);
  // ── 7단계: 바벨 회전 + 회전 원판 ──
  for (let i = 0; i < 4; i++) {
    if (i % 2 === 0) {
      place({
        w: 3.6, round: true, rise: 0.5, gap: 1.0, R: 7.8, kind: 'spin', color: COLORS.spin,
        spin: { len: 1.75, speed: (i % 4 ? -1 : 1) * (1.6 + i * 0.15), phase: i * 1.3 },
      });
    } else {
      place({
        w: 3.2, round: true, rise: 0.5, gap: 1.0, R: 7.8, kind: 'turn', color: COLORS.turn, turn: { speed: i === 1 ? 0.9 : -1.1 },
      });
    }
  }
  checkpoint(0.4, 1.0, 7);
  // ── 8단계: 줄넘기 + 덤벨 프레스 (타이밍 맞춰 점프 / 지나가기) ──
  for (let i = 0; i < 4; i++) {
    if (i % 2 === 0) {
      place({
        w: 2.8, d: 2.8, rise: 0.35, gap: 1.0, kind: 'rope', color: COLORS.rope, rope: { period: 2000 - i * 100, phase: i * 0.29 },
      });
    } else {
      place({
        w: 2.6, d: 2.6, rise: 0.35, gap: 1.0, kind: 'crush', color: COLORS.crush, crush: { period: 3000, phase: i * 0.23 },
      });
    }
  }
  checkpoint(0.35, 1.0, 7.6);
  // ── 9단계: 사라지는 요가매트 + 가짜 원판 (트롤) ──
  for (let i = 0; i < 6; i++) {
    if (i % 2 === 0) {
      place({
        w: 1.7, d: 1.7, rise: 0.3, gap: 1.05, R: 7.6, kind: 'fade', color: COLORS.fade,
        fade: { period: 3600, on: 0.6, phase: (i % 4 === 0 ? 0 : 0.5) }, // 짝수·홀수 매트가 번갈아 나타남
      });
    } else {
      place({
        w: 1.8, round: true, rise: 0.3, gap: 1.05, R: 7.6, kind: 'plate', color: PLATES[i % 5], decoy: i === 3 ? -2.2 : 2.2,
      });
    }
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
export const STAGE_NAMES = ['원판 계단', '벤치 다리', '러닝머신', '트램펄린', '땀 범벅 원판 · 선풍기', '샌드백 구간', '바벨 회전 · 회전 원판', '줄넘기 · 덤벨 프레스', '요가매트 · 가짜 원판'];
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

/** 회전 원판 각도 (three.js rotation.y 와 같은 방향) */
export function turnAngle(el, ms) {
  return el.turn ? (ms / 1000) * el.turn.speed : 0;
}

/** 선풍기 바람: 켜져 있으면 {vx, vz} (m/s), 꺼져 있으면 null */
export function windAt(el, ms) {
  const w = el.wind;
  if (!w) return null;
  const k = (((ms / w.period) + w.phase) % 1 + 1) % 1;
  return k < w.on ? w : null;
}

/** 바람이 닿는 범위 (발판 위 2.5 m 까지) */
export function inWind(el, x, y, z) {
  if (y < el.top - 0.2 || y > el.top + 2.5) return false;
  return Math.hypot(x - el.x, z - el.z) < el.w / 2 + 0.4;
}

/** 줄넘기 줄 각도: 0 = 바닥(발밑), π = 머리 위. 아래쪽 줄이 다가오는 사람 쪽으로 돌아옴 */
export function ropeAngle(el, ms) {
  return (1 - ((ms / el.rope.period + el.rope.phase) % 1)) * Math.PI * 2;
}

/** 줄넘기 줄에 걸렸는지 (발 위치 기준) */
export function hitsRope(el, ms, px, py, pz) {
  if (!el.rope || py < el.top - 0.3 || py > el.top + 2.6) return false;
  const rx = px - el.x;
  const rz = pz - el.z;
  const along = rx * el.rope.px + rz * el.rope.pz; // 진행 방향 좌표
  const across = Math.abs(rx * -el.rope.pz + rz * el.rope.px);
  const half = Math.max(el.w, el.d) / 2;
  if (across > half || Math.abs(along) > ROPE.radius + 0.3) return false;
  const a = ropeAngle(el, ms);
  const s = Math.sin(a) * ROPE.radius;
  const ry = el.top + ROPE.height - Math.cos(a) * ROPE.radius;
  if (Math.abs(s - along) > 0.28) return false;
  return ry > py + 0.04 && ry < py + 1.55; // 발보다 위, 머리보다 아래를 지나가면 걸림
}

/** 덤벨 프레스: 발판 위로부터 덤벨 밑면 높이 */
export function crushHeight(el, ms) {
  const c = el.crush;
  const k = (((ms / c.period) + c.phase) % 1 + 1) % 1;
  if (k < 0.5) return CRUSH.up; // 위에서 대기
  if (k < 0.58) { const t = (k - 0.5) / 0.08; return CRUSH.up - (CRUSH.up - CRUSH.down) * t * t; } // 쿵!
  if (k < 0.72) return CRUSH.down; // 눌러 둠
  return CRUSH.down + (CRUSH.up - CRUSH.down) * ((k - 0.72) / 0.28); // 천천히 올라감
}

/** 곧 내려옴 (경고 표시용) */
export function crushWarn(el, ms) {
  const c = el.crush;
  const k = (((ms / c.period) + c.phase) % 1 + 1) % 1;
  return k > 0.32 && k < 0.5;
}

export function hitsCrusher(el, ms, px, py, pz) {
  if (!el.crush) return false;
  if (Math.abs(px - el.x) > el.w / 2 - 0.05 || Math.abs(pz - el.z) > el.d / 2 - 0.05) return false;
  const bottom = el.top + crushHeight(el, ms);
  return py > el.top - 0.3 && py + 1.5 > bottom && py < bottom + CRUSH.thick;
}

/** 샌드백 위치 {x, y(가운데), z, vx, vz(흔들리는 속도)} */
export function sandbagPos(el, ms) {
  const sb = el.sandbag;
  const w = (Math.PI * 2) / sb.period;
  const ph = ms * w + sb.phase * Math.PI * 2;
  const ang = Math.sin(ph) * sb.amp;
  const dAng = Math.cos(ph) * sb.amp * w * 1000; // rad/s
  const off = Math.sin(ang) * SANDBAG.len;
  const sp = Math.cos(ang) * SANDBAG.len * dAng;
  return {
    x: el.x + sb.ax * off, z: el.z + sb.az * off, y: el.top + SANDBAG.pivot - Math.cos(ang) * SANDBAG.len, ang,
    vx: sb.ax * sp, vz: sb.az * sp,
  };
}

/** 샌드백에 맞았으면 {kx, kz} 밀려나는 속도, 아니면 null */
export function sandbagHit(el, ms, px, py, pz) {
  if (!el.sandbag) return null;
  const b = sandbagPos(el, ms);
  if (py > b.y + SANDBAG.half || py + 1.5 < b.y - SANDBAG.half) return null;
  const dx = px - b.x;
  const dz = pz - b.z;
  const d = Math.hypot(dx, dz);
  if (d > SANDBAG.radius + 0.35) return null;
  // 흔들리는 방향으로 세게 (멈춰 있을 때는 밀어내는 방향)
  const sp = Math.hypot(b.vx, b.vz);
  let kx = sp > 0.5 ? b.vx / sp : dx / (d || 1);
  let kz = sp > 0.5 ? b.vz / sp : dz / (d || 1);
  const power = 5 + Math.min(4, sp * 0.8);
  kx *= power;
  kz *= power;
  return { kx, kz };
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
