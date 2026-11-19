// 치장 아이템 모델 (상점 아이템)
// CharacterModel 이 만든 "도우미(ctx)" 를 받아 캐릭터 지오메트리에 도형을 추가합니다.
// 모든 도형은 캐릭터 하나의 SkinnedMesh 로 합쳐지므로 아이템을 많이 껴도 드로우콜이 늘지 않습니다.
// (트레일·오라만 별도 이펙트 — CosmeticFx.js)
import * as THREE from 'three';
import * as G from './prim.js';
import { hairline, surfaceDist } from './headShape.js';
import {
  starPoly, heartPoly, ellipsePoly, triangulate, BOLT, FLAME,
} from './polygons.js';

export { triangulate, starPoly, heartPoly };

const TAU = Math.PI * 2;
const GOLD = '#f2c230';
const GOLD_DARK = '#c99a18';

// ── 모자 ────────────────────────────────────────────────
/**
 * @param {object} x ctx: { b, head, H:{face,cheek,c,hw}, shell(keep, scale, color, seg), at(dx,dy,dz,s,out) }
 */
export function addHat(id, x) {
  const { b, head, H, shell, at } = x;
  const { face, cheek, c, hw } = H;
  const top = surfaceDist(face, cheek, 0, 1, 0) * 1.08; // 머리카락 꼭대기 높이 (중심 기준)
  const wx = hw / 0.3;
  switch (id) {
    case 'cap': {
      shell((n) => n[1] > hairline(n, 0.48, 0.26, -0.05), 1.16, '#3d7dd8');
      // 챙: 이마 위쪽에서 앞으로, 끝이 살짝 들려 있어 위에서 내려다봐도 눈·눈썹을 가리지 않음
      const n = [0, 0.62, 0.785];
      const d = surfaceDist(face, cheek, n[0], n[1], n[2]) * 1.16;
      b.add(G.cylinder(0.14, 0.14, 0.018, 18), '#3d7dd8', head, {
        x: 0, y: c + n[1] * d + 0.01, z: n[2] * d + 0.05, sz: 0.75, rx: -0.3,
      });
      b.add(G.sphere(0.025, 8, 6), '#ffffff', head, { y: c + top * 1.07 });
      break;
    }
    case 'beanie':
      shell((n) => n[1] > hairline(n, 0.42, 0.22, -0.2), 1.16, '#e8505b');
      shell((n) => {
        const h = hairline(n, 0.42, 0.22, -0.2);
        return n[1] > h && n[1] < h + 0.14;
      }, 1.2, '#e8505b');
      b.add(G.sphere(0.06, 10, 8), '#ffffff', head, { y: c + top * 1.07 + 0.04 });
      break;
    case 'headband':
      shell((n) => {
        const h = hairline(n, 0.42, 0.3, 0.1);
        return n[1] > h && n[1] < h + 0.12;
      }, 1.12, '#f6d55c');
      break;
    case 'party_hat': {
      // 비스듬히 쓴 고깔 + 줄무늬 + 방울 (z축으로 -0.25 기울임)
      const tilt = -0.25;
      const bx = 0.04;
      const by = c + top - 0.02;
      const along = (h) => ({ x: bx + Math.sin(-tilt) * h, y: by + Math.cos(tilt) * h, rz: tilt });
      b.add(G.cone(0.13, 0.32, 14), '#8e6bd8', head, along(0.14));
      b.add(G.cylinder(0.105, 0.12, 0.03, 14), '#f6d55c', head, along(0.05));
      b.add(G.cylinder(0.055, 0.07, 0.03, 12), '#f6d55c', head, along(0.17));
      b.add(G.sphere(0.045, 10, 8), '#ff8fb8', head, along(0.31));
      break;
    }
    case 'cat_ears':
    case 'bunny_ears': {
      const cat = id === 'cat_ears';
      const outer = cat ? '#3a3a42' : '#fafafa';
      for (const side of [-1, 1]) {
        const dir = new THREE.Vector3(side * (cat ? 0.5 : 0.32), 0.85, cat ? 0.02 : -0.08).normalize();
        const tilt = new THREE.Vector3(side * (cat ? 0.45 : 0.22), 1, 0).normalize();
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), tilt);
        const p = at(dir.x, dir.y, dir.z, 1.06, cat ? 0.03 : 0.12);
        if (cat) {
          b.add(G.cone(0.075, 0.14, 4), outer, head, { ...p, quat: q, sz: 0.55 });
          b.add(G.cone(0.045, 0.09, 4), '#ff9db5', head, { ...p, y: p.y - 0.01, z: p.z + 0.018, quat: q, sz: 0.4 });
        } else {
          b.add(G.capsule(0.045, 0.2, 4, 10), outer, head, { ...p, quat: q, sz: 0.55 });
          b.add(G.capsule(0.025, 0.16, 4, 8), '#ffb3c7', head, { ...p, z: p.z + 0.02, quat: q, sz: 0.3 });
        }
      }
      // 머리띠
      shell((n) => {
        const h = hairline(n, 0.62, 0.55, 0.5);
        return n[1] > h && n[1] < h + 0.07 && Math.abs(n[2]) < 0.35;
      }, 1.1, cat ? '#3a3a42' : '#ffb3c7');
      break;
    }
    case 'headphones': {
      const r = Math.max(hw, top / 1.08) * 1.12;
      b.add(G.torus(r, 0.022, 6, 24, Math.PI), '#2b2d33', head, { y: c + 0.02, sx: (hw * 1.13) / r });
      for (const side of [-1, 1]) {
        b.add(G.cylinder(0.075, 0.075, 0.06, 16), '#2b2d33', head, { x: side * (hw * 1.13), y: c + 0.0, rz: Math.PI / 2 });
        b.add(G.cylinder(0.05, 0.05, 0.065, 14), '#e8505b', head, { x: side * (hw * 1.13 + 0.004), y: c, rz: Math.PI / 2 });
      }
      break;
    }
    case 'cowboy': {
      const y0 = c + 0.17;
      b.add(G.cylinder(0.42, 0.42, 0.022, 24), '#9a6a3a', head, { y: y0, sx: wx * 1.02, sz: 0.92, rx: -0.06 });
      b.add(G.cylinder(0.21, 0.28, 0.24, 18), '#a87445', head, { y: y0 + 0.12, sx: wx, sz: 0.95 });
      b.add(G.cylinder(0.276, 0.283, 0.045, 18), '#4a2f1a', head, { y: y0 + 0.035, sx: wx, sz: 0.95 });
      b.add(G.sphere(0.2, 14, 8, 0, TAU, 0, Math.PI / 2), '#a87445', head, { y: y0 + 0.235, sx: wx * 1.05, sy: 0.35, sz: 0.95 });
      break;
    }
    case 'crown': {
      const y0 = c + top * 0.86;
      const r = 0.15;
      b.add(G.cylinder(r, r * 0.95, 0.08, 16), GOLD, head, { y: y0 });
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * TAU + 0.3;
        b.add(G.cone(0.035, 0.1, 6), GOLD, head, { x: Math.sin(a) * r * 0.92, y: y0 + 0.08, z: Math.cos(a) * r * 0.92 });
        b.add(G.sphere(0.016, 6, 5), GOLD, head, { x: Math.sin(a) * r * 0.92, y: y0 + 0.135, z: Math.cos(a) * r * 0.92 });
      }
      for (const [a, col] of [[0, '#e8505b'], [1.25, '#3d7dd8'], [-1.25, '#3caea3']]) {
        b.add(G.sphere(0.022, 8, 6), col, head, { x: Math.sin(a) * (r + 0.004), y: y0, z: Math.cos(a) * (r + 0.004), sz: 0.6 });
      }
      break;
    }
    case 'halo':
      b.add(G.torus(0.17, 0.024, 8, 28), '#fff3a0', head, { y: c + top + 0.13, rx: Math.PI / 2 });
      break;
    default:
      break;
  }
}

