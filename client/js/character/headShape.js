// 머리 모양 수학 (Three.js 없이 계산만 하는 모듈)
//
// 머리·헤어·모자·얼굴 파츠가 "같은 머리 표면"을 기준으로 만들어지도록
// 얼굴형(round/oval/square/vline)과 볼살(cheek) 값으로 머리 표면을 정의합니다.
//  - 헤어/모자는 이 표면을 바깥으로 살짝 부풀린 껍질 → 얼굴형·체중이 바뀌어도 머리가 뚫고 나오지 않음
//  - 눈·코·입은 이 표면 위에 붙임 → 떠 있거나 파묻히지 않음
// 좌표: 머리 중심 기준, +z = 얼굴 앞, +y = 위

export const HEAD_R = 0.3;

/** 얼굴형별 기본 반지름 (x, y, z) */
const BASE = {
  round: [1.04, 0.97, 1], // 동물의숲처럼 살짝 옆으로 넓은 동그란 얼굴
  oval: [0.93, 1.08, 0.96],
  vline: [1, 1, 1],
  square: [1, 1, 1],
};

/** 머리 내부인지 판정 (부호만 필요) */
export function insideHead(face, cheek, x, y, z) {
  const R = HEAD_R;
  if (face === 'square') {
    // 둥근 모서리 상자 (반지름 0.15)
    const hx = 0.275 * cheek;
    const hy = 0.265;
    const hz = 0.255;
    const r = 0.15;
    const qx = Math.max(Math.abs(x) - (hx - r), 0);
    const qy = Math.max(Math.abs(y) - (hy - r), 0);
    const qz = Math.max(Math.abs(z) - (hz - r), 0);
    return qx * qx + qy * qy + qz * qz < r * r;
  }
  const [bx, by, bz] = BASE[face] || BASE.round;
  let sx = R * bx * cheek;
  const sy = R * by;
  let sz = R * bz;
  if (face === 'vline' && y < 0) {
    // 턱 쪽으로 갈수록 좁고 갸름하게
    const t = Math.min(1, -y / sy);
    sx *= 1 - 0.3 * t;
    sz *= 1 - 0.12 * t;
  }
  return (x / sx) ** 2 + (y / sy) ** 2 + (z / sz) ** 2 < 1;
}

