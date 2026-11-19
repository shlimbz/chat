// 평면 도형(별·하트·번개 등) 좌표와 삼각분할 — Three.js 없이 계산만 하는 모듈
const TAU = Math.PI * 2;

export function starPoly(points, outer, inner) {
  const out = [];
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 ? inner : outer;
    const a = (i / (points * 2)) * TAU;
    out.push([Math.sin(a) * r, Math.cos(a) * r]);
  }
  return out;
}

export function heartPoly(n = 24) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * TAU;
    const x = 16 * Math.sin(t) ** 3;
    const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
    out.push([x / 17, (y + 2) / 17]);
  }
  return out.reverse(); // 반시계 방향
}

export function ellipsePoly(cx, cy, rx, ry, n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    out.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
  }
  return out;
}

export const BOLT = [[0.15, 1], [-0.5, -0.05], [-0.02, -0.05], [-0.25, -1], [0.5, 0.15], [0.03, 0.15], [0.35, 1]];
export const FLAME = [[0, -0.85], [0.55, -0.6], [0.7, -0.1], [0.55, 0.35], [0.35, 0.1], [0.28, 0.65], [0.05, 0.25], [-0.1, 1.0], [-0.35, 0.3], [-0.5, 0.55], [-0.68, -0.05], [-0.55, -0.6]];

/** 단순 다각형 삼각분할 (귀 자르기) → 인덱스 목록 */
export function triangulate(poly) {
  const n = poly.length;
  const idx = [...Array(n).keys()];
  let area = 0;
  for (let i = 0; i < n; i++) {
    const [x1, y1] = poly[i];
    const [x2, y2] = poly[(i + 1) % n];
    area += x1 * y2 - x2 * y1;
  }
  if (area < 0) idx.reverse(); // 반시계 방향으로
  const tris = [];
  const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const inTri = (p, a, b, c) => cross(a, b, p) >= 0 && cross(b, c, p) >= 0 && cross(c, a, p) >= 0;
  let guard = 0;
  while (idx.length > 3 && guard++ < 500) {
    let clipped = false;
    for (let i = 0; i < idx.length; i++) {
      const ia = idx[(i + idx.length - 1) % idx.length];
      const ib = idx[i];
      const ic = idx[(i + 1) % idx.length];
      const a = poly[ia];
      const bb = poly[ib];
      const c = poly[ic];
      if (cross(a, bb, c) <= 0) continue;
      let ok = true;
      for (const j of idx) {
        if (j === ia || j === ib || j === ic) continue;
        if (inTri(poly[j], a, bb, c)) { ok = false; break; }
      }
      if (!ok) continue;
      tris.push(ia, ib, ic);
      idx.splice(i, 1);
      clipped = true;
      break;
    }
    if (!clipped) break;
  }
  if (idx.length === 3) tris.push(idx[0], idx[1], idx[2]);
  return tris;
}

