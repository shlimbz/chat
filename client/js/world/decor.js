// 헬스장 소품 (모두 움직이지 않으므로 StaticBatcher 가 하나로 합쳐 드로우콜이 거의 늘지 않음)
// 각 팩토리는 { group, colliders } 를 반환 (colliders 의 top = 윗면 높이)
import * as THREE from 'three';
import { m, PALETTE } from './equipment.js';

function box(parent, w, h, d, color, x, y, z, opts) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m(color, opts));
  mesh.position.set(x, y, z);
  parent.add(mesh);
  return mesh;
}
function cyl(parent, rt, rb, h, color, x, y, z, seg = 10) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m(color));
  mesh.position.set(x, y, z);
  parent.add(mesh);
  return mesh;
}
function sph(parent, r, color, x, y, z, seg = 10) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, seg, Math.max(6, seg - 2)), m(color));
  mesh.position.set(x, y, z);
  parent.add(mesh);
  return mesh;
}

/** 안내 데스크 (입구 옆) */
export function createReceptionDesk() {
  const g = new THREE.Group();
  box(g, 2.4, 1.0, 0.7, '#f4f4f4', 0, 0.5, 0);
  box(g, 2.5, 0.06, 0.8, PALETTE.wood, 0, 1.03, 0);
  box(g, 2.4, 0.25, 0.02, '#3d7dd8', 0, 0.75, 0.36);
  // 모니터 + 트로피
  box(g, 0.5, 0.32, 0.04, '#2b2d33', -0.6, 1.3, -0.1);
  box(g, 0.44, 0.26, 0.01, '#7fe3d4', -0.6, 1.3, -0.075, { emissive: '#2a8f84', emissiveIntensity: 0.5 });
  box(g, 0.06, 0.14, 0.06, '#2b2d33', -0.6, 1.1, -0.1);
  cyl(g, 0.08, 0.05, 0.16, '#e8b923', 0.7, 1.15, -0.1);
  sph(g, 0.07, '#e8b923', 0.7, 1.3, -0.1);
  return { group: g, colliders: [{ minX: -1.25, maxX: 1.25, minZ: -0.4, maxZ: 0.4, top: 1.06 }] };
}

/** 원판 거치대 */
export function createPlateTree() {
  const g = new THREE.Group();
  cyl(g, 0.35, 0.4, 0.08, PALETTE.frame, 0, 0.04, 0, 12);
  cyl(g, 0.04, 0.04, 1.3, PALETTE.frameLight, 0, 0.7, 0, 8);
  const pegs = [[0.3, 0.35], [-0.3, 0.55], [0.3, 0.8], [-0.3, 1.0]];
  pegs.forEach(([x, y], i) => {
    const r = 0.26 - i * 0.03;
    const pl = cyl(g, r, r, 0.05, i % 2 ? PALETTE.plate : '#3a3f4b', x * 0.6, y, 0, 14);
    pl.rotation.z = Math.PI / 2;
    const rim = cyl(g, r * 0.6, r * 0.6, 0.052, PALETTE.plateRim, x * 0.6, y, 0, 14);
    rim.rotation.z = Math.PI / 2;
  });
  return { group: g, colliders: [{ minX: -0.4, maxX: 0.4, minZ: -0.4, maxZ: 0.4, top: 1.35 }] };
}

/** 케틀벨 줄 (바닥) */
export function createKettlebellRow(count = 6) {
  const g = new THREE.Group();
  const colors = ['#e8505b', '#f9a03f', '#f6d55c', '#3caea3', '#3d7dd8', '#8e6bd8'];
  box(g, count * 0.42 + 0.1, 0.06, 0.5, PALETTE.rubber, 0, 0.03, 0);
  for (let i = 0; i < count; i++) {
    const x = (i - (count - 1) / 2) * 0.42;
    const s = 0.8 + i * 0.06;
    sph(g, 0.12 * s, colors[i % colors.length], x, 0.06 + 0.11 * s, 0, 12);
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.07 * s, 0.018, 6, 12, Math.PI), m(PALETTE.plate));
    handle.position.set(x, 0.06 + 0.2 * s, 0);
    g.add(handle);
  }
  return { group: g, colliders: [{ minX: -count * 0.21 - 0.05, maxX: count * 0.21 + 0.05, minZ: -0.25, maxZ: 0.25, top: 0.32 }] };
}

/** 요가 매트 + 짐볼 (스트레칭 구역) */
export function createStretchZone() {
  const g = new THREE.Group();
  const colors = ['#8e6bd8', '#3caea3', '#f08bb4'];
  colors.forEach((c, i) => box(g, 0.75, 0.02, 1.9, c, (i - 1) * 1.0, 0.012, 0));
  sph(g, 0.33, '#3d7dd8', 1.75, 0.33, -0.5, 14);
  sph(g, 0.28, '#f9a03f', 1.7, 0.28, 0.4, 14);
  // 폼롤러
  const roller = cyl(g, 0.08, 0.08, 0.6, '#3caea3', -1.75, 0.08, 0.3, 10);
  roller.rotation.z = Math.PI / 2;
  return {
    group: g,
    colliders: [
      { minX: 1.42, maxX: 2.08, minZ: -0.83, maxZ: -0.17, top: 0.66 },
      { minX: 1.42, maxX: 1.98, minZ: 0.12, maxZ: 0.68, top: 0.56 },
    ],
  };
}