/** 모자 종류별: 위로 솟는 머리(아프로 등)를 눌러야 하는지 */
export function hatFlattensHair(id) {
  return !!id && id !== 'halo' && id !== 'headphones';
}

// ── 안경 ────────────────────────────────────────────────
export function addEyewear(id, x) {
  const { b, head, H, onFace, eyeX, shell } = x;
  const { c, hw } = H;
  const temple = (color) => {
    for (const side of [-1, 1]) {
      b.add(G.capsule(0.006, 0.2, 2, 4), color, head, { x: side * (hw + 0.004), y: c + 0.02, z: 0.1, rx: Math.PI / 2 });
    }
  };
  switch (id) {
    case 'round_glasses':
    case 'sunglasses': {
      const sun = id === 'sunglasses';
      for (const side of [-1, 1]) {
        if (sun) b.add(G.sphere(0.06, 12, 8), '#1d1d22', head, onFace(side * eyeX, 0.012, 0.03, { sx: 1.15, sy: 0.85, sz: 0.25 }));
        b.add(G.torus(0.056, 0.008, 4, 16), sun ? '#1d1d22' : '#3a3f4b', head, onFace(side * eyeX, 0.012, 0.035));
      }
      b.add(G.capsule(0.007, 0.05, 2, 4), '#3a3f4b', head, onFace(0, 0.022, 0.04, { rz: Math.PI / 2 }));
      temple('#3a3f4b');
      break;
    }
    case 'heart_glasses':
    case 'star_glasses': {
      const heart = id === 'heart_glasses';
      const color = heart ? '#ff5d8f' : '#ffcf3a';
      const poly = heart ? heartPoly(18) : starPoly(5, 1, 0.48);
      for (const side of [-1, 1]) {
        const p = onFace(side * eyeX, 0.012, 0.034);
        b.add(flatPolyGeometry([poly], 0.062, 0.012), color, head, p);
      }
      b.add(G.capsule(0.007, 0.05, 2, 4), color, head, onFace(0, 0.022, 0.04, { rz: Math.PI / 2 }));
      temple(color);
      break;
    }
    case 'ski_goggles': {
      shell((n) => Math.abs(n[1] - 0.05) < 0.075 && n[2] < 0.55, 1.1, '#2b2d33');
      b.add(G.sphere(0.1, 16, 10), '#ff9a3c', head, onFace(0, 0.015, 0.035, { sx: 2.05, sy: 0.85, sz: 0.35 }));
      b.add(G.sphere(0.085, 14, 8), '#7fd3ff', head, onFace(0, 0.02, 0.045, { sx: 2.05, sy: 0.7, sz: 0.3 }));
      break;
    }
    default:
      break;
  }
}

