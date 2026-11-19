// 운동기구 / 소품 로우폴리 모델 팩토리
// 각 팩토리는 { group, collider, interactPoint, useFacing } 를 반환합니다.
//  - collider: 로컬 좌표 XZ 박스 (CollisionWorld 에 등록)
//  - interactPoint: 로컬 좌표, 플레이어가 이 지점 근처에서 E 를 누르면 상호작용
//  - useFacing: 운동할 때 캐릭터가 바라볼 로컬 방향(라디안) — Phase 4 에서 사용
import * as THREE from 'three';

const matCache = new Map();
export function m(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (!matCache.has(key)) {
    // 머티리얼은 정적 병합(StaticBatcher) 시 정점 색상으로 변환되므로 색상 정보 전달용입니다.
    const { metalness, roughness, ...rest } = opts; // Lambert 에 없는 속성 제거
    matCache.set(key, new THREE.MeshLambertMaterial({ color, flatShading: true, ...rest }));
  }
  return matCache.get(key);
}

export const PALETTE = {
  frame: '#3a3f4b',
  frameLight: '#59606e',
  pad: '#e8505b',
  padDark: '#b43c45',
  steel: '#c9ced6',
  plate: '#25272c',
  plateRim: '#f6d55c',
  rubber: '#2e3138',
  wood: '#c8925a',
  woodDark: '#9a6a3a',
  screen: '#7fe3d4',
  white: '#f4f4f4',
  green: '#5bbf6a',
};

function box(parent, w, h, d, color, x, y, z, opts) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m(color, opts));
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function cyl(parent, r, h, color, x, y, z, axis = 'y', seg = 8, opts) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), m(color, opts));
  mesh.position.set(x, y, z);
  if (axis === 'x') mesh.rotation.z = Math.PI / 2;
  if (axis === 'z') mesh.rotation.x = Math.PI / 2;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

/** 원판 + 봉 (x축 방향) */
function barbell(parent, x, y, z, length = 1.9) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  parent.add(g);
  cyl(g, 0.018, length, PALETTE.steel, 0, 0, 0, 'x', 6, { metalness: 0.4, roughness: 0.4 });
  for (const s of [-1, 1]) {
    cyl(g, 0.21, 0.05, PALETTE.plate, s * (length / 2 - 0.2), 0, 0, 'x', 10);
    cyl(g, 0.16, 0.052, PALETTE.plateRim, s * (length / 2 - 0.2), 0, 0, 'x', 10);
    cyl(g, 0.15, 0.04, PALETTE.plate, s * (length / 2 - 0.26), 0, 0, 'x', 10);
    cyl(g, 0.035, 0.05, PALETTE.steel, s * (length / 2 - 0.13), 0, 0, 'x', 6);
  }
  return g;
}

function dumbbell(parent, x, y, z, size = 1, color = PALETTE.plate) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  parent.add(g);
  cyl(g, 0.016, 0.16 * size, PALETTE.steel, 0, 0, 0, 'x', 6);
  for (const s of [-1, 1]) cyl(g, 0.05 * size, 0.06 * size, color, s * 0.1 * size, 0, 0, 'x', 6);
  return g;
}

// ── 벤치프레스 ───────────────────────────────────────────
export function createBenchPress() {
  const g = new THREE.Group();
  // 벤치 (머리는 -z 쪽)
  box(g, 0.36, 0.1, 1.25, PALETTE.pad, 0, 0.45, 0.05);
  box(g, 0.2, 0.36, 0.08, PALETTE.frame, 0, 0.22, 0.55);
  box(g, 0.2, 0.36, 0.08, PALETTE.frame, 0, 0.22, -0.45);
  box(g, 0.5, 0.05, 0.1, PALETTE.frame, 0, 0.025, 0.55);
  box(g, 0.5, 0.05, 0.1, PALETTE.frame, 0, 0.025, -0.45);
  // 거치대
  for (const s of [-1, 1]) {
    box(g, 0.08, 1.25, 0.08, PALETTE.frame, s * 0.55, 0.625, -0.62);
    box(g, 0.08, 0.05, 0.5, PALETTE.frame, s * 0.55, 0.025, -0.55);
    box(g, 0.12, 0.05, 0.1, PALETTE.frameLight, s * 0.55, 1.1, -0.55);
  }
  box(g, 1.18, 0.06, 0.06, PALETTE.frame, 0, 0.4, -0.68);
  const bar = barbell(g, 0, 1.15, -0.55, 1.9);
  bar.name = 'Barbell';
  bar.userData.dynamic = true; // Phase 4 에서 움직일 부품 → 정적 병합 제외
  return {
    group: g,
    collider: { minX: -1.0, maxX: 1.0, minZ: -0.85, maxZ: 0.72 },
    interactPoint: { x: 0, z: 1.15 },
    movable: { barbell: bar },
  };
}