/** 샌드백 (천장에 매달림) — swing 부분은 움직이므로 정적 병합에서 제외 */
export function createPunchingBag() {
  const g = new THREE.Group();
  cyl(g, 0.012, 0.012, 1.6, '#8a8f99', 0, 4.2, 0, 6);
  const swing = new THREE.Group();
  swing.position.y = 3.4; // 매달린 지점
  swing.userData.dynamic = true;
  const bag = new THREE.Mesh(new THREE.CapsuleGeometry(0.26, 0.9, 6, 14), m('#c0392b'));
  bag.position.y = -1.6;
  swing.add(bag);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.265, 0.265, 0.08, 14), m('#2b2d33'));
  band.position.y = -1.3;
  swing.add(band);
  const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.9, 6), m('#8a8f99'));
  chain.position.y = -0.55;
  swing.add(chain);
  g.add(swing);
  return { group: g, colliders: [{ minX: -0.3, maxX: 0.3, minZ: -0.3, maxZ: 0.3, top: 2.4 }], swing };
}

/** 사물함 줄 */
export function createLockers(count = 5) {
  const g = new THREE.Group();
  const colors = ['#3d7dd8', '#3caea3', '#f6d55c', '#e8505b', '#8e6bd8'];
  for (let i = 0; i < count; i++) {
    const x = (i - (count - 1) / 2) * 0.62;
    box(g, 0.6, 1.9, 0.5, colors[i % colors.length], x, 0.95, 0);
    box(g, 0.04, 0.16, 0.02, '#f4f4f4', x + 0.2, 1.05, 0.26);
    for (let v = 0; v < 3; v++) box(g, 0.3, 0.02, 0.01, '#2b2d33', x, 1.6 - v * 0.05, 0.255);
  }
  box(g, count * 0.62 + 0.1, 0.4, 0.4, PALETTE.wood, 0, 0.2, 0.75); // 앞 벤치
  return {
    group: g,
    colliders: [
      { minX: -count * 0.31, maxX: count * 0.31, minZ: -0.25, maxZ: 0.25, top: 1.9 },
      { minX: -count * 0.31 - 0.05, maxX: count * 0.31 + 0.05, minZ: 0.55, maxZ: 0.95, top: 0.4 },
    ],
  };
}

/** 수건 선반 */
export function createTowelShelf() {
  const g = new THREE.Group();
  box(g, 1.0, 1.2, 0.4, PALETTE.wood, 0, 0.6, 0);
  const colors = ['#f4f4f4', '#3d7dd8', '#f08bb4', '#3caea3'];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const col = colors[(r * 3 + c) % colors.length];
      box(g, 0.26, 0.12, 0.3, col, -0.3 + c * 0.3, 0.32 + r * 0.36, 0.02);
    }
  }
  return { group: g, colliders: [{ minX: -0.5, maxX: 0.5, minZ: -0.2, maxZ: 0.2, top: 1.2 }] };
}

/** 벽시계 (벽에 붙음, 충돌 없음) */
export function createWallClock() {
  const g = new THREE.Group();
  const face = cyl(g, 0.38, 0.38, 0.05, '#f4f4f4', 0, 0, 0, 24);
  face.rotation.x = Math.PI / 2;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.035, 6, 24), m('#2b2d33'));
  g.add(rim);
  box(g, 0.025, 0.24, 0.01, '#2b2d33', 0, 0.1, 0.035).rotation.z = 0.5;
  box(g, 0.02, 0.32, 0.01, '#e8505b', 0, 0.14, 0.04).rotation.z = -1.2;
  return { group: g, colliders: [] };
}

/** 스피커 (벽 높이) */
export function createSpeaker() {
  const g = new THREE.Group();
  box(g, 0.45, 0.65, 0.35, '#2b2d33', 0, 0, 0);
  for (const [y, r] of [[0.12, 0.12], [-0.16, 0.08]]) {
    const c = cyl(g, r, r, 0.03, '#59606e', 0, y, 0.17, 14);
    c.rotation.x = Math.PI / 2;
  }
  return { group: g, colliders: [] };
}

/** 바닥 트랙 라인 (헬스장 중앙을 도는 러닝 라인) */
export function createFloorTrack(w, d) {
  const g = new THREE.Group();
  const line = (x, z, lw, ld) => {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(lw, ld), m('#f6d55c'));
    p.rotation.x = -Math.PI / 2;
    p.position.set(x, 0.008, z);
    g.add(p);
  };
  const t = 0.08;
  line(0, -d / 2, w, t);
  line(0, d / 2, w, t);
  line(-w / 2, 0, t, d);
  line(w / 2, 0, t, d);
  return { group: g, colliders: [] };
}

/** 포스터 (글자 텍스처 — 별도 드로우콜이므로 몇 개만) */
export function createPoster(title, sub, bg, fg) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 360;
  const ctx = c.getContext('2d');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 256, 360);
  ctx.fillStyle = fg;
  ctx.textAlign = 'center';
  ctx.font = 'bold 52px "Arial Black", sans-serif';
  title.split('\n').forEach((l, i) => ctx.fillText(l, 128, 110 + i * 58, 236));
  ctx.font = 'bold 26px "Apple SD Gothic Neo","Malgun Gothic",sans-serif';
  ctx.fillText(sub, 128, 320, 236);
  ctx.strokeStyle = fg;
  ctx.lineWidth = 8;
  ctx.strokeRect(10, 10, 236, 340);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const g = new THREE.Group();
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 1.4), new THREE.MeshBasicMaterial({ map: tex }));
  g.add(mesh);
  return { group: g, colliders: [] };
}
