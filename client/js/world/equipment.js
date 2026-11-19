// 운동기구 / 소품 로우폴리 모델 팩토리
// 각 팩토리는 { group, colliders, interactPoint, anims } 를 반환합니다.
//  - colliders: 로컬 좌표 XZ 박스 + 윗면 높이(top) 목록 (CollisionWorld 에 등록)
//    → 낮은 부분(벤치 쿠션 등)은 점프로 올라서거나 넘을 수 있음
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

// ── 움직이는 부품 ────────────────────────────────────────
// 각 기구는 anims 목록을 반환하고, Gym.animateEquipment 가 운동 중일 때만 위치를 바꿉니다.
// 움직이는 부품은 그룹 하나 = 메시 하나로 병합되므로(StaticBatcher) 드로우콜 부담이 작습니다.
//  - kind 'k'     : 운동 진행도 k(0~1) 에 따라 dir 방향으로 amp 만큼 이동 (invert 면 1-k)
//  - kind 'hide'  : 사용 중에는 숨김 (덤벨을 들고 가는 것처럼)
//  - kind 'belt'  : 시간에 따라 계속 흐름 (러닝머신 벨트 무늬)
//  - kind 'cable' : 다른 부품(follow)을 따라 길이가 늘었다 줄었다 (케이블)
function movable(parent, name) {
  const g = new THREE.Group();
  g.name = name;
  g.userData.dynamic = true;
  parent.add(g);
  return g;
}

/** 웨이트 스택: 아래쪽은 고정, 위쪽 몇 장 + 핀이 움직임 */
function weightStack(g, z, count, liftCount) {
  const rods = [];
  for (const s of [-1, 1]) rods.push(cyl(g, 0.012, 0.12 + count * 0.065 + 0.35, PALETTE.steel, s * 0.12, (0.12 + count * 0.065 + 0.35) / 2, z, 'y', 6));
  for (let i = 0; i < count - liftCount; i++) box(g, 0.34, 0.058, 0.2, i % 2 ? PALETTE.plate : '#33363d', 0, 0.12 + i * 0.065, z);
  const top = movable(g, 'Stack');
  for (let i = count - liftCount; i < count; i++) box(top, 0.34, 0.058, 0.2, i % 2 ? PALETTE.plate : '#33363d', 0, 0.12 + i * 0.065, z);
  box(top, 0.36, 0.03, 0.22, PALETTE.frameLight, 0, 0.12 + count * 0.065 + 0.01, z); // 상단 캡
  cyl(top, 0.01, 0.4, PALETTE.steel, 0, 0.12 + count * 0.065 + 0.2, z, 'y', 6); // 셀렉터 봉
  cyl(top, 0.018, 0.08, '#e8505b', 0.14, 0.12 + (count - liftCount - 1) * 0.065, z, 'x', 6); // 무게 핀
  return top;
}

