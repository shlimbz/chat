// 로우폴리 3D 캐릭터 모델
// - 기본 도형(박스/구/원기둥)으로 조립 → 외부 모델 파일 불필요
// - 외형(appearance)이 바뀌면 파츠를 다시 조립
// - 절차적 애니메이션: idle / walk / run (+ Phase 4 운동 포즈용 확장 지점)
// - 성장 수치(bodyStats)를 근육 파츠 스케일로 반영 (Phase 5에서 서버 값 연결)
import * as THREE from 'three';
import {
  DEFAULT_APPEARANCE, DEFAULT_BODY_STATS, findBody, findOutfit, sanitizeAppearance, sanitizeBodyStats,
} from '../shared/appearance.js';

const TAU = Math.PI * 2;

function mat(color, extra = {}) {
  return new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.85, metalness: 0, ...extra });
}

export class CharacterModel {
  /**
   * @param {object} appearance
   * @param {{nickname?:string, castShadow?:boolean}} opts
   */
  constructor(appearance = DEFAULT_APPEARANCE, opts = {}) {
    this.root = new THREE.Group();
    this.root.name = 'Character';
    this.castShadow = opts.castShadow !== false;
    this.appearance = sanitizeAppearance(appearance);
    this.bodyStats = { ...DEFAULT_BODY_STATS };

    // 애니메이션 상태
    this.animPhase = 0;
    this.moveBlend = 0; // 0 = 정지, 1 = 걷기
    this.runBlend = 0; // 0 = 걷기, 1 = 달리기
    this.time = Math.random() * 10;
    this.action = 'idle'; // 네트워크 동기화용 상태 문자열 (idle | walk | run | exercise:*)

    this._disposables = [];
    this._build();

    this.nameTag = null;
    if (opts.nickname) this.setNickname(opts.nickname);
  }

  // ── 공개 API ───────────────────────────────────────────
  setAppearance(appearance) {
    this.appearance = sanitizeAppearance(appearance);
    this._build();
    if (this.nameTag) this._placeNameTag();
  }

  setBodyStats(stats) {
    this.bodyStats = sanitizeBodyStats(stats);
    this._applyBodyStats();
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
    const w = Math.min(248, ctx.measureText(name).width + 28);
    ctx.fillStyle = 'rgba(20,24,32,0.55)';
    roundRect(ctx, (256 - w) / 2, 10, w, 44, 14);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(name, 128, 33);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
    sprite.scale.set(1.6, 0.4, 1);
    sprite.renderOrder = 10;
    this.nameTag = sprite;
    this.root.add(sprite);
    this._placeNameTag();
  }

  /**
   * 매 프레임 호출
   * @param {number} dt 초
   * @param {number} speed 현재 수평 이동 속도 (m/s)
   */
  update(dt, speed = 0) {
    this.time += dt;
    const p = this.parts;
    if (!p) return;

    const targetMove = Math.min(1, speed / 2.2);
    const targetRun = Math.min(1, Math.max(0, (speed - 3.4) / 2.4));
    this.moveBlend += (targetMove - this.moveBlend) * Math.min(1, dt * 10);
    this.runBlend += (targetRun - this.runBlend) * Math.min(1, dt * 6);
    this.action = this.moveBlend < 0.15 ? 'idle' : (this.runBlend > 0.5 ? 'run' : 'walk');

    // 걸음 주기: 속도에 비례
    this.animPhase = (this.animPhase + dt * (4 + speed * 1.55)) % TAU;
    const ph = this.animPhase;
    const m = this.moveBlend;
    const r = this.runBlend;
    const swing = (0.5 + 0.35 * r) * m;

    for (const side of [-1, 1]) {
      const leg = side === 1 ? p.legR : p.legL;
      const arm = side === 1 ? p.armR : p.armL;
      const s = Math.sin(ph + (side === 1 ? 0 : Math.PI));
      leg.hip.rotation.x = s * swing;
      leg.knee.rotation.x = Math.max(0, -Math.cos(ph + (side === 1 ? 0 : Math.PI))) * (0.5 + 0.7 * r) * m;
      arm.shoulder.rotation.x = -s * swing * 0.85;
      arm.elbow.rotation.x = -(0.15 + 1.0 * r) * m - 0.08;
      arm.shoulder.rotation.z = side * (0.09 + 0.02 * Math.sin(this.time * 1.6));
    }

    // 몸통: 상하 반동, 달릴 때 앞으로 기울기, 숨쉬기
    const bob = Math.abs(Math.cos(ph)) * (0.035 + 0.04 * r) * m;
    p.hips.position.y = p.hipBaseY + bob - 0.02 * r;
    p.spine.rotation.x = 0.16 * r * m;
    p.spine.rotation.y = Math.sin(ph) * 0.08 * m;
    const breathe = 1 + Math.sin(this.time * 2.2) * 0.015 * (1 - m);
    p.chestGroup.scale.y = breathe;
    p.head.rotation.x = -0.1 * r * m + Math.sin(this.time * 1.1) * 0.02 * (1 - m);
  }