// ── 덤벨 랙 ────────────────────────────────────────────
export function createDumbbellRack() {
  const g = new THREE.Group();
  const W = 2.8;
  for (const s of [-1, 0, 1]) {
    box(g, 0.08, 0.8, 0.5, PALETTE.frame, s * (W / 2 - 0.05), 0.4, 0);
  }
  box(g, W, 0.05, 0.22, PALETTE.frameLight, 0, 0.75, -0.1);
  box(g, W, 0.05, 0.22, PALETTE.frameLight, 0, 0.45, 0.1);
  const colors = ['#e8505b', '#f9a03f', '#f6d55c', '#3caea3', '#3d7dd8', '#8e6bd8'];
  for (let i = 0; i < 6; i++) {
    const x = -W / 2 + 0.3 + i * ((W - 0.6) / 5);
    dumbbell(g, x, 0.82, -0.1, 0.8 + i * 0.06, colors[i]);
    dumbbell(g, x, 0.52, 0.1, 1.0 + i * 0.07, PALETTE.plate);
  }
  return {
    group: g,
    collider: { minX: -W / 2 - 0.05, maxX: W / 2 + 0.05, minZ: -0.3, maxZ: 0.3 },
    interactPoint: { x: 0, z: 0.95 },
  };
}

// ── 러닝머신 (콘솔이 -z 쪽, 사용자는 +z 뒤에서 올라탐) ─────
export function createTreadmill() {
  const g = new THREE.Group();
  box(g, 0.82, 0.16, 1.9, PALETTE.frame, 0, 0.08, 0);
  box(g, 0.62, 0.02, 1.7, PALETTE.rubber, 0, 0.17, 0.05);
  for (const s of [-1, 1]) {
    box(g, 0.08, 0.15, 1.9, PALETTE.frameLight, s * 0.37, 0.15, 0);
    // 콘솔 기둥 + 손잡이
    const post = box(g, 0.07, 1.2, 0.07, PALETTE.frameLight, s * 0.37, 0.7, -0.82);
    post.rotation.x = -0.12;
    box(g, 0.05, 0.05, 0.55, PALETTE.steel, s * 0.37, 1.05, -0.52);
  }
  const consoleBox = box(g, 0.78, 0.32, 0.12, PALETTE.frame, 0, 1.32, -0.9);
  consoleBox.rotation.x = -0.5;
  const screen = box(g, 0.5, 0.18, 0.02, PALETTE.screen, 0, 1.34, -0.85, { emissive: '#2a8f84', emissiveIntensity: 0.6 });
  screen.rotation.x = -0.5;
  return {
    group: g,
    collider: { minX: -0.45, maxX: 0.45, minZ: -1.05, maxZ: 0.98 },
    interactPoint: { x: 0, z: 1.4 },
  };
}

