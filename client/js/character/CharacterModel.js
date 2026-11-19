// 동글동글 SD(2~3등신) 로우폴리 캐릭터
//
// [성능 설계]
//  - 몸을 6개 부위(몸통·머리·팔L·팔R·다리L·다리R)로 나누고, 각 부위의 도형들을
//    정점 색상(vertex color)으로 칠해 하나의 지오메트리로 병합 → 캐릭터 1명당 드로우콜 6번
//  - 모든 캐릭터가 머티리얼 1개를 공유 → 접속자가 늘어도 셰이더/머티리얼 전환 비용 없음
//  - 그림자는 기본적으로 바닥 원형 그림자(블롭) 사용 → 그림자 맵 렌더링 불필요
//  - 성장 수치(bodyStats)가 바뀔 때만 지오메트리를 다시 만듦 (드문 이벤트)
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { PartBuilder } from '../core/geometryUtils.js';
import {
  DEFAULT_APPEARANCE, DEFAULT_BODY_STATS, findBody, findOutfit, sanitizeAppearance, sanitizeBodyStats,
} from '../shared/appearance.js';

const TAU = Math.PI * 2;
const HIP_Y = 0.44; // 골반(다리 관절) 높이
const NECK_Y = 0.47; // 골반 기준 머리 관절 높이
const HEAD_R = 0.3; // 머리 반지름 (몸통보다 큼 → SD 비율)
const HEAD_C = 0.28; // 머리 관절 기준 머리 중심 높이

// ── 공유 리소스 (모든 캐릭터가 함께 사용) ─────────────────
let sharedMaterial = null;
let blobResources = null;

export function getCharacterMaterial() {
  if (!sharedMaterial) sharedMaterial = new THREE.MeshLambertMaterial({ vertexColors: true });
  return sharedMaterial;
}

function getBlobResources() {
  if (blobResources) return blobResources;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const grad = ctx.createRadialGradient(32, 32, 4, 32, 32, 32);
  grad.addColorStop(0, 'rgba(0,0,0,0.42)');
  grad.addColorStop(0.6, 'rgba(0,0,0,0.22)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  const geo = new THREE.PlaneGeometry(0.95, 0.95);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
  blobResources = { geo, mat };
  return blobResources;
}

// 얼굴형별 수치: 머리 지오메트리, 눈 위치(z), 헤어 스케일
const FACE = {
  round: { fz: 0.272, hair: [1, 1, 1] },
  oval: { fz: 0.262, hair: [0.93, 1.08, 0.96] },
  square: { fz: 0.252, hair: [1.08, 1.02, 1.06] },
  vline: { fz: 0.272, hair: [1, 1, 1] },
};

function makeHeadGeometry(face) {
  switch (face) {
    case 'square':
      return new RoundedBoxGeometry(0.54, 0.52, 0.5, 3, 0.15);
    case 'oval': {
      const g = new THREE.SphereGeometry(HEAD_R, 18, 14);
      g.scale(0.93, 1.08, 0.96);
      return g;
    }
    case 'vline': {
      // 아래쪽으로 갈수록 좁아지는 갸름한 얼굴
      const g = new THREE.SphereGeometry(HEAD_R, 18, 14);
      const pos = g.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const y = pos.getY(i);
        if (y < 0) {
          const k = 1 + (y / HEAD_R) * 0.3;
          pos.setX(i, pos.getX(i) * k);
          pos.setZ(i, pos.getZ(i) * (1 + (y / HEAD_R) * 0.12));
        }
      }
      g.computeVertexNormals();
      return g;
    }
    case 'round':
    default:
      return new THREE.SphereGeometry(HEAD_R, 18, 14);
  }
}

const UP = new THREE.Vector3(0, 1, 0);

export class CharacterModel {
  /**
   * @param {object} appearance
   * @param {{nickname?:string, blobShadow?:boolean}} opts
   */
  constructor(appearance = DEFAULT_APPEARANCE, opts = {}) {
    this.root = new THREE.Group();
    this.root.name = 'Character';
    this.appearance = sanitizeAppearance(appearance);
    this.bodyStats = { ...DEFAULT_BODY_STATS };
    this._castShadow = false;

    this.animPhase = 0;
    this.moveBlend = 0;
    this.runBlend = 0;
    this.airBlend = 0;
    this.landT = 0;
    this._wasAirborne = false;
    this.time = Math.random() * 10;
    this.action = 'idle'; // 네트워크 동기화용 (idle | walk | run | exercise:*)

    // 바닥 원형 그림자
    const blob = getBlobResources();
    this.blob = new THREE.Mesh(blob.geo, blob.mat);
    this.blob.position.y = 0.012;
    this.blob.renderOrder = 1;
    this.blob.visible = opts.blobShadow !== false;
    this.root.add(this.blob);

    this._geometries = [];
    this._build();

    this.nameTag = null;
    if (opts.nickname) this.setNickname(opts.nickname);
  }