  dispose() {
    this._disposeParts();
    if (this.nameTag) {
      this.nameTag.material.map.dispose();
      this.nameTag.material.dispose();
    }
    this.root.removeFromParent();
  }

  // ── 내부: 조립 ─────────────────────────────────────────
  _disposeParts() {
    if (this.body) this.root.remove(this.body);
    for (const d of this._disposables) d.dispose();
    this._disposables = [];
    this.parts = null;
  }

  _geo(g) { this._disposables.push(g); return g; }

  _mesh(geo, material, parent, x = 0, y = 0, z = 0) {
    const m = new THREE.Mesh(this._geo(geo), material);
    m.position.set(x, y, z);
    m.castShadow = this.castShadow;
    m.receiveShadow = false;
    parent.add(m);
    return m;
  }

  _box(w, h, d, material, parent, x, y, z) {
    return this._mesh(new THREE.BoxGeometry(w, h, d), material, parent, x, y, z);
  }

  _build() {
    this._disposeParts();
    const a = this.appearance;
    const P = findBody(a.body);
    const O = findOutfit(a.outfit);

    const M = {
      skin: mat(a.skin),
      hair: mat(a.hairColor),
      top: mat(a.topColor),
      bottom: mat(a.bottomColor),
      shoe: mat(a.shoeColor),
      sole: mat('#3a3a3a'),
      dark: mat('#1d1d22', { roughness: 0.4 }),
      white: mat('#ffffff'),
      blush: mat('#f29a9a'),
      accent: mat('#ffffff'),
    };
    // 피부보다 약간 어두운 톤 (코/입)
    M.skinDark = mat(new THREE.Color(a.skin).multiplyScalar(0.82));
    this._disposables.push(...Object.values(M));
    this.materials = M;

    const body = new THREE.Group();
    body.name = 'Body';
    body.scale.setScalar(P.height);
    this.body = body;
    this.root.add(body);

    const sw = P.shoulder;
    const hw = P.hip;
    const limb = P.limb;
    const THIGH = 0.38;
    const SHIN = 0.36;
    const FOOT_H = 0.08;
    const hipBaseY = FOOT_H + THIGH + SHIN;

    const hips = new THREE.Group();
    hips.position.y = hipBaseY;
    body.add(hips);

    // 골반
    this._box(0.36 * hw, 0.16, 0.22, M.bottom, hips, 0, 0.02, 0);

    // ── 다리 ──
    const makeLeg = (side) => {
      const hip = new THREE.Group();
      hip.position.set(side * 0.1 * hw, -0.02, 0);
      hips.add(hip);
      const thigh = this._box(0.15 * limb, THIGH, 0.16 * limb, M.bottom, hip, 0, -THIGH / 2, 0);
      const knee = new THREE.Group();
      knee.position.y = -THIGH;
      hip.add(knee);
      const shin = this._box(0.12 * limb, SHIN, 0.13 * limb, O.longPants ? M.bottom : M.skin, knee, 0, -SHIN / 2, 0);
      // 신발
      const foot = new THREE.Group();
      foot.position.y = -SHIN;
      knee.add(foot);
      this._buildShoe(foot, M, a.shoes);
      return { hip, knee, thigh, shin };
    };
    const legL = makeLeg(-1);
    const legR = makeLeg(1);

    // ── 상체 ──
    const spine = new THREE.Group();
    spine.position.y = 0.08;
    hips.add(spine);

    const chestGroup = new THREE.Group();
    spine.add(chestGroup);
    const torsoW = 0.42 * sw;
    const torso = this._box(torsoW, 0.5, 0.24, M.top, chestGroup, 0, 0.25, 0);

    // 가슴 (성장 파츠)
    const pecs = [];
    for (const side of [-1, 1]) {
      const pec = P.bust
        ? this._mesh(new THREE.IcosahedronGeometry(0.075, 0), M.top, chestGroup, side * 0.085, 0.33, 0.12)
        : this._box(0.16 * sw, 0.12, 0.05, M.top, chestGroup, side * 0.09 * sw, 0.37, 0.12);
      pecs.push(pec);
    }
    // 등 (성장 파츠)
    const lats = this._box(torsoW * 0.92, 0.28, 0.05, M.top, chestGroup, 0, 0.33, -0.13);
    // 배 (체지방)
    const belly = this._box(torsoW * 0.8, 0.18, 0.05, M.top, chestGroup, 0, 0.12, 0.11);

    // 후드 / 트레이닝복 디테일
    if (O.hood) {
      this._box(0.3, 0.16, 0.1, M.top, chestGroup, 0, 0.5, -0.14);
    }
    if (a.outfit === 'tracksuit') {
      this._box(0.02, 0.46, 0.01, M.accent, chestGroup, 0, 0.25, 0.122);
    }
    if (O.sleeveless) {
      // 나시: 목둘레 노출
      this._box(0.16, 0.06, 0.01, M.skin, chestGroup, 0, 0.47, 0.122);
    }

    // 어깨 (성장 파츠)
    const shoulderX = torsoW / 2 + 0.04;
    const delts = [];
    for (const side of [-1, 1]) {
      delts.push(this._box(0.14, 0.13, 0.15, O.sleeveless ? M.skin : M.top, chestGroup, side * shoulderX, 0.46, 0));
    }

    // 목 & 머리
    this._box(0.1, 0.08, 0.1, M.skin, chestGroup, 0, 0.53, 0);
    const head = new THREE.Group();
    head.position.y = 0.56;
    chestGroup.add(head);
    this._buildHead(head, M, a);

    // ── 팔 ──
    const makeArm = (side) => {
      const shoulder = new THREE.Group();
      shoulder.position.set(side * (shoulderX + 0.02), 0.45, 0);
      shoulder.rotation.z = side * 0.09;
      chestGroup.add(shoulder);
      const upperMat = O.sleeveless ? M.skin : M.top;
      const muscleMat = O.longSleeve ? M.top : M.skin; // 반팔/나시는 근육이 피부로 보임
      const upper = this._box(0.11 * limb, 0.3, 0.11 * limb, upperMat, shoulder, 0, -0.15, 0);
      if (!O.longSleeve && !O.sleeveless) {
        // 반팔: 소매는 위쪽 절반, 아래로 피부 노출
        upper.scale.set(1.12, 0.55, 1.12);
        upper.position.y = -0.083;
        this._box(0.1 * limb, 0.16, 0.1 * limb, M.skin, shoulder, 0, -0.23, 0);
      }
      const biceps = this._box(0.08 * limb, 0.12, 0.05, muscleMat, shoulder, 0, -0.2, 0.045 * limb);
      const triceps = this._box(0.08 * limb, 0.12, 0.04, muscleMat, shoulder, 0, -0.19, -0.045 * limb);
      const elbow = new THREE.Group();
      elbow.position.y = -0.3;
      shoulder.add(elbow);
      const forearm = this._box(0.095 * limb, 0.26, 0.095 * limb, O.longSleeve ? M.top : M.skin, elbow, 0, -0.13, 0);
      this._box(0.09, 0.09, 0.09, M.skin, elbow, 0, -0.3, 0); // 손
      return { shoulder, elbow, upper, biceps, triceps, forearm };
    };
    const armL = makeArm(-1);
    const armR = makeArm(1);

    this.parts = {
      hips, hipBaseY, spine, chestGroup, torso, head, pecs, lats, belly, delts, legL, legR, armL, armR,
    };
    this.height = (hipBaseY + 0.08 + 0.56 + 0.42) * P.height;
    this._applyBodyStats();
  }

