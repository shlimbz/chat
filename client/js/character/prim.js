// 캐릭터용 기본 도형 생성기 (Three.js 의 Sphere/Capsule/Cylinder/Cone/Torus/Box 와 같은 인자·같은 모양)
// 정점을 직접 계산해서 만들기 때문에:
//  - 개발용 미리보기/충돌 검사 도구가 실제와 똑같은 모양을 확인할 수 있음 (__raw)
//  - Three.js 버전이 바뀌어도 캐릭터 모양이 그대로
import * as THREE from 'three';

const TAU = Math.PI * 2;

/** 위치/인덱스 배열 → 부드러운 법선을 가진 BufferGeometry */
export function makeGeometry(positions, indices) {
  const g = new THREE.BufferGeometry();
  const pos = positions instanceof Float32Array ? positions : new Float32Array(positions);
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  if (globalThis.__RECORD_PARTS) g.__raw = { p: Array.from(pos), i: Array.from(indices) };
  return g;
}

/** (열 cols+1) × (행 rows+1) 격자 → 삼각형 인덱스. flip 이면 감기 방향 반대 */
function gridIndices(rows, cols, flip = false, skipPoles = false) {
  const idx = [];
  const id = (i, j) => i * (cols + 1) + j;
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      const a = id(i, j);
      const b = id(i + 1, j);
      const c = id(i + 1, j + 1);
      const d = id(i, j + 1);
      const t1 = flip ? [a, d, b] : [a, b, d];
      const t2 = flip ? [b, d, c] : [b, c, d];
      if (!(skipPoles && i === 0)) idx.push(...t1);
      if (!(skipPoles && i === rows - 1)) idx.push(...t2);
    }
  }
  return idx;
}

/** THREE.SphereGeometry 와 같은 인자 */
export function sphere(radius = 1, widthSegments = 32, heightSegments = 16, phiStart = 0, phiLength = TAU, thetaStart = 0, thetaLength = Math.PI) {
  const ws = Math.max(3, Math.floor(widthSegments));
  const hs = Math.max(2, Math.floor(heightSegments));
  const pos = [];
  for (let i = 0; i <= hs; i++) {
    const th = thetaStart + (i / hs) * thetaLength;
    for (let j = 0; j <= ws; j++) {
      const ph = phiStart + (j / ws) * phiLength;
      pos.push(-radius * Math.cos(ph) * Math.sin(th), radius * Math.cos(th), radius * Math.sin(ph) * Math.sin(th));
    }
  }
  // Three.js 와 같은 감기 방향 (바깥이 앞면)
  const idx = [];
  const id = (i, j) => i * (ws + 1) + j;
  const thetaEnd = Math.min(thetaStart + thetaLength, Math.PI);
  for (let i = 0; i < hs; i++) {
    for (let j = 0; j < ws; j++) {
      const a = id(i, j + 1);
      const b = id(i, j);
      const c = id(i + 1, j);
      const d = id(i + 1, j + 1);
      if (i !== 0 || thetaStart > 0) idx.push(a, b, d);
      if (i !== hs - 1 || thetaEnd < Math.PI) idx.push(b, c, d);
    }
  }
  return makeGeometry(pos, idx);
}

/** 회전체: profile = [[r, y], ...] (위→아래 순서), y 축 둘레로 돌림 */
export function lathe(profile, radialSegments = 16) {
  const rs = Math.max(3, Math.floor(radialSegments));
  const pos = [];
  for (const [r, y] of profile) {
    for (let j = 0; j <= rs; j++) {
      const a = (j / rs) * TAU;
      pos.push(r * Math.sin(a), y, r * Math.cos(a));
    }
  }
  return makeGeometry(pos, gridIndices(profile.length - 1, rs, false));
}

