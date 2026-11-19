// 헬스장 3D 공간 구성: 바닥/벽/조명/거울/운동기구/소품 배치 + 충돌 영역 등록
import * as THREE from 'three';
import { CollisionWorld } from './CollisionWorld.js';
import { findPunchingBagTarget } from './bagCollision.js';
import { batchStatic } from './StaticBatcher.js';
import {
  EQUIPMENT_LAYOUT, PUNCHING_BAGS, SHOP, RANK_BOARD,
} from '../shared/gymLayout.js';
import { bagAngle, bagInZone } from '../shared/bagMotion.js';
import {
  createBenchPress, createDumbbellRack, createTreadmill, createLegPress, createShoulderPress,
  createLatPulldown, createRestBench, createWaterCooler, createPlant, createVendingMachine,
  createSignboard, m,
} from './equipment.js';
import { EQUIPMENT_TYPES } from '../shared/equipmentTypes.js';
import {
  createReceptionDesk, createPlateTree, createKettlebellRow, createStretchZone, createPunchingBag, createLockers,
  createTowelShelf, createWallClock, createSpeaker, createFloorTrack, createPoster,
  createSofa, createArmchair, createCoffeeTable, createRug, createFloorLamp, createShopStall, createHangingBoard,
} from './decor.js';

export const GYM_SIZE = { width: 40, depth: 30, height: 5 };
export const SPAWN_POINT = { x: 0, z: 12, rotY: Math.PI }; // 입구 안쪽에서 헬스장 중앙을 바라봄