/** 중심에서 방향 (dx,dy,dz) 로 나갔을 때 머리 표면까지의 거리 */
export function surfaceDist(face, cheek, dx, dy, dz) {
  let lo = 0;
  let hi = 0.6;
  for (let i = 0; i < 22; i++) {
    const mid = (lo + hi) / 2;
    if (insideHead(face, cheek, dx * mid, dy * mid, dz * mid)) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

/** 얼굴 앞면에서 (x, y) 위치의 표면 z */
export function surfaceZ(face, cheek, x, y) {
  let lo = 0;
  let hi = 0.6;
  if (!insideHead(face, cheek, x, y, 0)) return 0;
  for (let i = 0; i < 22; i++) {
    const mid = (lo + hi) / 2;
    if (insideHead(face, cheek, x, y, mid)) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

/**
 * 얼굴 표면 (x,y) 에 파츠를 붙이기 위한 위치/기울기.
 * @param {number} lift 표면에서 앞으로 띄울 거리 (파츠 두께의 일부만 밖으로 나오게)
 */
export function facePlacement(face, cheek, x, y, lift = 0) {
  const z = surfaceZ(face, cheek, x, y);
  const e = 0.012;
  const dzdx = (surfaceZ(face, cheek, x + e, y) - surfaceZ(face, cheek, x - e, y)) / (2 * e);
  const dzdy = (surfaceZ(face, cheek, x, y + e) - surfaceZ(face, cheek, x, y - e)) / (2 * e);
  // 표면 법선 방향으로 회전 (파츠가 얼굴 곡면을 따라 눕도록)
  const ry = Math.atan(-dzdx);
  const rx = Math.atan(dzdy);
  const n = normalize([-dzdx, -dzdy, 1]);
  return {
    x: x + n[0] * lift, y: y + n[1] * lift, z: z + n[2] * lift, rx, ry,
  };
}

/** 머리 반폭(귀 위치) */
export function headHalfWidth(face, cheek) {
  return surfaceDist(face, cheek, 1, 0, 0);
}

function normalize(v) {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

/**
 * 헤어라인 (방향 n 의 y 성분 기준). 앞(F) → 옆(S) → 뒤(B) 로 부드럽게 이어짐.
 * ang 은 정면에서 잰 수평 각도 (0 = 얼굴 정면, π = 뒤통수)
 */
export function hairline(n, F, S, B) {
  const c = n[2] / (Math.hypot(n[0], n[2]) || 1);
  return S + (F - S) * Math.max(0, c) + (B - S) * Math.max(0, -c);
}

/**
 * 머리 표면을 바깥으로 부풀린 "껍질" 메쉬 데이터를 만듭니다.
 * @param {string} face
 * @param {number} cheek
 * @param {object} o
 * @param {(n:number[])=>boolean} o.keep 방향 n 의 칸을 남길지
 * @param {number|((n:number[])=>number)} o.scale 표면 대비 배율 (1.06 = 6% 바깥)
 * @param {number} [o.seg] 해상도
 * @returns {{positions: Float32Array, indices: Uint16Array|Uint32Array}}
 */
export function buildShell(face, cheek, o) {
  const seg = o.seg || 28;
  const rows = seg;
  const cols = seg * 2;
  const verts = [];
  const scaleOf = typeof o.scale === 'function' ? o.scale : () => o.scale ?? 1;
  const dirs = [];
  for (let i = 0; i <= rows; i++) {
    const th = (i / rows) * Math.PI; // 0 = 정수리
    for (let j = 0; j <= cols; j++) {
      const ph = (j / cols) * Math.PI * 2 + Math.PI; // 이음새는 뒤통수 쪽으로
      const n = [Math.sin(th) * Math.sin(ph), Math.cos(th), Math.sin(th) * Math.cos(ph)];
      dirs.push(n);
      const d = surfaceDist(face, cheek, n[0], n[1], n[2]) * scaleOf(n);
      verts.push(n[0] * d, n[1] * d, n[2] * d);
    }
  }
  const idx = [];
  const id = (i, j) => i * (cols + 1) + j;
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      // 칸 중심 방향으로 남길지 판단
      const thc = ((i + 0.5) / rows) * Math.PI;
      const phc = ((j + 0.5) / cols) * Math.PI * 2 + Math.PI;
      const n = [Math.sin(thc) * Math.sin(phc), Math.cos(thc), Math.sin(thc) * Math.cos(phc)];
      if (o.keep) {
        // 칸 중심의 실제 표면 위치도 함께 넘김 (이마선 높이 판정용)
        const dc = surfaceDist(face, cheek, n[0], n[1], n[2]);
        if (!o.keep(n, [n[0] * dc, n[1] * dc, n[2] * dc])) continue;
      }
      const a = id(i, j);
      const b = id(i + 1, j);
      const c = id(i + 1, j + 1);
      const d = id(i, j + 1);
      // 바깥을 향하도록 감기 방향(CCW) 지정
      if (i > 0) idx.push(a, b, d);
      if (i < rows - 1) idx.push(b, c, d);
    }
  }
  const positions = new Float32Array(verts);
  const indices = positions.length / 3 > 65535 ? new Uint32Array(idx) : new Uint16Array(idx);
  return { positions, indices, dirs };
}

/**
 * 얼굴 보호 구역: 얼굴 앞쪽(정면 기준 ±75°)에서는 이 높이(머리 중심 기준) 아래로
 * 머리카락·모자가 내려오지 않습니다. 눈썹 윗선(0.099) + 여유.
 */
export const FACE_TOP = 0.118;
export function outsideFace(n, p) {
  return n[2] < 0.26 || p[1] > FACE_TOP;
}