  // ── 공개 API ───────────────────────────────────────────
  setAppearance(appearance) {
    this.appearance = sanitizeAppearance(appearance);
    this._build();
  }

  /** Phase 5: 성장 수치 반영 (0~1). 값이 바뀔 때만 호출하세요. */
  setBodyStats(stats) {
    this.bodyStats = sanitizeBodyStats(stats);
    this._build();
  }

  setBlobShadow(v) {
    this.blob.visible = v;
  }

  setCastShadow(v) {
    this._castShadow = v;
    if (this.meshes) for (const m of this.meshes) m.castShadow = v;
  }

  setNickname(name, color = '#ffffff') {
    if (this.nameTag) {
      this.root.remove(this.nameTag);
      this.nameTag.material.map.dispose();
      this.nameTag.material.dispose();
    }
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.font = 'bold 30px "Apple SD Gothic Neo","Malgun Gothic",sans-serif';
    const w = Math.min(248, ctx.measureText(name).width + 30);
    ctx.fillStyle = 'rgba(20,24,32,0.55)';
    roundRect(ctx, (256 - w) / 2, 10, w, 44, 22);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(name, 128, 33);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
    sprite.scale.set(1.4, 0.35, 1);
    sprite.renderOrder = 10;
    this.nameTag = sprite;
    this.root.add(sprite);
    this._placeNameTag();
  }

  /**
   * 매 프레임 호출 (회전값 몇 개만 바꾸므로 매우 가벼움)
   * @param {number} dt
   * @param {number} speed 수평 이동 속도 (m/s)
   * @param {boolean} airborne 공중에 떠 있는지 (점프)
   */
  update(dt, speed = 0, airborne = false) {
    const p = this.parts;
    if (!p) return;
    this.time += dt;

    const targetMove = airborne ? 0 : Math.min(1, speed / 2.2);
    const targetRun = Math.min(1, Math.max(0, (speed - 3.4) / 2.4));
    this.moveBlend += (targetMove - this.moveBlend) * Math.min(1, dt * 10);
    this.runBlend += (targetRun - this.runBlend) * Math.min(1, dt * 6);
    this.airBlend += ((airborne ? 1 : 0) - this.airBlend) * Math.min(1, dt * (airborne ? 18 : 12));
    // 착지 순간 살짝 찌그러지는 효과
    if (this._wasAirborne && !airborne) this.landT = 0.18;
    this._wasAirborne = airborne;
    this.landT = Math.max(0, this.landT - dt);

    if (airborne) this.action = 'jump';
    else this.action = this.moveBlend < 0.15 ? 'idle' : (this.runBlend > 0.5 ? 'run' : 'walk');

    this.animPhase = (this.animPhase + dt * (5 + speed * 1.9)) % TAU;
    const ph = this.animPhase;
    const m = this.moveBlend;
    const r = this.runBlend;
    const air = this.airBlend;
    const s = Math.sin(ph);
    const swing = (0.6 + 0.3 * r) * m;

    // 걷기 ↔ 점프 포즈 혼합 (점프: 만세 + 다리 앞뒤로)
    const mix = (walk, jump) => walk * (1 - air) + jump * air;
    p.legL.rotation.x = mix(-s * swing, -0.55);
    p.legR.rotation.x = mix(s * swing, 0.35);
    p.armL.rotation.x = mix(s * swing * 1.1, -0.25);
    p.armR.rotation.x = mix(-s * swing * 1.1, -0.25);
    const armOut = mix(0.32 - 0.12 * m + Math.sin(this.time * 1.8) * 0.03 * (1 - m), 2.3);
    p.armL.rotation.z = -armOut;
    p.armR.rotation.z = armOut;

    // 통통 튀는 걸음 + 뒤뚱뒤뚱
    p.hips.position.y = HIP_Y + Math.abs(Math.cos(ph)) * (0.045 + 0.04 * r) * m * (1 - air);
    p.torso.rotation.z = s * 0.07 * m * (1 - r * 0.5) * (1 - air);
    p.torso.rotation.x = 0.14 * r * m - 0.08 * air;
    // 숨쉬기 + 착지 찌그러짐 (몸통 메시만)
    const breathe = Math.sin(this.time * 2.4) * 0.02 * (1 - m) - (this.landT / 0.18) * 0.12;
    p.torsoMesh.scale.set(1 - breathe * 0.5, 1 + breathe, 1 - breathe * 0.5);
    p.head.rotation.z = Math.sin(this.time * 1.3) * 0.05 * (1 - m) - s * 0.04 * m;
    p.head.rotation.x = -0.08 * r * m - 0.12 * air;
  }