// ── 귀 ─────────────────────────────────────────────────
export function addEarItem(id, x) {
  const { b, head, H } = x;
  for (const side of [-1, 1]) {
    if (id === 'earrings') b.add(G.sphere(0.022, 8, 6), GOLD, head, { x: side * (H.hw + 0.004), y: H.c - 0.075 });
    if (id === 'gold_hoops') b.add(G.torus(0.032, 0.007, 6, 16), GOLD, head, { x: side * (H.hw + 0.006), y: H.c - 0.1, ry: Math.PI / 2 });
  }
}

// ── 목 ─────────────────────────────────────────────────
/** 몸통 표면을 따라 목 둘레를 도는 곡선 (앞쪽은 살짝 아래로) */
function neckCurve(shape, y0, dip, out, n = 28) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const th = (i / n) * Math.PI * 2;
    const y = y0 - dip * Math.max(0, Math.cos(th)) ** 2;
    pts.push(shape.outside(y, th, out));
  }
  return pts;
}

export function addNeckItem(id, x) {
  const { b, chest, shape } = x;
  const front = (y, out) => shape.outside(y, 0, out);
  switch (id) {
    case 'necklace': {
      b.add(curveTube(neckCurve(shape, 0.43, 0.05, 0.008), 0.009), GOLD, chest);
      const [px, py, pz] = front(0.375, 0.02);
      b.add(G.sphere(0.022, 8, 6), GOLD, chest, { x: px, y: py, z: pz });
      break;
    }
    case 'gold_chain': {
      b.add(curveTube(neckCurve(shape, 0.425, 0.07, 0.014), 0.016, 8), GOLD, chest);
      const [px, py, pz] = front(0.345, 0.025);
      b.add(G.cylinder(0.042, 0.042, 0.014, 16), GOLD_DARK, chest, { x: px, y: py, z: pz, rx: Math.PI / 2 - 0.25 });
      b.add(G.cylinder(0.029, 0.029, 0.016, 12), GOLD, chest, { x: px, y: py, z: pz + 0.004, rx: Math.PI / 2 - 0.25 });
      break;
    }
    case 'scarf': {
      b.add(curveTube(neckCurve(shape, 0.445, 0.02, 0.03), 0.045, 10), '#e8505b', chest);
      const [px, py, pz] = front(0.32, 0.05);
      b.add(G.capsule(0.04, 0.14, 4, 8), '#e8505b', chest, { x: px + 0.06, y: py, z: pz, rx: -0.2, rz: 0.12, sz: 0.55 });
      b.add(G.box(0.085, 0.02, 0.03), '#ffffff', chest, { x: px + 0.07, y: py - 0.09, z: pz + 0.01, rz: 0.12 });
      break;
    }
    case 'bowtie': {
      const [px, py, pz] = front(0.41, 0.02);
      for (const side of [-1, 1]) {
        b.add(G.cone(0.045, 0.08, 4), '#e8505b', chest, { x: px + side * 0.042, y: py, z: pz, rz: side * Math.PI / 2, sz: 0.45 });
      }
      b.add(G.sphere(0.022, 8, 6), '#b43c45', chest, { x: px, y: py, z: pz + 0.006, sz: 0.7 });
      break;
    }
    case 'medal': {
      const [px, py, pz] = front(0.29, 0.03);
      const [nx, ny, nz] = front(0.43, 0.012);
      for (const side of [-1, 1]) {
        // 리본: 목 → 메달
        const top = [nx + side * 0.05, ny, nz];
        b.add(curveTube([top, [px + side * 0.012, py + 0.04, pz]], 0.012, 4, false), side < 0 ? '#3d7dd8' : '#e8505b', chest);
      }
      b.add(G.cylinder(0.048, 0.048, 0.014, 16), GOLD, chest, { x: px, y: py, z: pz, rx: Math.PI / 2 - 0.2 });
      b.add(flatPolyGeometry([starPoly(5, 1, 0.45)], 0.026, 0.004), '#fff3a0', chest, { x: px, y: py + 0.002, z: pz + 0.01, rx: -0.2 });
      break;
    }
    default:
      break;
  }
}