  _buildShoe(foot, M, style) {
    if (style === 'slides') {
      this._box(0.11, 0.05, 0.22, M.skin, foot, 0, -0.035, 0.04);
      this._box(0.13, 0.025, 0.25, M.sole, foot, 0, -0.07, 0.04);
      this._box(0.135, 0.035, 0.08, M.shoe, foot, 0, -0.03, 0.08);
      return;
    }
    this._box(0.14, 0.08, 0.26, M.shoe, foot, 0, -0.04, 0.045);
    this._box(0.145, 0.025, 0.27, M.sole, foot, 0, -0.075, 0.045);
    if (style === 'hightop') {
      this._box(0.145, 0.09, 0.15, M.shoe, foot, 0, 0.03, 0.0);
    }
  }

  _buildHead(head, M, a) {
    let headGeo;
    let frontZ;
    let hairScale = 1;
    switch (a.face) {
      case 'square':
        headGeo = new THREE.BoxGeometry(0.34, 0.36, 0.32);
        frontZ = 0.162; hairScale = 1.12;
        break;
      case 'oval': {
        headGeo = new THREE.SphereGeometry(0.18, 8, 6);
        headGeo.scale(0.95, 1.2, 1);
        frontZ = 0.172;
        break;
      }
      case 'vline':
        headGeo = new THREE.CylinderGeometry(0.19, 0.11, 0.38, 7);
        frontZ = 0.165; hairScale = 1.0;
        break;
      case 'round':
      default:
        headGeo = new THREE.IcosahedronGeometry(0.2, 1);
        frontZ = 0.188;
        break;
    }
    const cy = 0.2;
    this._mesh(headGeo, M.skin, head, 0, cy, 0);

    // 얼굴
    for (const side of [-1, 1]) {
      this._box(0.045, 0.065, 0.03, M.dark, head, side * 0.07, cy + 0.02, frontZ);
      this._box(0.016, 0.018, 0.01, M.white, head, side * 0.07 + 0.01, cy + 0.04, frontZ + 0.016);
      this._box(0.07, 0.018, 0.02, M.hair, head, side * 0.075, cy + 0.085, frontZ - 0.005);
      this._box(0.045, 0.02, 0.01, M.blush, head, side * 0.11, cy - 0.035, frontZ - 0.01);
    }
    this._box(0.035, 0.04, 0.03, M.skinDark, head, 0, cy - 0.02, frontZ + 0.005);
    this._box(0.07, 0.015, 0.02, M.skinDark, head, 0, cy - 0.08, frontZ - 0.012);

    // 헤어
    const hair = new THREE.Group();
    hair.position.y = cy;
    hair.scale.setScalar(hairScale);
    head.add(hair);
    const cap = (r) => this._mesh(new THREE.SphereGeometry(r, 9, 5, 0, TAU, 0, Math.PI * 0.5), M.hair, hair, 0, 0.01, -0.01);
    switch (a.hair) {
      case 'buzz':
        cap(0.205);
        break;
      case 'short':
        cap(0.218);
        this._box(0.3, 0.07, 0.06, M.hair, hair, 0, 0.13, 0.17);
        this._box(0.36, 0.18, 0.1, M.hair, hair, 0, -0.02, -0.15);
        break;
      case 'spiky': {
        cap(0.215);
        const spikes = [[0, 0.24, 0.05], [0.1, 0.21, -0.02], [-0.1, 0.21, -0.02], [0.05, 0.2, 0.12], [-0.06, 0.2, 0.12], [0, 0.2, -0.12]];
        for (const [x, y, z] of spikes) {
          const cone = this._mesh(new THREE.ConeGeometry(0.06, 0.16, 5), M.hair, hair, x, y, z);
          cone.rotation.set(z * 3, 0, -x * 4);
        }
        break;
      }
      case 'long':
        cap(0.222);
        this._box(0.42, 0.42, 0.1, M.hair, hair, 0, -0.12, -0.16);
        this._box(0.07, 0.36, 0.28, M.hair, hair, 0.2, -0.1, -0.03);
        this._box(0.07, 0.36, 0.28, M.hair, hair, -0.2, -0.1, -0.03);
        this._box(0.32, 0.07, 0.06, M.hair, hair, 0, 0.13, 0.17);
        break;
      case 'ponytail': {
        cap(0.22);
        this._box(0.32, 0.07, 0.06, M.hair, hair, 0, 0.13, 0.17);
        const tail = this._mesh(new THREE.CylinderGeometry(0.06, 0.03, 0.34, 6), M.hair, hair, 0, -0.02, -0.25);
        tail.rotation.x = 0.35;
        this._mesh(new THREE.SphereGeometry(0.06, 6, 4), M.hair, hair, 0, 0.13, -0.22);
        break;
      }
      case 'bun':
        cap(0.22);
        this._box(0.32, 0.07, 0.06, M.hair, hair, 0, 0.13, 0.17);
        this._mesh(new THREE.IcosahedronGeometry(0.1, 0), M.hair, hair, 0, 0.25, -0.08);
        break;
      case 'bald':
      default:
        break;
    }
  }