// 운동기구 배치표 — 기구를 추가/이동할 때는 이 표만 수정하면 됩니다.
// id 는 Phase 2 이후 서버와 "누가 어떤 기구를 사용 중인지" 동기화할 때 사용합니다.

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
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), m('#cfd7dd'));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.root.add(floor);

    // 구역별 고무 매트 (바닥 위 살짝)
    // 매트끼리 겹치는 곳이 깜빡이지 않도록(z-fighting) 매트마다 높이를 2mm 씩 다르게
    let matLayer = 0;
    const mat = (x, z, w, d, color) => {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(w, d), m(color));
      p.rotation.x = -Math.PI / 2;
      p.position.set(x, 0.003 + (matLayer++) * 0.002, z);
      p.receiveShadow = true;
      this.root.add(p);
    };
    mat(-12, -10, 16, 4.8, '#3d4654'); // 벤치프레스 존
    mat(-11, -3, 16, 5.2, '#505b69'); // 덤벨 / 프리웨이트 존
    mat(13, -10.5, 13, 5.4, '#455363'); // 유산소 존
    mat(-11, 6, 17, 7.2, '#485564'); // 머신 존
    mat(17.1, 1, 4.8, 13.5, '#505b69'); // 랫풀다운 존
    mat(13.2, 9, 12, 10, '#d7c4a8'); // 휴식 / 대기 존
    mat(0, 13.1, 8, 3.2, '#d5ad6d'); // 입구 매트
    mat(0, 1.4, 10, 8.8, '#52636d'); // 스트레칭 / 샌드백 존

    // 벽 (안쪽 면이 경계선에 오도록 바깥으로 두께를 둠)
    const T = 0.4;
    const wallMat = m('#e9eef2');
    const stripeMat = m('#354151');
    const trimMat = m('#d7ad68');
    const wall = (w, d, x, z) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, height, d), wallMat);
      mesh.position.set(x, height / 2, z);
      mesh.receiveShadow = true;
      this.root.add(mesh);
      // 하단 포인트 띠
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(w + 0.01, 0.22, d + 0.01), stripeMat);
      stripe.position.set(x, 0.11, z);
      this.root.add(stripe);
      const trim = new THREE.Mesh(new THREE.BoxGeometry(w + 0.015, 0.035, d + 0.015), trimMat);
      trim.position.set(x, 0.245, z);
      this.root.add(trim);
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
    // 40×30 m 방 전체에 고르게 (예전 32×24 기준 배치가 남아 있던 부분)
    for (let x = -15; x <= 15; x += 6) {
      for (let z = -10.5; z <= 10.5; z += 5.25) {
        const p = new THREE.Mesh(panelGeo, panelMat);
        p.rotation.x = Math.PI / 2;
        p.position.set(x, height - 0.01, z);
        this.root.add(p);
      }
    }

    // 창문 (동쪽/서쪽 벽)
    const winMat = new THREE.MeshBasicMaterial({ color: '#add8ec' });
    const frameMat = m('#f8fafc');
    // 서쪽 벽 글씨(FREE WEIGHT z=-6~-2, MACHINE z=5.4~8.6)와 겹치지 않는 위치
    for (const z of [-10, 1.5]) {
      for (const side of [-1, 1]) {
        if (side === 1 && z !== -10) continue; // 동쪽은 랫풀다운·자판기 뒤라 하나만
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
    this._wallText('CARDIO', 13, 3.6, -D + 0.02, 0, 3.2, 0.6, '#3caea3', '#ffffff');
    this._wallText('FREE WEIGHT', -W + 0.02, 3.6, -4, Math.PI / 2, 4, 0.6, '#e8505b', '#ffffff');
    this._wallText('MACHINE', -W + 0.02, 3.6, 7, Math.PI / 2, 3.2, 0.6, '#8e6bd8', '#ffffff');
    this._wallText('LOUNGE', W - 0.02, 3.6, 9.5, -Math.PI / 2, 3.2, 0.6, '#b98e5b', '#ffffff');

    // 구역 구분은 바닥 라벨로도 표시해 처음 접속한 사람도 공간을 쉽게 파악하도록 합니다.
    this._floorText('BENCH PRESS', -12, -12.05, 3.5);
    this._floorText('FREE WEIGHTS', -11, -5.25, 3.5);
    this._floorText('CARDIO', 13, -12.75, 2.8);
    this._floorText('MACHINE ZONE', -11, 9.05, 3.7);
    this._floorText('BAG TRAINING', 0, 5.35, 3.3);
    this._floorText('LOUNGE', 12.8, 5.1, 2.6);
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

  /** 천장에 매달린 양면 랭킹 전광판 (캔버스에 그려서 갱신될 때만 다시 그림 → 비용 거의 없음) */
  _buildRankingBoard() {
    const B = RANK_BOARD;
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 472;
    this.rankCanvas = canvas;
    this.rankTex = new THREE.CanvasTexture(canvas);
    this.rankTex.colorSpace = THREE.SRGBColorSpace;
    this._place(createHangingBoard(B.w, B.h, B.y, GYM_SIZE.height), B.x, B.z, 0, '');
    const mat = new THREE.MeshBasicMaterial({ map: this.rankTex });
    for (const side of [1, -1]) {
      const board = new THREE.Mesh(new THREE.PlaneGeometry(B.w, B.h), mat);
      board.position.set(B.x, B.y, B.z + side * 0.085);
      board.rotation.y = side > 0 ? 0 : Math.PI;
      board.userData.noBatch = true;
      this.root.add(board);
    }
    this.setRankingBoard(null);
  }

  /** @param {{day:string, exercise:object[], bag:object[]}|null} data */
  setRankingBoard(data) {
    const c = this.rankCanvas;
    if (!c) return;
    const g = c.getContext('2d');
    g.fillStyle = '#16202c';
    g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = '#ffd84a';
    g.font = 'bold 50px "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('🏆 오늘의 랭킹 (실시간)', c.width / 2, 44);
    const col = (title, rows, fmt, cx) => {
      g.fillStyle = '#7fe3d4';
      g.font = 'bold 36px "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
      g.textAlign = 'center';
      g.fillText(title, cx, 112);
      g.font = 'bold 34px "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
      if (!rows || !rows.length) {
        g.fillStyle = '#8a96a3';
        g.fillText(data ? '아직 기록 없음' : '서버 연결 시 표시', cx, 200);
        return;
      }
      rows.slice(0, 5).forEach((r, i) => {
        const yy = 172 + i * 60;
        g.fillStyle = i === 0 ? '#ffd84a' : i === 1 ? '#d9dee5' : i === 2 ? '#e3a36b' : '#ffffff';
        g.textAlign = 'left';
        g.fillText(`${i + 1}. ${String(r.nickname).slice(0, 8)}`, cx - 215, yy);
        g.textAlign = 'right';
        g.fillText(fmt(r.value), cx + 215, yy);
      });
    };
    const fmtS = (s) => (s >= 3600 ? `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m` : `${Math.floor(s / 60)}m ${s % 60}s`);
    col('💪 운동 시간', data?.exercise, fmtS, c.width * 0.27);
    col('🥊 샌드백 PERFECT', data?.bag, (v) => `${v}회`, c.width * 0.73);
    g.strokeStyle = '#2f3d4d';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(c.width / 2, 90);
    g.lineTo(c.width / 2, c.height - 20);
    g.stroke();
    this.rankTex.needsUpdate = true;
  }

  _floorText(text, x, z, width) {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 96;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'rgba(24, 34, 46, 0.78)';
    ctx.beginPath();
    ctx.roundRect(5, 5, 502, 86, 22);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.42)';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = '#f7fafc';
    ctx.font = 'bold 42px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 256, 49, 470);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(width, 0.62),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, 0.035, z); // 매트보다 위
    mesh.renderOrder = 2;
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
  _addInteractable({ id, type, x, z, rotY, interactPoint, spot, object = null, anims = [], twoSided = false }) {
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
      // 등받이 없는 벤치: 앞/뒤 어느 쪽에서든 앉을 수 있음 (다가온 쪽을 바라보고 앉음)
      twoSided,
      object,
      anims,
    });
  }

  _buildEquipment() {
    for (const item of EQUIPMENT_LAYOUT) {
      const obj = this._place(FACTORIES[item.type](), item.x, item.z, item.rotY, item.id);
      obj.group.name = item.id;
      // 움직이는 부품의 기본 위치 기억 (운동 중일 때만 움직임)
      const anims = obj.anims || [];
      for (const a of anims) a.base = a.obj.position.clone();
      this._addInteractable({
        id: item.id, type: item.type, x: item.x, z: item.z, rotY: item.rotY, interactPoint: obj.interactPoint, object: obj.group, anims,
      });
      this.resetEquipment({ anims });
    }
  }

  /** 소파/1인 소파: 등받이가 있어 앞(+z)을 보고 앉고, 일어나면 앞쪽으로 */
  _placeSofa(obj, x, z, rotY, id) {
    this._place(obj, x, z, rotY, id);
    obj.seatXs.forEach((lx, i) => {
      this._addInteractable({
        id: `${id}-seat${i}`, type: 'seat', x, z, rotY, interactPoint: { x: lx, z: 0.78 }, spot: { x: lx, z: 0.08, y: 0.46, r: 0 },
      });
    });
  }

  /** 휴식 벤치 + 앉을 자리 등록 */
  _placeBench(length, x, z, rotY, id) {
    this._place(createRestBench(length), x, z, rotY, id);
    const n = length >= 2 ? 3 : 2;
    for (let i = 0; i < n; i++) {
      const lx = (i - (n - 1) / 2) * (length / n);
      this._addInteractable({
        // 상호작용 지점 = 좌석 중앙 → 벤치 앞·뒤 양쪽에서 같은 거리로 잡힙니다.
        id: `${id}-seat${i}`, type: 'seat', x, z, rotY, interactPoint: { x: lx, z: 0 }, spot: { x: lx, z: 0, y: 0.48, r: 0 }, twoSided: true,
      });
    }
  }

  /**
   * 운동 중인 사람에 맞춰 기구 부품 움직이기 (사용 중인 기구만 호출됨 → 평소엔 비용 0)
   * @param {number} k 운동 진행도 0~1 (캐릭터 애니메이션과 같은 값)
   * @param {number} t 시간(초) — 러닝머신 벨트처럼 계속 흐르는 부품용
   */
  animateEquipment(it, k, t = performance.now() / 1000) {
    for (const a of it.anims) {
      const o = a.obj;
      switch (a.kind) {
        case 'k': {
          const kk = a.invert ? 1 - k : k;
          o.position.set(a.base.x + a.dir[0] * a.amp * kk, a.base.y + a.dir[1] * a.amp * kk, a.base.z + a.dir[2] * a.amp * kk);
          break;
        }
        case 'hide':
          o.visible = false;
          break;
        case 'belt':
          o.position.setComponent(a.axis, a.base.getComponent(a.axis) + ((t * a.speed) % a.gap));
          break;
        default:
          break;
      }
    }
    for (const a of it.anims) if (a.kind === 'cable') this._fitCable(a);
  }

  resetEquipment(it) {
    for (const a of it.anims) {
      a.obj.position.copy(a.base);
      a.obj.visible = true;
    }
    for (const a of it.anims) if (a.kind === 'cable') this._fitCable(a);
  }

  /** 케이블: 도르래(top) 부터 따라가는 부품의 위치까지 늘였다 줄였다 */
  _fitCable(a) {
    const bottom = a.follow.position.y + a.bottomOffset;
    const len = Math.max(0.05, a.top - bottom);
    a.obj.position.y = bottom + len / 2;
    a.obj.scale.y = len;
  }

  /** 플레이어가 바라보는 방향·사정거리·타격 위치가 모두 맞을 때만 샌드백을 타격합니다. */
  hitBag(hitX, hitZ, fromX, fromZ, rotY = 0, strength = 1, serverMs = performance.now()) {
    const target = findPunchingBagTarget(this.punchingBags, {
      hitX, hitZ, fromX, fromZ, rotY,
    });
    if (!target) return null;
    // 샌드백이 가운데(초록 불)에 있을 때만 실제로 맞음. 옆으로 가 있으면 헛방
    const inZone = bagInZone(target.idx, serverMs);
    if (inZone) {
      const dx = target.worldX - fromX;
      const dz = target.worldZ - fromZ;
      const d = Math.hypot(dx, dz) || 1;
      const impulse = 2.2 * Math.max(0.65, Math.min(1.6, strength));
      target.vx += (dx / d) * impulse;
      target.vz += (dz / d) * impulse;
      target.lastHitAt = performance.now();
    }
    return {
      x: target.worldX + Math.sin(target.baseAngle || 0) * 1.62, y: 1.0, z: target.worldZ, strength, idx: target.idx, inZone,
    };
  }

  /**
   * @param {number} dt
   * @param {number} serverMs 서버 시각 (모든 화면에서 샌드백이 같은 위치에 있도록)
   */
  update(dt, serverMs = performance.now()) {
    for (const bag of this.punchingBags || []) {
      const inZone = bagInZone(bag.idx, serverMs);
      if (inZone !== bag.lit) {
        bag.lit = inZone;
        bag.light.material.color.set(inZone ? '#39f28c' : '#3a3f4b');
      }
      bag.baseAngle = bagAngle(bag.idx, serverMs);
      // 진자 운동 (스프링 + 감쇠)
      bag.vx += (-bag.ax * 18 - bag.vx * 2.2) * dt;
      bag.vz += (-bag.az * 18 - bag.vz * 2.2) * dt;
      bag.ax += bag.vx * dt;
      bag.az += bag.vz * dt;
      bag.swing.rotation.z = -bag.baseAngle - bag.ax * 0.35;
      bag.swing.rotation.x = bag.az * 0.35;
    }
  }

  _buildProps() {
    const W = GYM_SIZE.width / 2;
    const D = GYM_SIZE.depth / 2;

    // 10명 이상이 동시에 머물 수 있도록 휴식석을 한곳에 몰지 않고 2열로 분산합니다.
    // ── 라운지: 러그 위에 소파 2개 + 1인 소파 2개가 테이블을 둘러싸 서로 마주 보고 앉음 ──
    const LX = 12.8;
    const LZ = 9.3;
    this._place(createRug(2.9), LX, LZ, 0, 'rug');
    this._place(createCoffeeTable(), LX, LZ, 0, 'coffee-table');
    this._placeSofa(createSofa(3, '#3caea3'), LX, LZ + 1.75, Math.PI, 'lounge-sofa-1');
    this._placeSofa(createSofa(3, '#3caea3'), LX, LZ - 1.75, 0, 'lounge-sofa-2');
    this._placeSofa(createArmchair('#f9a03f'), LX - 2.0, LZ, Math.PI / 2, 'lounge-chair-1');
    this._placeSofa(createArmchair('#f9a03f'), LX + 2.0, LZ, -Math.PI / 2, 'lounge-chair-2');
    for (const [x, z] of [[LX - 2.1, LZ + 1.85], [LX + 2.1, LZ - 1.85]]) this._place(createFloorLamp(), x, z, 0, 'lamp');
    // 치장 상점 가판대 (서쪽 벽) — E 로 상점 열기
    this._place(createShopStall(), SHOP.x, SHOP.z, SHOP.rotY, 'shop');
    this._addInteractable({
      id: 'shop', type: 'shop', x: SHOP.x, z: SHOP.z, rotY: SHOP.rotY, interactPoint: SHOP.interactLocal,
    });
    this._wallText('🛍️ 치장 상점 SHOP', -GYM_SIZE.width / 2 + 0.03, 3.25, SHOP.z, Math.PI / 2, 3.0, 0.6, '#8e6bd8', '#ffffff');
    // 헬스장 한가운데 천장에 매달린 실시간 랭킹 전광판 (앞뒤 양면) — 아래에서 E 로 자세히 보기
    this._buildRankingBoard();
    this._addInteractable({
      id: 'rankboard', type: 'rankboard', x: RANK_BOARD.x, z: RANK_BOARD.z, rotY: 0, interactPoint: { x: 0, z: 0 },
    });
    // 입구 쪽 대기 벤치 (앞/뒤 양쪽으로 앉기)
    this._placeBench(2.6, -11, 13.2, 0, 'rest-bench-1');
    this._placeBench(2.6, -7.6, 13.2, 0, 'rest-bench-2');

    this._place(createWaterCooler(), W - 0.65, D - 1.1, 0, 'cooler');
    this._place(createVendingMachine(), W - 0.65, 8.1, -Math.PI / 2, 'vending');
    this._place(createTowelShelf(), 16.8, D - 0.65, Math.PI, 'towels');

    // 화분으로 벽면의 빈 공간을 정리하고, 출입구와 운동 동선은 비워 둡니다.
    for (const [x, z] of [
      [-W + 1.0, D - 1.0], [W - 1.0, -D + 1.0],
      [-5.5, -D + 1.0], [5.5, -D + 1.0], [-7.5, D - 1.0], [7.5, D - 1.0],
    ]) this._place(createPlant(), x, z, 0, 'plant');

    // 입구 안내판과 리셉션은 정중앙 동선을 막지 않도록 좌우로 분리합니다.
    this._place(createSignboard('ONLINE GYM 안내', [
      '이동: W A S D  (Shift 달리기)',
      '점프: Space   채팅: Enter',
      '공격: J 주먹 · K 발차기',
      '기구·벤치: 가까이 가서 E',
      '샌드백: 정면에서 J / K',
      '메뉴: ESC   명령어: /help',
    ]), -4.8, 12.4, 0, 'sign');
    this._place(createReceptionDesk(), 4.8, 12.2, Math.PI, 'reception');

    // 프리웨이트 부속 장비
    this._place(createPlateTree(), -18.2, -13.4, 0, 'plates');
    this._place(createKettlebellRow(8), -18.5, -3.5, Math.PI / 2, 'kettlebells');

    // 중앙에는 스트레칭 매트와 2개의 샌드백을 둬 대기 없이 교대로 연습할 수 있게 합니다.
    this._place(createStretchZone(), 3.6, -2.6, 0, 'stretch');
    this.punchingBags = [];
    PUNCHING_BAGS.forEach(({ id, x, z }, idx) => {
      const bag = this._place(createPunchingBag(), x, z, 0, id);
      // 바닥 신호등: 샌드백이 가운데(퍼펙트 구간)에 오면 초록색으로 켜짐
      const light = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.012, 24), new THREE.MeshBasicMaterial({ color: '#3a3f4b' }));
      light.position.set(x, 0.045, z);
      light.userData.noBatch = true;
      this.root.add(light);
      this.punchingBags.push({
        idx, swing: bag.swing, worldX: x, worldZ: z, light, lit: false,
        ax: 0, az: 0, vx: 0, vz: 0, lastHitAt: 0,
      });
    });

    // 사물함과 보급품은 벽 쪽으로 붙여 중앙 운동 동선에 간섭하지 않게 합니다.
    this._place(createLockers(6), -14.8, D - 0.55, Math.PI, 'lockers');
    const clock = createWallClock();
    clock.group.position.set(W - 0.06, 3.3, 2.5);
    clock.group.rotation.y = -Math.PI / 2;
    this.root.add(clock.group);

    for (const [x, z, ry] of [
      [-W + 0.3, -D + 0.3, Math.PI / 4], [W - 0.3, -D + 0.3, -Math.PI / 4],
      [-W + 0.3, D - 0.3, (3 * Math.PI) / 4], [W - 0.3, D - 0.3, -(3 * Math.PI) / 4],
    ]) {
      const sp = createSpeaker();
      sp.group.position.set(x, 4.2, z);
      sp.group.rotation.y = ry;
      this.root.add(sp.group);
    }

    const posters = [
      ['NO PAIN\nNO GAIN', '오늘도 득근!', '#2b2d33', '#f6d55c', -W + 0.03, 2.3, -2.0, Math.PI / 2],
      ['STAY\nHYDRATED', '물 자주 마시기', '#3d7dd8', '#ffffff', W - 0.03, 2.3, 9.2, -Math.PI / 2],
      ['LEG\nDAY', '하체는 배신하지 않는다', '#e8505b', '#ffffff', -W + 0.03, 2.3, 7.0, Math.PI / 2],
      ['KEEP\nMOVING', '꾸준함이 답이다', '#3caea3', '#ffffff', W - 0.03, 2.3, -6.0, -Math.PI / 2],
    ];
    for (const [t, sub, bg, fg, x, y, z, ry] of posters) {
      const pst = createPoster(t.replace('\\n', '\n'), sub, bg, fg);
      pst.group.position.set(x, y, z);
      pst.group.rotation.y = ry;
      this.root.add(pst.group);
    }
  }
}