// ── 레그프레스 ─────────────────────────────────────────
export function createLegPress() {
  const g = new THREE.Group();
  box(g, 1.0, 0.1, 2.2, PALETTE.frame, 0, 0.05, 0);
  const rail = box(g, 0.7, 0.08, 1.6, PALETTE.frameLight, 0, 0.75, -0.4);
  rail.rotation.x = 0.7;
  // 시트 + 등받이
  box(g, 0.5, 0.12, 0.5, PALETTE.pad, 0, 0.42, 0.55);
  const back = box(g, 0.5, 0.65, 0.1, PALETTE.pad, 0, 0.7, 0.85);
  back.rotation.x = -0.6;
  box(g, 0.2, 0.36, 0.2, PALETTE.frame, 0, 0.2, 0.6);
  // 발판 슬레드
  const sled = box(g, 0.7, 0.55, 0.08, PALETTE.frameLight, 0, 1.0, -0.55);
  sled.rotation.x = 0.7;
  for (const s of [-1, 1]) {
    cyl(g, 0.21, 0.06, PALETTE.plate, s * 0.45, 0.95, -0.75, 'x', 8);
    cyl(g, 0.15, 0.065, PALETTE.plateRim, s * 0.45, 0.95, -0.75, 'x', 8);
  }
  return {
    group: g,
    collider: { minX: -0.6, maxX: 0.6, minZ: -1.15, maxZ: 1.15 },
    interactPoint: { x: 1.05, z: 0.5 },
  };
}

// ── 숄더프레스 머신 ─────────────────────────────────────
export function createShoulderPress() {
  const g = new THREE.Group();
  box(g, 1.1, 0.08, 1.1, PALETTE.frame, 0, 0.04, 0);
  box(g, 0.5, 0.1, 0.45, PALETTE.pad, 0, 0.5, 0.1);
  box(g, 0.45, 0.75, 0.1, PALETTE.pad, 0, 0.95, -0.15);
  box(g, 0.12, 0.45, 0.12, PALETTE.frame, 0, 0.25, 0.1);
  for (const s of [-1, 1]) {
    box(g, 0.08, 1.9, 0.08, PALETTE.frame, s * 0.48, 0.95, -0.3);
    box(g, 0.05, 0.05, 0.4, PALETTE.steel, s * 0.38, 1.45, 0.05);
    cyl(g, 0.035, 0.18, PALETTE.rubber, s * 0.38, 1.45, 0.28, 'y', 6);
  }
  box(g, 1.04, 0.08, 0.08, PALETTE.frame, 0, 1.9, -0.3);
  // 웨이트 스택
  for (let i = 0; i < 8; i++) box(g, 0.34, 0.06, 0.2, i % 2 ? PALETTE.plate : '#33363d', 0, 0.12 + i * 0.065, -0.45);
  return {
    group: g,
    collider: { minX: -0.6, maxX: 0.6, minZ: -0.6, maxZ: 0.45 },
    interactPoint: { x: 0, z: 0.95 },
  };
}

// ── 랫풀다운 ──────────────────────────────────────────
export function createLatPulldown() {
  const g = new THREE.Group();
  box(g, 1.0, 0.08, 1.4, PALETTE.frame, 0, 0.04, -0.1);
  box(g, 0.12, 2.35, 0.12, PALETTE.frame, 0, 1.17, -0.6);
  box(g, 0.12, 0.1, 1.1, PALETTE.frame, 0, 2.3, -0.1);
  cyl(g, 0.006, 0.6, '#222222', 0, 1.95, 0.4);
  const bar = box(g, 1.2, 0.04, 0.04, PALETTE.steel, 0, 1.65, 0.4);
  bar.name = 'PullBar';
  bar.userData.dynamic = true;
  for (const s of [-1, 1]) cyl(g, 0.03, 0.18, PALETTE.rubber, s * 0.52, 1.65, 0.4, 'x', 6);
  box(g, 0.45, 0.1, 0.42, PALETTE.pad, 0, 0.5, 0.3);
  box(g, 0.1, 0.45, 0.1, PALETTE.frame, 0, 0.25, 0.3);
  cyl(g, 0.07, 0.5, PALETTE.pad, 0, 0.75, 0.12, 'x', 8);
  for (let i = 0; i < 10; i++) box(g, 0.34, 0.06, 0.2, i % 2 ? PALETTE.plate : '#33363d', 0, 0.12 + i * 0.065, -0.45);
  return {
    group: g,
    collider: { minX: -0.62, maxX: 0.62, minZ: -0.8, maxZ: 0.55 },
    interactPoint: { x: 0, z: 1.05 },
  };
}

