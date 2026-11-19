// 헬스장 3D 공간 구성: 바닥/벽/조명/거울/운동기구/소품 배치 + 충돌 영역 등록
import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { CollisionWorld } from './CollisionWorld.js';
import {
  createBenchPress, createDumbbellRack, createTreadmill, createLegPress, createShoulderPress,
  createLatPulldown, createRestBench, createWaterCooler, createPlant, createVendingMachine,
  createSignboard, m,
} from './equipment.js';
import { EQUIPMENT_TYPES } from '../shared/equipmentTypes.js';

export const GYM_SIZE = { width: 32, depth: 24, height: 5 };
export const SPAWN_POINT = { x: 0, z: 8, rotY: Math.PI }; // 입구 쪽, 헬스장 안쪽(-z)을 바라봄

// 운동기구 배치표 — 기구를 추가/이동할 때는 이 표만 수정하면 됩니다.
// id 는 Phase 2 이후 서버와 "누가 어떤 기구를 사용 중인지" 동기화할 때 사용합니다.
const EQUIPMENT_LAYOUT = [
  { id: 'bench-1', type: 'benchpress', x: -12.5, z: -7, rotY: 0 },
  { id: 'bench-2', type: 'benchpress', x: -9, z: -7, rotY: 0 },
  { id: 'dumbbell-1', type: 'dumbbell', x: -1.6, z: -10.6, rotY: 0 },
  { id: 'dumbbell-2', type: 'dumbbell', x: 1.6, z: -10.6, rotY: 0 },
  { id: 'treadmill-1', type: 'treadmill', x: 7.5, z: -9, rotY: 0 },
  { id: 'treadmill-2', type: 'treadmill', x: 9.5, z: -9, rotY: 0 },
  { id: 'treadmill-3', type: 'treadmill', x: 11.5, z: -9, rotY: 0 },
  { id: 'treadmill-4', type: 'treadmill', x: 13.5, z: -9, rotY: 0 },
  { id: 'legpress-1', type: 'legpress', x: -13.5, z: 4.5, rotY: 0 },
  { id: 'shoulder-1', type: 'shoulderpress', x: -9.5, z: 4.2, rotY: 0 },
  { id: 'latpull-1', type: 'latpulldown', x: 13.6, z: -1, rotY: -Math.PI / 2 },
  { id: 'latpull-2', type: 'latpulldown', x: 13.6, z: 2.4, rotY: -Math.PI / 2 },
];

const FACTORIES = {
  benchpress: createBenchPress,
  dumbbell: createDumbbellRack,
  treadmill: createTreadmill,
  legpress: createLegPress,
  shoulderpress: createShoulderPress,
  latpulldown: createLatPulldown,
};

export class Gym {
  constructor(scene, { shadows = true } = {}) {
    this.scene = scene;
    this.root = new THREE.Group();
    this.root.name = 'Gym';
    scene.add(this.root);

    const W = GYM_SIZE.width / 2;
    const D = GYM_SIZE.depth / 2;
    this.collision = new CollisionWorld({ minX: -W, maxX: W, minZ: -D, maxZ: D });
    /** @type {Array<{id:string,type:string,label:string,x:number,z:number,rotY:number,object:THREE.Object3D,parts:object}>} */
    this.interactables = [];

    this._buildLights(shadows);
    this._buildRoom();
    this._buildMirror();
    this._buildEquipment();
    this._buildProps();
  }

  setShadows(enabled) {
    this.sun.castShadow = enabled;
  }

  /** 플레이어 위치에서 가장 가까운 상호작용 가능한 기구 */
  findNearestInteractable(x, z, range) {
    let best = null;
    let bestD = range * range;
    for (const it of this.interactables) {
      const dx = it.x - x;
      const dz = it.z - z;
      const d2 = dx * dx + dz * dz;
      if (d2 < bestD) { bestD = d2; best = it; }
    }
    return best;
  }

  // ── 내부 ───────────────────────────────────────────────
  _place(obj, x, z, rotY = 0, colliderTag = '') {
    obj.group.position.set(x, 0, z);
    obj.group.rotation.y = rotY;
    this.root.add(obj.group);
    if (obj.collider) this.collision.addLocalBox(obj.collider, x, z, rotY, colliderTag);
    return obj;
  }