// ── 벤치프레스 ───────────────────────────────────────────
export function createBenchPress() {
  const g = new THREE.Group();
  // 벤치 (머리는 -z 쪽) — 쿠션 + 테두리 + 다리
  box(g, 0.36, 0.1, 1.25, PALETTE.pad, 0, 0.45, 0.05);
  box(g, 0.32, 0.03, 1.21, PALETTE.padDark, 0, 0.39, 0.05);
  box(g, 0.12, 0.06, 1.1, PALETTE.frame, 0, 0.35, 0.05);
  box(g, 0.2, 0.34, 0.08, PALETTE.frame, 0, 0.19, 0.55);
  box(g, 0.2, 0.34, 0.08, PALETTE.frame, 0, 0.19, -0.45);
  box(g, 0.5, 0.05, 0.1, PALETTE.frame, 0, 0.025, 0.55);
  box(g, 0.5, 0.05, 0.1, PALETTE.frame, 0, 0.025, -0.45);
  // 거치대 (기둥 + J훅 + 안전바 + 원판 꽂이)
  for (const s of [-1, 1]) {
    box(g, 0.08, 1.3, 0.08, PALETTE.frame, s * 0.55, 0.65, -0.62);
    box(g, 0.08, 0.05, 0.6, PALETTE.frame, s * 0.55, 0.025, -0.6);
    box(g, 0.1, 0.04, 0.12, PALETTE.frameLight, s * 0.55, 1.1, -0.55); // J훅
    box(g, 0.03, 0.08, 0.03, PALETTE.frameLight, s * 0.55, 1.14, -0.5);
    box(g, 0.06, 0.04, 0.32, PALETTE.steel, s * 0.55, 0.82, -0.44); // 안전바
    cyl(g, 0.025, 0.2, PALETTE.steel, s * 0.62, 0.45, -0.76, 'x', 6); // 원판 꽂이
    cyl(g, 0.2, 0.04, PALETTE.plate, s * 0.69, 0.45, -0.76, 'x', 10);
    cyl(g, 0.15, 0.042, PALETTE.plateRim, s * 0.69, 0.45, -0.76, 'x', 10);
  }
  box(g, 1.18, 0.06, 0.06, PALETTE.frame, 0, 0.4, -0.68);
  box(g, 1.18, 0.06, 0.06, PALETTE.frame, 0, 1.27, -0.62);
  const bar = movable(g, 'Barbell');
  barbell(bar, 0, 1.15, -0.55, 1.9);
  return {
    group: g,
    colliders: [
      { minX: -0.22, maxX: 0.22, minZ: -0.5, maxZ: 0.7, top: 0.5 }, // 벤치 쿠션 (올라설 수 있음)
      { minX: -1.0, maxX: 1.0, minZ: -0.8, maxZ: -0.42, top: 1.36 }, // 거치대 + 바벨
    ],
    interactPoint: { x: 0, z: 1.15 },
    anims: [{ obj: bar, kind: 'k', dir: [0, -1, 0], amp: 0.17, invert: true }],
  };
}

// ── 덤벨 랙 ────────────────────────────────────────────
export function createDumbbellRack() {
  const g = new THREE.Group();
  const W = 2.8;
  for (const s of [-1, 0, 1]) {
    box(g, 0.08, 0.8, 0.5, PALETTE.frame, s * (W / 2 - 0.05), 0.4, 0);
    box(g, 0.14, 0.04, 0.56, PALETTE.frameLight, s * (W / 2 - 0.05), 0.02, 0);
  }
  // 경사진 받침 2단
  const t1 = box(g, W, 0.04, 0.24, PALETTE.frameLight, 0, 0.75, -0.1);
  t1.rotation.x = 0.18;
  const t2 = box(g, W, 0.04, 0.24, PALETTE.frameLight, 0, 0.45, 0.1);
  t2.rotation.x = 0.18;
  box(g, W, 0.06, 0.05, '#f6d55c', 0, 0.62, 0.24); // 무게 라벨 띠
  const colors = ['#e8505b', '#f9a03f', '#f6d55c', '#3caea3', '#3d7dd8', '#8e6bd8'];
  const taken = movable(g, 'TakenDumbbells');
  for (let i = 0; i < 6; i++) {
    const x = -W / 2 + 0.3 + i * ((W - 0.6) / 5);
    dumbbell(g, x, 0.82, -0.1, 0.8 + i * 0.06, colors[i]);
    // 가운데 두 개는 사용자가 들고 운동하는 덤벨 → 운동 중엔 랙에서 사라짐
    dumbbell(i === 2 || i === 3 ? taken : g, x, 0.52, 0.1, 1.0 + i * 0.07, PALETTE.plate);
  }
  return {
    group: g,
    colliders: [{ minX: -W / 2 - 0.05, maxX: W / 2 + 0.05, minZ: -0.3, maxZ: 0.3, top: 0.9 }],
    interactPoint: { x: 0, z: 0.95 },
    anims: [{ obj: taken, kind: 'hide' }],
  };
}