/** 점 목록을 따라가는 관 (closed 면 고리) */
export function curveTube(pts, radius, radial = 6, closed = true) {
  const n = pts.length;
  const pos = [];
  const idx = [];
  const segs = closed ? n : n - 1;
  // 직선 두 점이면 중간점을 채워 둥글게
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    const nx = pts[(i + 1) % n];
    const pv = pts[(i - 1 + n) % n];
    let t = closed || (i > 0 && i < n - 1) ? sub(nx, pv) : (i === 0 ? sub(pts[1], p) : sub(p, pts[n - 2]));
    t = norm(t);
    let up = Math.abs(t[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
    const bn = norm(cross(t, up));
    up = cross(bn, t);
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      const c = Math.cos(a) * radius;
      const s2 = Math.sin(a) * radius;
      pos.push(p[0] + bn[0] * c + up[0] * s2, p[1] + bn[1] * c + up[1] * s2, p[2] + bn[2] * c + up[2] * s2);
    }
  }
  const R = radial + 1;
  for (let i = 0; i < segs; i++) {
    const i2 = (i + 1) % n;
    for (let j = 0; j < radial; j++) {
      const a = i * R + j; const b2 = i2 * R + j; const c = i2 * R + j + 1; const d = i * R + j + 1;
      idx.push(a, d, b2, b2, d, c);
    }
  }
  if (!closed) {
    // 양 끝 막기
    for (const [ring, flip] of [[0, true], [n - 1, false]]) {
      const center = pos.length / 3;
      pos.push(...pts[ring]);
      for (let j = 0; j < radial; j++) {
        const a = ring * R + j;
        if (flip) idx.push(center, a + 1, a); else idx.push(center, a, a + 1);
      }
    }
  }
  return rawGeometry(pos, idx);
}
const sub = (a, b2) => [a[0] - b2[0], a[1] - b2[1], a[2] - b2[2]];
const cross = (u, v) => [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };

// ── 신발 (기본 신발 대신) ─────────────────────────────────
/** 신발 아이템 → 기본 신발 스타일/색 덮어쓰기 + 추가 장식 */
export function shoeOverride(id) {
  switch (id) {
    case 'neon_kicks': return { style: 'sneakers', color: '#39f28c', sole: '#f6f6f6', glow: '#d6ff3a' };
    case 'gold_kicks': return { style: 'hightop', color: GOLD, sole: '#ffffff', glow: '#fff3a0' };
    case 'bunny_slippers': return { style: 'bunny', color: '#ffd1de', sole: '#f6a5bb' };
    case 'rocket_boots': return { style: 'rocket', color: '#c9ced6', sole: '#3a3f4b' };
    default: return null;
  }
}