  _buildLights(shadows) {
    const hemi = new THREE.HemisphereLight('#ffffff', '#c9b8a0', 1.7);
    this.scene.add(hemi);

    const sun = new THREE.DirectionalLight('#fff4e0', 2.0);
    sun.position.set(9, 18, 7);
    sun.target.position.set(0, 0, 0);
    sun.castShadow = shadows;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = -19; sc.right = 19; sc.top = 15; sc.bottom = -15; sc.near = 1; sc.far = 50;
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.02;
    this.scene.add(sun);
    this.scene.add(sun.target);
    this.sun = sun;

    const fill = new THREE.DirectionalLight('#dfe9ff', 0.6);
    fill.position.set(-10, 8, -6);
    this.scene.add(fill);
  }

  _buildRoom() {
    const { width, depth, height } = GYM_SIZE;
    const W = width / 2;
    const D = depth / 2;

    // 바닥
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), m('#d7d2ca'));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.root.add(floor);

    // 구역별 고무 매트 (바닥 위 살짝)
    const mat = (x, z, w, d, color) => {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(w, d), m(color));
      p.rotation.x = -Math.PI / 2;
      p.position.set(x, 0.005, z);
      p.receiveShadow = true;
      this.root.add(p);
    };
    mat(-10.75, -7, 6.5, 4, '#4a4f5c'); // 벤치 구역
    mat(0, -10, 7.4, 3.6, '#5a6070'); // 덤벨 구역
    mat(10.5, -9, 9, 3.8, '#3f4a5a'); // 유산소 구역
    mat(-11.5, 4.5, 7, 4.2, '#4a4f5c'); // 머신 구역
    mat(13.3, 0.7, 4.6, 7.4, '#5a6070'); // 랫풀다운 구역
    mat(12, 9.6, 8, 4.8, '#c8a77e'); // 휴식 구역 (나무 느낌)
    mat(0, 10.8, 4, 2.4, '#e8505b'); // 입구 매트

    // 벽 (안쪽 면이 경계선에 오도록 바깥으로 두께를 둠)
    const T = 0.4;
    const wallMat = m('#f3eee6');
    const stripeMat = m('#3d7dd8');
    const wall = (w, d, x, z) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, height, d), wallMat);
      mesh.position.set(x, height / 2, z);
      mesh.receiveShadow = true;
      this.root.add(mesh);
      // 하단 포인트 띠
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(w + 0.01, 0.9, d + 0.01), stripeMat);
      stripe.position.set(x, 0.45, z);
      this.root.add(stripe);
    };
    wall(width + T * 2, T, 0, -D - T / 2);
    wall(width + T * 2, T, 0, D + T / 2);
    wall(T, depth, -W - T / 2, 0);
    wall(T, depth, W + T / 2, 0);

    // 천장 + 조명 패널
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), m('#fbfaf7'));
    ceil.rotation.x = Math.PI / 2;
    ceil.position.y = height;
    this.root.add(ceil);
    const panelMat = new THREE.MeshBasicMaterial({ color: '#fffbea' });
    const panelGeo = new THREE.PlaneGeometry(3, 0.6);
    for (let x = -12; x <= 12; x += 6) {
      for (let z = -8; z <= 8; z += 5.3) {
        const p = new THREE.Mesh(panelGeo, panelMat);
        p.rotation.x = Math.PI / 2;
        p.position.set(x, height - 0.01, z);
        this.root.add(p);
      }
    }

    // 창문 (동쪽/서쪽 벽)
    const winMat = new THREE.MeshBasicMaterial({ color: '#bfe6ff' });
    const frameMat = m('#ffffff');
    for (const z of [-6, 0, 6]) {
      for (const side of [-1, 1]) {
        if (side === 1 && z !== -6) continue; // 동쪽은 랫풀다운 뒤라 하나만
        const wf = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.6, 3.0), frameMat);
        wf.position.set(side * (W - 0.02), 2.9, z);
        this.root.add(wf);
        const win = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 1.4), winMat);
        win.position.set(side * (W - 0.06), 2.9, z);
        win.rotation.y = side === 1 ? -Math.PI / 2 : Math.PI / 2;
        this.root.add(win);
      }
    }

    // 입구 문 (남쪽 벽)
    const door = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.6, 0.08), m('#8fb8d8'));
    door.position.set(0, 1.3, D - 0.03);
    this.root.add(door);
    const doorFrame = new THREE.Mesh(new THREE.BoxGeometry(2.7, 2.8, 0.06), m('#2b2d33'));
    doorFrame.position.set(0, 1.4, D - 0.01);
    this.root.add(doorFrame);

    // 벽 로고
    this._wallText('ONLINE GYM', 0, 4.25, -D + 0.02, 0, 7, 0.9, '#2b2d33', '#f6d55c');
    this._wallText('CARDIO', 10.5, 3.6, -D + 0.02, 0, 3.2, 0.6, '#3caea3', '#ffffff');
    this._wallText('FREE WEIGHT', -W + 0.02, 3.6, -7, Math.PI / 2, 4, 0.6, '#e8505b', '#ffffff');
    this._wallText('MACHINE', -W + 0.02, 3.6, 4.5, Math.PI / 2, 3.2, 0.6, '#8e6bd8', '#ffffff');
    this._wallText('REST AREA', W - 0.02, 3.6, 9.5, -Math.PI / 2, 3.6, 0.6, '#f9a03f', '#ffffff');
  }

  _wallText(text, x, y, z, rotY, w, h, bg, fg) {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = Math.round(512 * (h / w));
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = fg;
    ctx.font = `bold ${Math.floor(canvas.height * 0.62)}px "Arial Black", "Apple SD Gothic Neo", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 2, canvas.width * 0.92);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex }));
    mesh.position.set(x, y, z);
    mesh.rotation.y = rotY;
    this.root.add(mesh);
  }

  _buildMirror() {
    const D = GYM_SIZE.depth / 2;
    const w = 8;
    const h = 2.4;
    const frame = new THREE.Mesh(new THREE.BoxGeometry(w + 0.2, h + 0.2, 0.06), m('#c9ced6'));
    frame.position.set(0, 0.95 + h / 2, -D + 0.03);
    this.root.add(frame);
    try {
      const mirror = new Reflector(new THREE.PlaneGeometry(w, h), {
        clipBias: 0.003,
        textureWidth: 1024,
        textureHeight: 320,
        color: '#c8ccd2',
      });
      mirror.position.set(0, 0.95 + h / 2, -D + 0.07);
      this.root.add(mirror);
      this.mirror = mirror;
    } catch (err) {
      // Reflector 를 사용할 수 없는 환경이면 반짝이는 판으로 대체
      console.warn('[Gym] Reflector 생성 실패, 일반 재질로 대체:', err);
      const plate = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m('#cfd8e3', { metalness: 0.6, roughness: 0.15 }));
      plate.position.set(0, 0.95 + h / 2, -D + 0.07);
      this.root.add(plate);
    }
  }

  _buildEquipment() {
    for (const item of EQUIPMENT_LAYOUT) {
      const info = EQUIPMENT_TYPES[item.type];
      const obj = this._place(FACTORIES[item.type](), item.x, item.z, item.rotY, item.id);
      obj.group.name = item.id;
      // 상호작용 지점을 월드 좌표로 변환
      const c = Math.cos(item.rotY);
      const s = Math.sin(item.rotY);
      const ip = obj.interactPoint;
      this.interactables.push({
        id: item.id,
        type: item.type,
        label: info.label,
        x: item.x + ip.x * c + ip.z * s,
        z: item.z - ip.x * s + ip.z * c,
        rotY: item.rotY,
        object: obj.group,
        parts: obj.movable || {},
      });
    }
  }

  _buildProps() {
    const W = GYM_SIZE.width / 2;
    const D = GYM_SIZE.depth / 2;
    // 휴식 공간
    this._place(createRestBench(2.2), 10.2, 10.9, 0, 'rest-bench-1');
    this._place(createRestBench(2.2), 9.2, 8.3, Math.PI / 2, 'rest-bench-2');
    this._place(createWaterCooler(), W - 0.45, D - 0.5, 0, 'cooler');
    this._place(createVendingMachine(), W - 0.55, 7.2, -Math.PI / 2, 'vending');
    // 화분
    this._place(createPlant(), 8.0, D - 0.5, 0, 'plant');
    this._place(createPlant(), -W + 0.5, D - 0.5, 0, 'plant');
    this._place(createPlant(), -W + 0.5, -D + 0.5, 0, 'plant');
    this._place(createPlant(), W - 0.5, -D + 0.5, 0, 'plant');
    this._place(createPlant(), -4.9, -D + 0.5, 0, 'plant');
    this._place(createPlant(), 4.9, -D + 0.5, 0, 'plant');
    // 안내판 (입구 옆, 입구 쪽을 바라봄)
    this._place(createSignboard('ONLINE GYM 안내', [
      '이동: W A S D  (Shift 달리기)',
      '카메라: 마우스 드래그 / 휠 줌',
      '운동기구: 가까이 가서 E',
      '메뉴: ESC',
      '운동 미니게임은 Phase 4에서 추가',
    ]), -3.6, 9.6, 0, 'sign');
    // 빈 휴식 벤치 하나 더 (머신 구역 옆)
    this._place(createRestBench(1.6), -5.5, 9.5, 0, 'rest-bench-3');
  }
}