// ── 러닝머신 (콘솔이 -z 쪽, 사용자는 +z 뒤에서 올라탐) ─────
export function createTreadmill() {
  const g = new THREE.Group();
  box(g, 0.82, 0.14, 1.9, PALETTE.frame, 0, 0.07, 0);
  box(g, 0.62, 0.02, 1.72, PALETTE.rubber, 0, 0.17, 0.05);
  // 앞쪽 모터 커버 + 뒤쪽 롤러
  box(g, 0.82, 0.16, 0.26, PALETTE.frameLight, 0, 0.17, -0.86);
  cyl(g, 0.045, 0.64, PALETTE.steel, 0, 0.15, 0.93, 'x', 8);
  for (const s of [-1, 1]) {
    box(g, 0.1, 0.06, 1.9, PALETTE.frameLight, s * 0.36, 0.19, 0); // 발판 옆 레일
    // 콘솔 기둥 + 손잡이
    const post = box(g, 0.07, 1.2, 0.07, PALETTE.frameLight, s * 0.37, 0.7, -0.82);
    post.rotation.x = -0.12;
    box(g, 0.05, 0.05, 0.55, PALETTE.steel, s * 0.37, 1.05, -0.52);
    box(g, 0.06, 0.06, 0.12, PALETTE.rubber, s * 0.37, 1.05, -0.3); // 심박 센서 그립
  }
  const consoleBox = box(g, 0.8, 0.34, 0.12, PALETTE.frame, 0, 1.32, -0.9);
  consoleBox.rotation.x = -0.5;
  const screen = box(g, 0.5, 0.18, 0.02, PALETTE.screen, 0, 1.35, -0.84, { emissive: '#2a8f84', emissiveIntensity: 0.6 });
  screen.rotation.x = -0.5;
  for (const [x, c] of [[-0.31, '#e8505b'], [0.31, '#3caea3']]) {
    const btn = box(g, 0.06, 0.06, 0.02, c, x, 1.3, -0.86);
    btn.rotation.x = -0.5;
  }
  // 벨트 무늬 (뒤로 흘러감)
  const belt = movable(g, 'Belt');
  for (let z = -0.72; z <= 0.72; z += 0.18) box(belt, 0.6, 0.006, 0.035, '#454a54', 0, 0.183, z);
  return {
    group: g,
    colliders: [
      { minX: -0.45, maxX: 0.45, minZ: -0.6, maxZ: 0.98, top: 0.2 }, // 발판 (걸어서 올라감)
      { minX: -0.45, maxX: 0.45, minZ: -1.05, maxZ: -0.6, top: 1.5 }, // 계기판
    ],
    interactPoint: { x: 0, z: 1.4 },
    anims: [{ obj: belt, kind: 'belt', axis: 2, speed: 2.4, gap: 0.18 }],
  };
}

// ── 레그프레스 (45도 슬레드) ─────────────────────────────
export function createLegPress() {
  const g = new THREE.Group();
  box(g, 1.0, 0.1, 2.2, PALETTE.frame, 0, 0.05, 0);
  // 레일 2줄 (+z 쪽이 낮고 -z 쪽으로 올라감)
  for (const s of [-1, 1]) {
    const rail = box(g, 0.08, 0.08, 1.7, PALETTE.frameLight, s * 0.3, 0.78, -0.42);
    rail.rotation.x = 0.7;
    box(g, 0.08, 1.25, 0.08, PALETTE.frame, s * 0.3, 0.62, -1.0); // 레일 지지대
  }
  // 시트 + 등받이 + 손잡이
  box(g, 0.5, 0.12, 0.5, PALETTE.pad, 0, 0.42, 0.55);
  const back = box(g, 0.5, 0.65, 0.1, PALETTE.pad, 0, 0.7, 0.85);
  back.rotation.x = -0.6;
  box(g, 0.2, 0.36, 0.2, PALETTE.frame, 0, 0.2, 0.6);
  for (const s of [-1, 1]) cyl(g, 0.025, 0.25, PALETTE.rubber, s * 0.33, 0.45, 0.5, 'z', 6);
  // 발판 슬레드 + 원판 (레일을 따라 움직임)
  const sled = movable(g, 'Sled');
  const plate = box(sled, 0.7, 0.55, 0.08, PALETTE.frameLight, 0, 1.0, -0.55);
  plate.rotation.x = 0.7;
  const grip = box(sled, 0.6, 0.06, 0.06, '#c9ced6', 0, 0.82, -0.36);
  grip.rotation.x = 0.7;
  for (const s of [-1, 1]) {
    cyl(sled, 0.03, 0.22, PALETTE.steel, s * 0.42, 0.95, -0.75, 'x', 6);
    cyl(sled, 0.21, 0.06, PALETTE.plate, s * 0.45, 0.95, -0.75, 'x', 10);
    cyl(sled, 0.15, 0.065, PALETTE.plateRim, s * 0.45, 0.95, -0.75, 'x', 10);
    cyl(sled, 0.16, 0.05, PALETTE.plate, s * 0.5, 0.95, -0.75, 'x', 10);
  }
  return {
    group: g,
    colliders: [
      { minX: -0.6, maxX: 0.6, minZ: 0.2, maxZ: 1.15, top: 0.55 }, // 시트 쪽
      { minX: -0.6, maxX: 0.6, minZ: -1.15, maxZ: 0.2, top: 1.3 }, // 슬레드
    ],
    interactPoint: { x: 1.05, z: 0.5 },
    // 다리를 펴면(k=1) 슬레드가 레일을 따라 위로 밀려남
    anims: [{ obj: sled, kind: 'k', dir: [0, 0.64, -0.77], amp: 0.28 }],
  };
}