export function addShoeExtras(o, b, knee, y, w) {
  if (!o) return;
  if (o.glow) b.add(G.torus(0.098, 0.01, 4, 20), o.glow, knee, { y: y - 0.04, z: 0.03, rx: Math.PI / 2, sx: 1.03 * w, sy: 1.3 });
  if (o.style === 'bunny') {
    for (const s of [-1, 1]) b.add(G.capsule(0.018, 0.07, 3, 6), '#ffd1de', knee, { x: s * 0.035, y: y + 0.07, z: 0.08, rx: -0.3, rz: s * 0.25 });
    b.add(G.sphere(0.012, 6, 5), '#2b2420', knee, { x: -0.03, y: y + 0.03, z: 0.15 });
    b.add(G.sphere(0.012, 6, 5), '#2b2420', knee, { x: 0.03, y: y + 0.03, z: 0.15 });
  }
  if (o.style === 'rocket') {
    b.add(G.cylinder(0.092, 0.098, 0.12, 14), '#c9ced6', knee, { y: y + 0.065, sx: w, sz: w });
    // 뒤꿈치 뒤쪽 분사구 + 불꽃 (바닥 아래로 들어가지 않게 뒤로 뿜음)
    b.add(G.cylinder(0.035, 0.045, 0.06, 10), '#3a3f4b', knee, { y: y + 0.02, z: -0.115, rx: -0.9 });
    b.add(G.cone(0.035, 0.12, 8), '#ff9a3c', knee, { y: y - 0.01, z: -0.18, rx: Math.PI - 0.9 });
    b.add(G.cone(0.02, 0.07, 6), '#fff3a0', knee, { y: y + 0.0, z: -0.16, rx: Math.PI - 0.9 });
    for (const s of [-1, 1]) b.add(G.box(0.012, 0.06, 0.05), '#e8505b', knee, { x: s * 0.095 * w, y: y + 0.02, z: -0.05 });
  }
}

// ── 옷 디자인 (상의 위에 그려지는 무늬) ─────────────────────
/**
 * @param {object} x ctx: { b, chest, torso: Ellipsoid[], topColor, sw }
 *   torso: 상의 표면을 이루는 타원체 목록 {c:[x,y,z], r:[rx,ry,rz]} (가슴뼈 기준)
 */
export function addPrint(id, x) {
  const { b, chest, shape, topColor, sw } = x;
  const light = luminance(topColor) > 0.62;
  const ink = (want) => (Math.abs(luminance(want) - luminance(topColor)) < 0.25 ? (light ? '#2b2d33' : '#ffffff') : want);
  const place = (polys, color, cx, cy, size, lift = 0.006) => {
    b.add(projectedPolys(polys, shape, cx, cy, size, lift), color, chest);
  };
  const cy = 0.28;
  switch (id) {
    case 'print_stripes': {
      const col = light ? '#2b2d33' : '#ffffff';
      for (const y of [0.2, 0.28, 0.36]) b.add(torsoBand(shape, y, 0.035, 0.005), col, chest);
      break;
    }
    case 'print_star':
      place([starPoly(5, 1, 0.45)], ink('#ffd84a'), 0, cy, 0.095 * sw);
      break;
    case 'print_heart':
      place([heartPoly(24)], ink('#ff4f7b'), 0, cy, 0.09 * sw);
      break;
    case 'print_bolt':
      place([BOLT], ink('#ffd84a'), 0, cy, 0.1 * sw);
      break;
    case 'print_flame':
      place([FLAME], ink('#ff6a2b'), 0, cy - 0.01, 0.1 * sw);
      place([FLAME.map(([px, py]) => [px * 0.55, py * 0.6 - 0.32])], '#ffd84a', 0, cy - 0.01, 0.1 * sw, 0.009);
      break;
    case 'print_paw': {
      const polys = [ellipsePoly(0, -0.25, 0.5, 0.42, 18)];
      for (const [px, py] of [[-0.55, 0.3], [-0.2, 0.62], [0.2, 0.62], [0.55, 0.3]]) polys.push(ellipsePoly(px, py, 0.18, 0.22, 12));
      place(polys, ink('#ffffff'), 0, cy, 0.09 * sw);
      break;
    }
    default:
      break;
  }
}