  dispose() {
    this._disposeGeometries();
    if (this.nameTag) {
      this.nameTag.material.map.dispose();
      this.nameTag.material.dispose();
    }
    this.root.removeFromParent();
  }

  // ── 조립 ───────────────────────────────────────────────
  _disposeGeometries() {
    if (this.body) this.root.remove(this.body);
    for (const g of this._geometries) g.dispose();
    this._geometries = [];
    this.parts = null;
    this.meshes = null;
  }

  _mesh(builder, parent) {
    const geo = builder.build();
    const mesh = new THREE.Mesh(geo, getCharacterMaterial());
    mesh.castShadow = this._castShadow;
    this._geometries.push(geo);
    this.meshes.push(mesh);
    parent.add(mesh);
    return mesh;
  }

  _build() {
    this._disposeGeometries();
    this.meshes = [];
    const a = this.appearance;
    const st = this.bodyStats;
    const P = findBody(a.body);
    const O = findOutfit(a.outfit);

    const C = {
      skin: a.skin,
      hair: a.hairColor,
      top: a.topColor,
      bottom: a.bottomColor,
      shoe: a.shoeColor,
      sole: '#4a4a52',
      eye: '#2b2420',
      white: '#ffffff',
      blush: '#ff9fae',
      mouth: '#8a3d36',
    };

    const sw = P.shoulder * (1 + st.shoulders * 0.12 + st.back * 0.1);
    const hw = P.hip;
    const limb = P.limb;
    const fat = st.bodyFat;

    const body = new THREE.Group();
    body.scale.setScalar(P.height);
    this.body = body;
    this.root.add(body);

    const hips = new THREE.Group();
    hips.position.y = HIP_Y;
    body.add(hips);

    // ── 다리 (관절 하나짜리 짧은 다리) ──
    const legR0 = 0.085 * limb * (1 + st.legs * 0.35);
    const makeLeg = (side) => {
      const pivot = new THREE.Group();
      pivot.position.x = side * 0.1 * hw;
      hips.add(pivot);
      const b = new PartBuilder();
      b.add(new THREE.CapsuleGeometry(legR0, 0.18, 3, 10), O.longPants ? C.bottom : C.skin, { y: -0.17 });
      if (!O.longPants) b.add(new THREE.CapsuleGeometry(legR0 + 0.012, 0.05, 3, 10), C.bottom, { y: -0.05 });
      if (a.outfit === 'tracksuit') b.add(new THREE.CapsuleGeometry(0.014, 0.24, 2, 4), C.white, { x: side * (legR0 + 0.002), y: -0.16 });
      this._addShoe(b, a.shoes, C);
      const mesh = this._mesh(b, pivot);
      return pivot;
    };
    const legL = makeLeg(-1);
    const legR = makeLeg(1);

    // ── 몸통 (달걀형) ──
    const torso = new THREE.Group();
    hips.add(torso);
    const tb = new PartBuilder();
    const tr = 0.25;
    const tScale = { sx: sw * (1 + fat * 0.18), sy: 1.1, sz: 0.88 + fat * 0.22, y: 0.22 };
    tb.add(new THREE.SphereGeometry(tr, 18, 12, 0, TAU, 0, Math.PI * 0.6), C.top, tScale);
    tb.add(new THREE.SphereGeometry(tr * 1.025, 18, 6, 0, TAU, Math.PI * 0.6, Math.PI * 0.4), C.bottom, tScale);
    // 허리 밴드
    tb.add(new THREE.TorusGeometry(tr * 0.96, 0.016, 4, 18), C.bottom, {
      rx: Math.PI / 2, y: 0.22 + Math.cos(Math.PI * 0.6) * tr * 1.1 + 0.01, sx: sw * (1 + fat * 0.18), sy: 0.88 + fat * 0.22,
    });
    // 가슴 (성장 / 여성형)
    const chestAmt = P.bust ? Math.max(0.25, st.chest) : st.chest;
    if (chestAmt > 0.04) {
      for (const side of [-1, 1]) {
        tb.add(new THREE.SphereGeometry(0.085, 10, 8), C.top, {
          x: side * 0.085 * sw, y: 0.32, z: 0.165 + fat * 0.03, sx: 1.1, sy: 0.85, sz: 0.35 + chestAmt * 0.45,
        });
      }
    }
    if (O.hood) tb.add(new THREE.SphereGeometry(0.15, 12, 8), C.top, { y: 0.46, z: -0.13, sx: 1.4, sy: 0.65, sz: 0.8 });
    if (a.outfit === 'tracksuit') {
      tb.add(new THREE.TorusGeometry(0.1, 0.022, 4, 14), C.white, { rx: Math.PI / 2, y: 0.47, sz: 0.8 });
    }
    if (O.sleeveless) {
      // 나시: 목둘레 라인
      tb.add(new THREE.TorusGeometry(0.1, 0.012, 4, 14), C.top, { rx: Math.PI / 2, y: 0.47, sz: 0.8 });
    }
    const torsoMesh = this._mesh(tb, torso);

    // ── 머리 ──
    const head = new THREE.Group();
    head.position.y = NECK_Y;
    torso.add(head);
    const hb = new PartBuilder();
    this._addHead(hb, a, C);
    this._mesh(hb, head);

    // ── 팔 (짧고 통통한 팔 + 동그란 손) ──
    const armR0 = 0.06 * limb * (1 + st.arms * 0.5);
    const shoulderX = 0.2 * sw + 0.03;
    const makeArm = (side) => {
      const pivot = new THREE.Group();
      pivot.position.set(side * shoulderX, 0.37, 0);
      torso.add(pivot);
      const b = new PartBuilder();
      const armColor = O.longSleeve ? C.top : C.skin;
      b.add(new THREE.CapsuleGeometry(armR0, 0.13, 3, 10), armColor, { y: -0.12 });
      if (!O.longSleeve && !O.sleeveless) {
        b.add(new THREE.CapsuleGeometry(armR0 + 0.016, 0.03, 3, 10), C.top, { y: -0.03 });
      }
      if (O.sleeveless || !O.longSleeve) {
        // 어깨 동그랗게 (성장 시 어깨 발달)
        b.add(new THREE.SphereGeometry(armR0 + 0.012 + st.shoulders * 0.03, 10, 8), O.sleeveless ? C.skin : C.top, { y: -0.01 });
      } else {
        b.add(new THREE.SphereGeometry(armR0 + 0.012 + st.shoulders * 0.03, 10, 8), C.top, { y: -0.01 });
      }
      if (a.outfit === 'tracksuit') b.add(new THREE.CapsuleGeometry(0.013, 0.16, 2, 4), C.white, { x: side * (armR0 + 0.002), y: -0.12 });
      b.add(new THREE.SphereGeometry(0.068 * limb, 12, 8), C.skin, { y: -0.27 });
      this._mesh(b, pivot);
      return pivot;
    };
    const armL = makeArm(-1);
    const armR = makeArm(1);

    this.parts = { hips, torso, torsoMesh, head, legL, legR, armL, armR };
    this.height = (HIP_Y + NECK_Y + HEAD_C + HEAD_R) * P.height;
    this.blob.scale.setScalar(P.height * (0.9 + fat * 0.2) * sw);
    this._placeNameTag();
    this.update(0, 0);
  }