  _applyBodyStats() {
    const p = this.parts;
    if (!p) return;
    const s = this.bodyStats;
    for (const pec of p.pecs) pec.scale.set(1 + s.chest * 0.5, 1 + s.chest * 0.4, 1 + s.chest * 1.6);
    for (const d of p.delts) d.scale.setScalar(1 + s.shoulders * 0.6);
    p.lats.scale.set(1 + s.back * 0.35, 1 + s.back * 0.2, 1 + s.back * 2.0);
    p.belly.scale.set(1 + s.bodyFat * 0.15, 1, 0.3 + s.bodyFat * 2.2);
    for (const arm of [p.armL, p.armR]) {
      arm.biceps.scale.set(1 + s.arms * 0.5, 1 + s.arms * 0.3, 1 + s.arms * 1.4);
      arm.triceps.scale.set(1 + s.arms * 0.4, 1, 1 + s.arms * 1.0);
      arm.forearm.scale.set(1 + s.arms * 0.25, 1, 1 + s.arms * 0.25);
    }
    for (const leg of [p.legL, p.legR]) {
      leg.thigh.scale.set(1 + s.legs * 0.4, 1, 1 + s.legs * 0.45);
      leg.shin.scale.set(1 + s.legs * 0.3, 1, 1 + s.legs * 0.3);
    }
    // 상체 폭: 어깨 + 등 발달
    p.torso.scale.x = 1 + s.back * 0.12 + s.shoulders * 0.06;
  }

  _placeNameTag() {
    if (this.nameTag) this.nameTag.position.y = (this.height || 1.7) + 0.35;
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