// ── 등 ─────────────────────────────────────────────────
export function addBackItem(id, x) {
  const { b, chest, shape, sw } = x;
  const backZ = Math.min(shape.point(0.25, Math.PI)[1], shape.point(0.33, Math.PI)[1]); // 등 표면 (가장 뒤)
  switch (id) {
    case 'backpack':
      b.add(G.capsule(0.12, 0.12, 6, 12), '#3caea3', chest, { y: 0.27, z: backZ - 0.06, sx: 1.25 * sw, sz: 0.65 });
      b.add(G.capsule(0.07, 0.04, 4, 10), '#2b8f86', chest, { y: 0.2, z: backZ - 0.13, sx: 1.4, sz: 0.5 });
      b.add(G.torus(0.04, 0.01, 4, 10, Math.PI), '#2b2d33', chest, { y: 0.44, z: backZ - 0.06 });
      for (const s of [-1, 1]) {
        const pts = [];
        for (let i = 0; i <= 8; i++) {
          const th = Math.PI - (i / 8) * (Math.PI - 0.55);
          const y = 0.4 - 0.22 * (i / 8) ** 2;
          const [px, py, pz] = shape.outside(y, s * th, 0.012);
          pts.push([px, py, pz]);
        }
        b.add(curveTube(pts, 0.012, 5, false), '#2b2d33', chest);
      }
      break;
    case 'cape':
      b.add(G.box(0.5 * sw, 0.66, 0.02), '#e8505b', chest, { y: 0.12, z: backZ - 0.045, rx: 0.1 });
      b.add(G.box(0.46 * sw, 0.62, 0.021), '#b43c45', chest, { y: 0.12, z: backZ - 0.034, rx: 0.1 });
      b.add(curveTube(neckCurve(shape, 0.44, 0, 0.012).filter((p) => p[2] < 0.04), 0.02, 6, false), '#e8505b', chest);
      for (const s of [-1, 1]) {
        const [px, py, pz] = shape.outside(0.43, s * 1.2, 0.015);
        b.add(G.sphere(0.025, 8, 6), GOLD, chest, { x: px, y: py, z: pz });
      }
      break;
    case 'jetpack':
      for (const s of [-1, 1]) {
        b.add(G.capsule(0.06, 0.18, 4, 12), '#c9ced6', chest, { x: s * 0.075, y: 0.28, z: backZ - 0.07 });
        b.add(G.cone(0.05, 0.07, 10), '#e8505b', chest, { x: s * 0.075, y: 0.45, z: backZ - 0.07 });
        b.add(G.cylinder(0.04, 0.055, 0.05, 10), '#3a3f4b', chest, { x: s * 0.075, y: 0.13, z: backZ - 0.07 });
        b.add(G.cone(0.04, 0.13, 8), '#ff9a3c', chest, { x: s * 0.075, y: 0.04, z: backZ - 0.07, rx: Math.PI });
        b.add(G.cone(0.022, 0.08, 6), '#fff3a0', chest, { x: s * 0.075, y: 0.06, z: backZ - 0.07, rx: Math.PI });
      }
      b.add(G.box(0.16, 0.2, 0.05), '#3a3f4b', chest, { y: 0.28, z: backZ - 0.02 });
      break;
    case 'angel_wings':
    case 'devil_wings': {
      const angel = id === 'angel_wings';
      const col = angel ? '#ffffff' : '#5b2a6e';
      const col2 = angel ? '#e6eef7' : '#3d1a4a';
      for (const s of [-1, 1]) {
        const base = { x: s * 0.09, y: 0.33, z: backZ - 0.05 };
        if (angel) {
          // 깃털 3겹 (둥글게)
          b.add(G.sphere(0.16, 12, 8), col, chest, { x: base.x + s * 0.17, y: base.y + 0.08, z: base.z - 0.04, sx: 1.35, sy: 0.75, sz: 0.18, rz: s * 0.45, ry: s * 0.35 });
          b.add(G.sphere(0.13, 12, 8), col2, chest, { x: base.x + s * 0.2, y: base.y - 0.04, z: base.z - 0.05, sx: 1.3, sy: 0.6, sz: 0.16, rz: s * 0.15, ry: s * 0.35 });
          b.add(G.sphere(0.1, 10, 8), col, chest, { x: base.x + s * 0.17, y: base.y - 0.14, z: base.z - 0.055, sx: 1.25, sy: 0.55, sz: 0.15, rz: s * -0.1, ry: s * 0.35 });
        } else {
          // 박쥐 날개 (뾰족한 막 3개)
          for (const [dx, dy, len, rz] of [[0.14, 0.12, 0.3, 0.9], [0.2, 0.0, 0.28, 1.35], [0.16, -0.12, 0.22, 1.85]]) {
            b.add(G.cone(0.07, len, 4), col, chest, {
              x: base.x + s * dx, y: base.y + dy, z: base.z - 0.04, rz: -s * rz, ry: s * 0.3, sz: 0.2,
            });
          }
          b.add(G.capsule(0.02, 0.26, 3, 6), col2, chest, { x: base.x + s * 0.13, y: base.y + 0.08, z: base.z - 0.05, rz: -s * 0.95, ry: s * 0.3 });
        }
      }
      break;
    }
    default:
      break;
  }
}