  _addShoe(b, style, C) {
    const y = -0.375;
    if (style === 'slides') {
      b.add(new THREE.SphereGeometry(0.085, 12, 8), C.skin, { y, z: 0.03, sx: 1, sy: 0.6, sz: 1.4 });
      b.add(new THREE.SphereGeometry(0.1, 12, 6), C.shoe, { y: y + 0.005, z: 0.055, sx: 1.12, sy: 0.5, sz: 0.75 });
      b.add(new THREE.CylinderGeometry(0.1, 0.1, 0.03, 14), C.sole, { y: y - 0.05, z: 0.03, sx: 1.08, sz: 1.5 });
      return;
    }
    b.add(new THREE.SphereGeometry(0.1, 14, 10), C.shoe, { y, z: 0.035, sx: 1.05, sy: 0.68, sz: 1.42 });
    b.add(new THREE.CylinderGeometry(0.1, 0.1, 0.03, 14), C.sole, { y: y - 0.055, z: 0.035, sx: 1.07, sz: 1.45 });
    if (style === 'hightop') b.add(new THREE.CylinderGeometry(0.098, 0.1, 0.11, 12), C.shoe, { y: y + 0.06 });
  }

  _addHead(b, a, C) {
    const F = FACE[a.face] || FACE.round;
    const c = HEAD_C;
    const fz = F.fz;
    b.add(makeHeadGeometry(a.face), C.skin, { y: c });

    // 귀
    const earX = a.face === 'square' ? 0.27 : 0.28 * F.hair[0];
    for (const side of [-1, 1]) {
      b.add(new THREE.SphereGeometry(0.06, 8, 6), C.skin, { x: side * earX, y: c - 0.01, sx: 0.55, sy: 1, sz: 0.8 });
    }
    // 눈 (세로로 긴 동그란 눈 + 하이라이트)
    for (const side of [-1, 1]) {
      b.add(new THREE.SphereGeometry(0.042, 10, 8), C.eye, { x: side * 0.105, y: c - 0.005, z: fz, sx: 0.85, sy: 1.2, sz: 0.5 });
      b.add(new THREE.SphereGeometry(0.014, 6, 4), C.white, { x: side * 0.105 + 0.014, y: c + 0.022, z: fz + 0.021 });
      // 볼터치
      b.add(new THREE.SphereGeometry(0.045, 10, 6), C.blush, { x: side * 0.175, y: c - 0.075, z: fz - 0.05, sx: 1.25, sy: 0.6, sz: 0.3 });
    }
    // 웃는 입 (U 모양)
    b.add(new THREE.TorusGeometry(0.028, 0.009, 4, 10, Math.PI), C.mouth, { y: c - 0.07, z: fz + 0.008, rz: Math.PI });

    this._addHair(b, a.hair, C.hair, F.hair, c, fz);
  }