// ── 소품 ──────────────────────────────────────────────
export function createRestBench(length = 2.0) {
  const g = new THREE.Group();
  for (let i = 0; i < 3; i++) box(g, length, 0.05, 0.12, PALETTE.wood, 0, 0.45, -0.14 + i * 0.14);
  for (const s of [-1, 1]) {
    box(g, 0.08, 0.42, 0.38, PALETTE.frame, s * (length / 2 - 0.15), 0.21, 0);
  }
  return { group: g, collider: { minX: -length / 2, maxX: length / 2, minZ: -0.24, maxZ: 0.24 } };
}

export function createWaterCooler() {
  const g = new THREE.Group();
  box(g, 0.4, 0.95, 0.4, PALETTE.white, 0, 0.475, 0);
  box(g, 0.22, 0.12, 0.05, '#3d7dd8', 0, 0.8, 0.21);
  cyl(g, 0.15, 0.4, '#8fd3ff', 0, 1.15, 0, 'y', 10, { transparent: true, opacity: 0.75 });
  return { group: g, collider: { minX: -0.25, maxX: 0.25, minZ: -0.25, maxZ: 0.25 } };
}

export function createPlant() {
  const g = new THREE.Group();
  cyl(g, 0.2, 0.4, '#d9a066', 0, 0.2, 0, 'y', 8);
  const leaves = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42, 0), m(PALETTE.green));
  leaves.position.y = 0.85;
  leaves.scale.set(1, 1.3, 1);
  leaves.castShadow = true;
  g.add(leaves);
  return { group: g, collider: { minX: -0.25, maxX: 0.25, minZ: -0.25, maxZ: 0.25 } };
}

export function createVendingMachine() {
  const g = new THREE.Group();
  box(g, 0.9, 1.9, 0.7, '#3d7dd8', 0, 0.95, 0);
  box(g, 0.6, 1.0, 0.02, '#cfefff', -0.08, 1.2, 0.36, { emissive: '#7ab8d8', emissiveIntensity: 0.35 });
  const colors = ['#e8505b', '#f6d55c', '#3caea3', '#f9a03f'];
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) box(g, 0.08, 0.16, 0.04, colors[(r + c) % 4], -0.3 + c * 0.14, 0.85 + r * 0.24, 0.38);
  }
  box(g, 0.14, 0.4, 0.03, '#2b2d33', 0.33, 1.2, 0.36);
  return { group: g, collider: { minX: -0.48, maxX: 0.48, minZ: -0.38, maxZ: 0.38 } };
}

/**
 * 캔버스 텍스처로 글자를 그린 안내판
 * @param {string} title
 * @param {string[]} lines
 */
export function createSignboard(title, lines) {
  const g = new THREE.Group();
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 384;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#2b2d33';
  ctx.fillRect(0, 0, 512, 384);
  ctx.fillStyle = '#f6d55c';
  ctx.fillRect(0, 0, 512, 78);
  ctx.fillStyle = '#2b2d33';
  ctx.font = 'bold 46px "Apple SD Gothic Neo","Malgun Gothic",sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(title, 256, 41);
  ctx.fillStyle = '#ffffff';
  ctx.font = '26px "Apple SD Gothic Neo","Malgun Gothic",sans-serif';
  ctx.textAlign = 'left';
  lines.forEach((line, i) => ctx.fillText(line, 34, 120 + i * 42));
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;

  box(g, 0.08, 1.2, 0.08, PALETTE.frame, 0, 0.6, -0.03);
  box(g, 0.6, 0.05, 0.4, PALETTE.frame, 0, 0.025, 0);
  box(g, 1.44, 1.1, 0.06, PALETTE.frame, 0, 1.65, -0.03);
  const face = new THREE.Mesh(new THREE.PlaneGeometry(1.36, 1.02), new THREE.MeshBasicMaterial({ map: tex }));
  face.position.set(0, 1.65, 0.002);
  g.add(face);
  return { group: g, collider: { minX: -0.72, maxX: 0.72, minZ: -0.2, maxZ: 0.2 } };
}