// ── 평면 도형 유틸 ──────────────────────────────────────
function rawGeometry(positions, indices) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  if (globalThis.__RECORD_PARTS) g.__raw = { p: positions, i: indices };
  return g;
}

/** 얇은 판 모양 (앞면 + 뒷면), 크기 size, 두께 depth */
export function flatPolyGeometry(polys, size, depth) {
  const pos = [];
  const ind = [];
  for (const poly of polys) {
    const tris = triangulate(poly);
    for (const [z, flip] of [[depth / 2, false], [-depth / 2, true]]) {
      const base = pos.length / 3;
      for (const [px, py] of poly) pos.push(px * size, py * size, z);
      for (let i = 0; i < tris.length; i += 3) {
        if (flip) ind.push(base + tris[i], base + tris[i + 2], base + tris[i + 1]);
        else ind.push(base + tris[i], base + tris[i + 1], base + tris[i + 2]);
      }
    }
  }
  return rawGeometry(pos, ind);
}

/** 평면 도형을 상의 앞면에 붙인 지오메트리 (삼각형을 잘게 나눠 표면 굴곡을 따라감) */
function projectedPolys(polys, shape, cx, cy, size, lift, div = 4) {
  const pos = [];
  const ind = [];
  const put = (px, py) => {
    const X = cx + px * size;
    const Y = cy + py * size;
    const Z = shape.frontZ(X, Y);
    pos.push(X, Y, (Number.isFinite(Z) ? Z : 0) + lift);
    return pos.length / 3 - 1;
  };
  for (const poly of polys) {
    const tris = triangulate(poly);
    for (let t = 0; t < tris.length; t += 3) {
      const [A, B, C] = [poly[tris[t]], poly[tris[t + 1]], poly[tris[t + 2]]];
      const row = [];
      for (let i = 0; i <= div; i++) {
        row[i] = [];
        for (let j = 0; j <= div - i; j++) {
          const u = i / div;
          const v = j / div;
          const w = 1 - u - v;
          row[i][j] = put(A[0] * w + B[0] * u + C[0] * v, A[1] * w + B[1] * u + C[1] * v);
        }
      }
      for (let i = 0; i < div; i++) {
        for (let j = 0; j < div - i; j++) {
          ind.push(row[i][j], row[i + 1][j], row[i][j + 1]);
          if (j < div - i - 1) ind.push(row[i + 1][j], row[i + 1][j + 1], row[i][j + 1]);
        }
      }
    }
  }
  return rawGeometry(pos, ind);
}

/** 몸통을 한 바퀴 두르는 띠 (줄무늬) — 표면에서 lift 만큼 바깥 */
function torsoBand(shape, y, h, lift, seg = 40) {
  const pos = [];
  const ind = [];
  for (let i = 0; i <= seg; i++) {
    const th = (i / seg) * Math.PI * 2;
    for (const yy of [y + h / 2, y - h / 2]) pos.push(...shape.outside(yy, th, lift));
  }
  for (let i = 0; i < seg; i++) {
    const a = i * 2;
    ind.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  return rawGeometry(pos, ind);
}

function luminance(hex) {
  const h = String(hex || '#888888').replace('#', '');
  const n = Number.parseInt(h.length === 3 ? h.split('').map((ch) => ch + ch).join('') : h, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const bl = n & 255;
  return (0.299 * r + 0.587 * g + 0.114 * bl) / 255;
}