// ── 숄더프레스 머신 ─────────────────────────────────────
export function createShoulderPress() {
  const g = new THREE.Group();
  box(g, 1.1, 0.08, 1.1, PALETTE.frame, 0, 0.04, 0);
  box(g, 0.5, 0.1, 0.45, PALETTE.pad, 0, 0.5, 0.1);
  box(g, 0.45, 0.75, 0.1, PALETTE.pad, 0, 0.95, -0.15);
  box(g, 0.12, 0.45, 0.12, PALETTE.frame, 0, 0.25, 0.1);
  for (const s of [-1, 1]) box(g, 0.08, 1.9, 0.08, PALETTE.frame, s * 0.48, 0.95, -0.3);
  box(g, 1.04, 0.08, 0.08, PALETTE.frame, 0, 1.9, -0.3);
  cyl(g, 0.07, 0.04, PALETTE.steel, 0, 1.82, -0.45, 'x', 10); // 도르래
  // 손잡이 (밀어 올리면 같이 올라감)
  const arms = movable(g, 'Handles');
  for (const s of [-1, 1]) {
    box(arms, 0.05, 0.05, 0.42, PALETTE.steel, s * 0.38, 1.4, 0.05);
    cyl(arms, 0.035, 0.18, PALETTE.rubber, s * 0.38, 1.4, 0.28, 'y', 6);
    box(arms, 0.06, 0.06, 0.06, PALETTE.frameLight, s * 0.44, 1.4, -0.16);
  }
  const stack = weightStack(g, -0.45, 8, 3);
  return {
    group: g,
    colliders: [{ minX: -0.6, maxX: 0.6, minZ: -0.6, maxZ: 0.45, top: 1.95 }],
    interactPoint: { x: 0, z: 0.95 },
    anims: [
      { obj: arms, kind: 'k', dir: [0, 1, 0], amp: 0.3 },
      { obj: stack, kind: 'k', dir: [0, 1, 0], amp: 0.22 },
    ],
  };
}