/** THREE.CylinderGeometry(radiusTop, radiusBottom, height, radialSegments, heightSegments, openEnded) */
export function cylinder(radiusTop = 1, radiusBottom = 1, height = 1, radialSegments = 32, heightSegments = 1, openEnded = false) {
  const h = height / 2;
  const prof = [];
  if (!openEnded && radiusTop > 0) prof.push([0, h]);
  prof.push([radiusTop, h]);
  if (!openEnded && radiusTop > 0) prof.push([radiusTop, h]); // 모서리를 날카롭게 (법선 분리 대신 같은 점 중복)
  for (let i = 1; i < heightSegments; i++) {
    const t = i / heightSegments;
    prof.push([radiusTop + (radiusBottom - radiusTop) * t, h - height * t]);
  }
  if (!openEnded && radiusBottom > 0) prof.push([radiusBottom, -h]);
  prof.push([radiusBottom, -h]);
  if (!openEnded && radiusBottom > 0) prof.push([0, -h]);
  return lathe(prof, radialSegments);
}

export function cone(radius = 1, height = 1, radialSegments = 32, heightSegments = 1, openEnded = false) {
  return cylinder(0, radius, height, radialSegments, heightSegments, openEnded);
}

/** THREE.CapsuleGeometry(radius, length, capSegments, radialSegments) */
export function capsule(radius = 1, length = 1, capSegments = 4, radialSegments = 8) {
  const cs = Math.max(1, Math.floor(capSegments));
  const prof = [];
  for (let i = 0; i <= cs; i++) {
    const a = (i / cs) * (Math.PI / 2);
    prof.push([radius * Math.sin(a), length / 2 + radius * Math.cos(a)]);
  }
  for (let i = 0; i <= cs; i++) {
    const a = Math.PI / 2 + (i / cs) * (Math.PI / 2);
    prof.push([radius * Math.sin(a), -length / 2 + radius * Math.cos(a)]);
  }
  return lathe(prof, radialSegments);
}

/** THREE.TorusGeometry(radius, tube, radialSegments, tubularSegments, arc) — XY 평면 */
export function torus(radius = 1, tube = 0.4, radialSegments = 12, tubularSegments = 48, arc = TAU) {
  const rs = Math.max(2, Math.floor(radialSegments));
  const ts = Math.max(3, Math.floor(tubularSegments));
  const pos = [];
  for (let j = 0; j <= rs; j++) {
    const v = (j / rs) * TAU;
    for (let i = 0; i <= ts; i++) {
      const u = (i / ts) * arc;
      pos.push((radius + tube * Math.cos(v)) * Math.cos(u), (radius + tube * Math.cos(v)) * Math.sin(u), tube * Math.sin(v));
    }
  }
  const idx = [];
  for (let j = 1; j <= rs; j++) {
    for (let i = 1; i <= ts; i++) {
      const a = (ts + 1) * j + i - 1;
      const b = (ts + 1) * (j - 1) + i - 1;
      const c = (ts + 1) * (j - 1) + i;
      const d = (ts + 1) * j + i;
      idx.push(a, b, d, b, c, d);
    }
  }
  return makeGeometry(pos, idx);
}

/** THREE.BoxGeometry(width, height, depth) */
export function box(w = 1, h = 1, d = 1) {
  const x = w / 2;
  const y = h / 2;
  const z = d / 2;
  const faces = [
    [[x, -y, z], [x, -y, -z], [x, y, -z], [x, y, z]],
    [[-x, -y, -z], [-x, -y, z], [-x, y, z], [-x, y, -z]],
    [[-x, y, z], [x, y, z], [x, y, -z], [-x, y, -z]],
    [[-x, -y, -z], [x, -y, -z], [x, -y, z], [-x, -y, z]],
    [[-x, -y, z], [x, -y, z], [x, y, z], [-x, y, z]],
    [[x, -y, -z], [-x, -y, -z], [-x, y, -z], [x, y, -z]],
  ];
  const pos = [];
  const idx = [];
  for (const f of faces) {
    const base = pos.length / 3;
    for (const p of f) pos.push(...p);
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  return makeGeometry(pos, idx);
}
