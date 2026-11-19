// 헬스장 3D 공간 구성: 바닥/벽/조명/거울/운동기구/소품 배치 + 충돌 영역 등록
import * as THREE from 'three';
import { CollisionWorld } from './CollisionWorld.js';
import { batchStatic } from './StaticBatcher.js';
import {
  createBenchPress, createDumbbellRack, createTreadmill, createLegPress, createShoulderPress,
  createLatPulldown, createRestBench, createWaterCooler, createPlant, createVendingMachine,
  createSignboard, m,
} from './equipment.js';
import { EQUIPMENT_TYPES } from '../shared/equipmentTypes.js';
import {
  createReceptionDesk, createPlateTree, createKettlebellRow, createStretchZone, createPunchingBag, createLockers,
  createTowelShelf, createWallClock, createSpeaker, createFloorTrack, createPoster,
} from './decor.js';

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
  constructor(scene) {
    this.scene = scene;
    this.root = new THREE.Group();
    this.root.name = 'Gym';
    scene.add(this.root);

    const W = GYM_SIZE.width / 2;
    const D = GYM_SIZE.depth / 2;
    this.collision = new CollisionWorld({ minX: -W, maxX: W, minZ: -D, maxZ: D });
    /** @type {Array<{id:string,type:string,label:string,x:number,z:number,rotY:number,object:THREE.Object3D,parts:object}>} */
    this.interactables = [];

    this._buildLights();
    this._buildRoom();
    this._buildMirror();
    this._buildEquipment();
    this._buildProps();

    // 움직이지 않는 메시를 몇 개로 병합 (성능 핵심)
    this.root.updateMatrixWorld(true);
    this.batchStats = batchStatic(this.root);
    console.info(`[Gym] 정적 메시 병합: ${this.batchStats.before}개 → ${this.batchStats.after}개`);
  }

  /**
   * 그래픽 품질 적용
   * @param {{shadows:boolean, mirror:boolean}} q
   */
  async setQuality({ shadows, mirror }) {
    this.sun.castShadow = shadows;
    if (mirror && !this.reflector) {
      try {
        // 실시간 거울은 "높음" 품질에서만 필요할 때 불러옴 (장면을 한 번 더 그리므로 무거움)
        const { Reflector } = await import('three/addons/objects/Reflector.js');
        const r = new Reflector(new THREE.PlaneGeometry(this.mirrorSize.w, this.mirrorSize.h), {
          clipBias: 0.003, textureWidth: 512, textureHeight: 160, color: '#c8ccd2',
        });
        r.position.copy(this.fakeMirror.position);
        r.position.z += 0.005;
        this.root.add(r);
        this.reflector = r;
      } catch (err) {
        console.warn('[Gym] 실시간 거울 생성 실패 — 기본 거울 사용', err);
      }
    }
    if (this.reflector) this.reflector.visible = mirror;
    this.fakeMirror.visible = !(mirror && this.reflector);
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
    for (const c of obj.colliders || []) this.collision.addLocalBox(c, x, z, rotY, colliderTag);
    return obj;
  }

  _buildLights() {
    // 조명 2개만 사용 (반구광 + 태양광). 그림자는 "높음" 품질에서만 켭니다.
    const hemi = new THREE.HemisphereLight('#ffffff', '#c9b8a0', 1.9);
    this.scene.add(hemi);

    const sun = new THREE.DirectionalLight('#fff4e0', 1.7);
    sun.position.set(9, 18, 7);
    sun.target.position.set(0, 0, 0);
    sun.castShadow = false;
    sun.shadow.mapSize.set(1024, 1024);
    const sc = sun.shadow.camera;
    sc.left = -19; sc.right = 19; sc.top = 15; sc.bottom = -15; sc.near = 1; sc.far = 50;
    sun.shadow.bias = -0.0008;
    sun.shadow.normalBias = 0.03;
    this.scene.add(sun);
    this.scene.add(sun.target);
    this.sun = sun;
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
    this.mirrorSize = { w, h };
    const frame = new THREE.Mesh(new THREE.BoxGeometry(w + 0.2, h + 0.2, 0.06), m('#c9ced6'));
    frame.position.set(0, 0.95 + h / 2, -D + 0.03);
    this.root.add(frame);

    // 기본 거울: 반사 대신 은은한 그라데이션 텍스처 (렌더링 비용 거의 없음)
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 64;
    const ctx = c.getContext('2d');
    const grad = ctx.createLinearGradient(0, 0, 256, 64);
    grad.addColorStop(0, '#dfe9f3');
    grad.addColorStop(0.45, '#f7fbff');
    grad.addColorStop(0.55, '#e6eef7');
    grad.addColorStop(1, '#cfdbe8');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 64);
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = 6;
    for (const x of [60, 80, 170, 186]) { ctx.beginPath(); ctx.moveTo(x, 64); ctx.lineTo(x + 30, 0); ctx.stroke(); }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const fake = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex }));
    fake.position.set(0, 0.95 + h / 2, -D + 0.065);
    fake.userData.noBatch = true;
    this.root.add(fake);
    this.fakeMirror = fake;
    this.reflector = null;
  }

  /** 기구/벤치 하나를 상호작용 목록에 등록 (상호작용 지점·운동 자세 위치를 월드 좌표로 변환) */
  _addInteractable({ id, type, x, z, rotY, interactPoint, spot, object = null, parts = {} }) {
    const info = EQUIPMENT_TYPES[type];
    const c = Math.cos(rotY);
    const s = Math.sin(rotY);
    const toWorld = (lx, lz) => ({ x: x + lx * c + lz * s, z: z - lx * s + lz * c });
    const ip = toWorld(interactPoint.x, interactPoint.z);
    const sp = spot || info.spot;
    const spw = toWorld(sp.x, sp.z);
    this.interactables.push({
      id,
      type,
      label: info.label,
      exercise: info.exercise,
      x: ip.x,
      z: ip.z,
      rotY,
      spot: { x: spw.x, z: spw.z, y: sp.y, r: rotY + sp.r },
      object,
      parts,
    });
  }

  _buildEquipment() {
    for (const item of EQUIPMENT_LAYOUT) {
      const obj = this._place(FACTORIES[item.type](), item.x, item.z, item.rotY, item.id);
      obj.group.name = item.id;
      // 움직이는 부품의 기본 위치 기억 (운동 동작 때 움직임)
      for (const part of Object.values(obj.movable || {})) part.userData.baseY = part.position.y;
      this._addInteractable({
        id: item.id, type: item.type, x: item.x, z: item.z, rotY: item.rotY, interactPoint: obj.interactPoint, object: obj.group, parts: obj.movable || {},
      });
    }
  }

  /** 휴식 벤치 + 앉을 자리 등록 */
  _placeBench(length, x, z, rotY, id) {
    this._place(createRestBench(length), x, z, rotY, id);
    const n = length >= 2 ? 3 : 2;
    for (let i = 0; i < n; i++) {
      const lx = (i - (n - 1) / 2) * (length / n);
      this._addInteractable({
        id: `${id}-seat${i}`, type: 'seat', x, z, rotY, interactPoint: { x: lx, z: 0.62 }, spot: { x: lx, z: 0.02, y: 0.48, r: 0 },
      });
    }
  }

  /** 운동 중인 사람에 맞춰 기구 부품 움직이기 (바벨·랫풀다운 바) */
  animateEquipment(it, k) {
    const bar = it.parts.barbell;
    if (bar) bar.position.y = bar.userData.baseY - 0.17 * (1 - k);
    const pull = it.parts.pullBar;
    if (pull) pull.position.y = pull.userData.baseY - 0.45 * k;
  }

  resetEquipment(it) {
    for (const part of Object.values(it.parts)) if (part.userData.baseY !== undefined) part.position.y = part.userData.baseY;
  }

  /** 샌드백 흔들기 (근처에서 공격하면) */
  hitBag(x, z, fromX, fromZ) {
    const bag = this.punchingBag;
    if (!bag) return;
    const bx = bag.worldX;
    const bz = bag.worldZ;
    if (Math.hypot(x - bx, z - bz) > 1.6) return;
    const dx = bx - fromX;
    const dz = bz - fromZ;
    const d = Math.hypot(dx, dz) || 1;
    bag.vx += (dx / d) * 1.6;
    bag.vz += (dz / d) * 1.6;
  }

  update(dt) {
    const bag = this.punchingBag;
    if (!bag) return;
    // 진자 운동 (스프링 + 감쇠)
    bag.vx += (-bag.ax * 18 - bag.vx * 2.2) * dt;
    bag.vz += (-bag.az * 18 - bag.vz * 2.2) * dt;
    bag.ax += bag.vx * dt;
    bag.az += bag.vz * dt;
    bag.swing.rotation.z = -bag.ax * 0.35;
    bag.swing.rotation.x = bag.az * 0.35;
  }

  _buildProps() {
    const W = GYM_SIZE.width / 2;
    const D = GYM_SIZE.depth / 2;
    // 휴식 공간 (앉을 수 있는 벤치)
    this._placeBench(2.2, 10.2, 10.9, 0, 'rest-bench-1');
    this._placeBench(2.2, 9.2, 8.3, Math.PI / 2, 'rest-bench-2');
    this._placeBench(1.6, -5.5, 9.5, 0, 'rest-bench-3');
    this._placeBench(1.6, 3.5, 2.6, Math.PI, 'rest-bench-4');
    this._place(createWaterCooler(), W - 0.45, D - 0.5, 0, 'cooler');
    this._place(createVendingMachine(), W - 0.55, 7.2, -Math.PI / 2, 'vending');
    this._place(createTowelShelf(), 13.0, D - 0.35, Math.PI, 'towels');
    // 화분
    for (const [x, z] of [[8.0, D - 0.5], [-W + 0.5, D - 0.5], [-W + 0.5, -D + 0.5], [W - 0.5, -D + 0.5], [-4.9, -D + 0.5], [4.9, -D + 0.5], [2.2, D - 0.5], [-2.2, D - 0.5]]) {
      this._place(createPlant(), x, z, 0, 'plant');
    }
    // 안내판 (입구 옆, 입구 쪽을 바라봄)
    this._place(createSignboard('ONLINE GYM 안내', [
      '이동: W A S D  (Shift 달리기)',
      '점프: Space   채팅: Enter',
      '공격: J 주먹 · K 발차기',
      '기구·벤치: 가까이 가서 E',
      '귓속말: /w 닉네임 메시지',
      '메뉴: ESC   명령어: /help',
    ]), -3.6, 9.6, 0, 'sign');
    // 안내 데스크 (입구 오른쪽)
    this._place(createReceptionDesk(), 4.6, 9.9, Math.PI, 'reception');
    // 자유 웨이트 구역 소품
    this._place(createPlateTree(), -15.2, -9.6, 0, 'plates');
    this._place(createKettlebellRow(6), -15.4, -3.2, Math.PI / 2, 'kettlebells');
    // 스트레칭 구역 + 샌드백 (헬스장 가운데 오른쪽)
    this._place(createStretchZone(), 4.0, -3.4, 0, 'stretch');
    const bag = this._place(createPunchingBag(), -3.2, 2.2, 0, 'bag');
    this.punchingBag = { swing: bag.swing, worldX: -3.2, worldZ: 2.2, ax: 0, az: 0, vx: 0, vz: 0 };
    // 사물함 (남쪽 벽 왼편)
    this._place(createLockers(5), -11.5, D - 0.3, Math.PI, 'lockers');
    // 바닥 트랙
    this._place(createFloorTrack(11, 7), 0, -0.5, 0, 'track');
    // 벽 장식 (충돌 없음)
    const clock = createWallClock();
    clock.group.position.set(W - 0.06, 3.3, 3.5);
    clock.group.rotation.y = -Math.PI / 2;
    this.root.add(clock.group);
    for (const [x, z, ry] of [[-W + 0.3, -D + 0.3, Math.PI / 4], [W - 0.3, -D + 0.3, -Math.PI / 4], [-W + 0.3, D - 0.3, (3 * Math.PI) / 4], [W - 0.3, D - 0.3, -(3 * Math.PI) / 4]]) {
      const sp = createSpeaker();
      sp.group.position.set(x, 4.2, z);
      sp.group.rotation.y = ry;
      this.root.add(sp.group);
    }
    const posters = [
      ['NO PAIN\nNO GAIN', '오늘도 득근!', '#2b2d33', '#f6d55c', -W + 0.03, 2.3, -1.2, Math.PI / 2],
      ['STAY\nHYDRATED', '물 자주 마시기', '#3d7dd8', '#ffffff', W - 0.03, 2.3, 9.2, -Math.PI / 2],
      ['LEG\nDAY', '하체는 배신하지 않는다', '#e8505b', '#ffffff', -W + 0.03, 2.3, 1.2, Math.PI / 2],
    ];
    for (const [t, sub, bg, fg, x, y, z, ry] of posters) {
      const pst = createPoster(t.replace('\\n', '\n'), sub, bg, fg);
      pst.group.position.set(x, y, z);
      pst.group.rotation.y = ry;
      this.root.add(pst.group);
    }
  }
}