// ── 랫풀다운 ──────────────────────────────────────────
export function createLatPulldown() {
  const g = new THREE.Group();
  box(g, 1.0, 0.08, 1.4, PALETTE.frame, 0, 0.04, -0.1);
  box(g, 0.12, 2.35, 0.12, PALETTE.frame, 0, 1.17, -0.6);
  box(g, 0.14, 0.12, 1.12, PALETTE.frame, 0, 2.3, -0.1);
  cyl(g, 0.06, 0.05, PALETTE.steel, 0, 2.22, 0.4, 'x', 10); // 앞 도르래
  cyl(g, 0.06, 0.05, PALETTE.steel, 0, 2.22, -0.45, 'x', 10); // 뒤 도르래
  // 시트 + 무릎 고정 패드
  box(g, 0.45, 0.1, 0.42, PALETTE.pad, 0, 0.5, 0.3);
  box(g, 0.1, 0.45, 0.1, PALETTE.frame, 0, 0.25, 0.3);
  box(g, 0.08, 0.3, 0.08, PALETTE.frame, 0, 0.62, 0.12);
  cyl(g, 0.07, 0.5, PALETTE.pad, 0, 0.75, 0.12, 'x', 8);
  // 바 + 손잡이 (당기면 내려옴)
  const bar = movable(g, 'PullBar');
  box(bar, 1.2, 0.04, 0.04, PALETTE.steel, 0, 1.65, 0.4);
  const bend = box(bar, 0.3, 0.035, 0.035, PALETTE.steel, 0, 1.68, 0.4);
  bend.scale.x = 1;
  for (const s of [-1, 1]) cyl(bar, 0.03, 0.18, PALETTE.rubber, s * 0.52, 1.65, 0.4, 'x', 6);
  cyl(bar, 0.02, 0.06, PALETTE.frameLight, 0, 1.69, 0.4, 'y', 6);
  // 케이블 (도르래 ~ 바 사이, 길이가 늘었다 줄었다)
  const cable = movable(g, 'Cable');
  cyl(cable, 0.007, 1, '#222222', 0, 0, 0, 'y', 5);
  cable.position.set(0, 1.95, 0.4);
  const stack = weightStack(g, -0.45, 10, 4);
  return {
    group: g,
    colliders: [{ minX: -0.62, maxX: 0.62, minZ: -0.8, maxZ: 0.55, top: 2.4 }],
    interactPoint: { x: 0, z: 1.05 },
    anims: [
      { obj: bar, kind: 'k', dir: [0, -1, 0], amp: 0.45 },
      { obj: stack, kind: 'k', dir: [0, 1, 0], amp: 0.32 },
      { obj: cable, kind: 'cable', follow: bar, top: 2.17, bottomOffset: 1.7 },
    ],
  };
}

// ── 소품 ──────────────────────────────────────────────
export function createRestBench(length = 2.0) {
  const g = new THREE.Group();
  for (let i = 0; i < 3; i++) box(g, length, 0.05, 0.12, PALETTE.wood, 0, 0.45, -0.14 + i * 0.14);
  for (const s of [-1, 1]) {
    box(g, 0.08, 0.42, 0.38, PALETTE.frame, s * (length / 2 - 0.15), 0.21, 0);
  }
  return { group: g, colliders: [{ minX: -length / 2, maxX: length / 2, minZ: -0.24, maxZ: 0.24, top: 0.48 }] };
}

export function createWaterCooler() {
  const g = new THREE.Group();
  box(g, 0.4, 0.95, 0.4, PALETTE.white, 0, 0.475, 0);
  box(g, 0.22, 0.12, 0.05, '#3d7dd8', 0, 0.8, 0.21);
  cyl(g, 0.15, 0.4, '#8fd3ff', 0, 1.15, 0, 'y', 10, { transparent: true, opacity: 0.75 });
  return { group: g, colliders: [{ minX: -0.25, maxX: 0.25, minZ: -0.25, maxZ: 0.25, top: 1.35 }] };
}

export function createPlant() {
  const g = new THREE.Group();
  cyl(g, 0.2, 0.4, '#d9a066', 0, 0.2, 0, 'y', 8);
  const leaves = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42, 0), m(PALETTE.green));
  leaves.position.y = 0.85;
  leaves.scale.set(1, 1.3, 1);
  leaves.castShadow = true;
  g.add(leaves);
  return { group: g, colliders: [{ minX: -0.25, maxX: 0.25, minZ: -0.25, maxZ: 0.25, top: 1.4 }] };
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
  return { group: g, colliders: [{ minX: -0.48, maxX: 0.48, minZ: -0.38, maxZ: 0.38, top: 1.9 }] };
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
  return { group: g, colliders: [{ minX: -0.72, maxX: 0.72, minZ: -0.2, maxZ: 0.2, top: 2.25 }] };
}