  _addHair(b, style, color, k, c, fz) {
    if (style === 'bald') return;
    const [kx, ky, kz] = k;
    const R = HEAD_R;
    const at = (x, y, z) => ({ x: x * kx, y: c + y * ky, z: z * kz });
    const cap = (scale, theta) => b.add(
      new THREE.SphereGeometry(R * scale, 18, 10, 0, TAU, 0, Math.PI * theta),
      color,
      { y: c, rx: -0.38, sx: kx, sy: ky, sz: kz },
    );
    const bangs = () => {
      for (const [x, y, z, s] of [[-0.12, 0.165, 0.215, 1], [0, 0.185, 0.225, 1.1], [0.12, 0.165, 0.215, 1]]) {
        b.add(new THREE.SphereGeometry(0.085 * s, 10, 6), color, { ...at(x, y, z), sx: 1.25, sy: 0.75, sz: 0.6 });
      }
    };

    switch (style) {
      case 'buzz':
        cap(1.025, 0.5);
        break;
      case 'spiky': {
        cap(1.05, 0.52);
        const dirs = [[0, 1, 0.1], [0.45, 0.85, 0], [-0.45, 0.85, 0], [0.25, 0.8, 0.5], [-0.25, 0.8, 0.5], [0, 0.75, -0.6], [0.4, 0.7, -0.45], [-0.4, 0.7, -0.45]];
        for (const [dx, dy, dz] of dirs) {
          const d = new THREE.Vector3(dx, dy, dz).normalize();
          const q = new THREE.Quaternion().setFromUnitVectors(UP, d);
          b.add(new THREE.ConeGeometry(0.075, 0.17, 6), color, { ...at(d.x * R * 1.08, d.y * R * 1.08, d.z * R * 1.08), quat: q });
        }
        break;
      }
      case 'long':
        cap(1.07, 0.58);
        bangs();
        b.add(new THREE.CapsuleGeometry(0.2, 0.2, 4, 12), color, { ...at(0, -0.13, -0.15), sx: 1.45, sz: 0.6 });
        for (const side of [-1, 1]) b.add(new THREE.CapsuleGeometry(0.065, 0.2, 3, 8), color, at(side * 0.26, -0.12, 0.02));
        break;
      case 'ponytail':
        cap(1.06, 0.55);
        bangs();
        b.add(new THREE.SphereGeometry(0.075, 10, 8), color, at(0, 0.1, -0.31));
        b.add(new THREE.CapsuleGeometry(0.075, 0.16, 4, 10), color, { ...at(0, -0.08, -0.37), rx: 0.35 });
        break;
      case 'bun':
        cap(1.06, 0.55);
        bangs();
        b.add(new THREE.SphereGeometry(0.12, 12, 10), color, at(0, 0.3, -0.06));
        break;
      case 'short':
      default:
        cap(1.06, 0.55);
        bangs();
        break;
    }
  }

  _placeNameTag() {
    if (this.nameTag) this.nameTag.position.y = (this.height || 1.5) + 0.28;
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
