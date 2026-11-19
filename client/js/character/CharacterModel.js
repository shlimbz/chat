// 동글동글 SD(2~3등신) 로우폴리 캐릭터
//
// [성능 설계]
//  - 캐릭터 전체(몸·머리·팔다리·헤어·악세사리)를 "스킨드 메시" 1개로 합침 → 캐릭터 1명당 드로우콜 1번
//    (각 정점이 관절(Bone) 하나에만 붙는 단순 스키닝 — 계산이 가볍고 관절 애니메이션은 그대로 가능)
//  - 모든 캐릭터가 머티리얼 1개 공유, 그림자는 바닥 원형 그림자(블롭)
//  - 외형/성장 수치가 바뀔 때만 지오메트리를 다시 만듦
//
// [관절] root(발) → hips → legL/R → kneeL/R
//                         → torso → chest(몸통 숨쉬기) / head / armL/R → elbowL/R
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { normalizeForMerge } from '../core/geometryUtils.js';
import {
  DEFAULT_APPEARANCE, DEFAULT_BODY_STATS, findOutfit, sanitizeAppearance, sanitizeBodyStats,
} from '../shared/appearance.js';

const TAU = Math.PI * 2;
const HIP_Y = 0.44; // 골반(다리 관절) 높이
const THIGH = 0.2; // 골반 → 무릎
const NECK_Y = 0.47; // 골반 기준 머리 관절 높이
const SHOULDER_Y = 0.37;
const UPPER_ARM = 0.14; // 어깨 → 팔꿈치
const HEAD_R = 0.3; // 머리 반지름 (몸통보다 큼 → SD 비율)
const HEAD_C = 0.28; // 머리 관절 기준 머리 중심 높이
const LIE_LIFT = 0.24; // 누웠을 때 몸이 바닥에 파묻히지 않도록 띄우는 높이

// ── 공유 리소스 (모든 캐릭터가 함께 사용) ─────────────────
let sharedMaterial = null;
let blobResources = null;
let dumbbellGeo = null;

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

/** 덤벨컬 할 때 손에 드는 덤벨 (공유 지오메트리) */
function getDumbbellGeo() {
  if (dumbbellGeo) return dumbbellGeo;
  const b = new GeoBuilder();
  b.add(new THREE.CylinderGeometry(0.016, 0.016, 0.16, 6), '#c9ced6', { rz: Math.PI / 2 });
  for (const s of [-1, 1]) b.add(new THREE.CylinderGeometry(0.045, 0.045, 0.05, 6), '#2b2d33', { x: s * 0.08, rz: Math.PI / 2 });
  dumbbellGeo = b.build();
  return dumbbellGeo;
}

// 얼굴형별 수치: 눈 위치(z), 헤어 스케일
const FACE = {
  round: { fz: 0.272, hair: [1, 1, 1] },
  oval: { fz: 0.262, hair: [0.93, 1.08, 0.96] },
  square: { fz: 0.252, hair: [1.08, 1.02, 1.06] },
  vline: { fz: 0.272, hair: [1, 1, 1] },
};

function makeHeadGeometry(face, cheek) {
  switch (face) {
    case 'square':
      return new RoundedBoxGeometry(0.54 * cheek, 0.52, 0.5, 4, 0.16);
    case 'oval': {
      const g = new THREE.SphereGeometry(HEAD_R, 22, 16);
      g.scale(0.93 * cheek, 1.08, 0.96);
      return g;
    }
    case 'vline': {
      const g = new THREE.SphereGeometry(HEAD_R, 22, 16);
      const pos = g.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const y = pos.getY(i);
        const k = y < 0 ? 1 + (y / HEAD_R) * 0.3 : 1;
        pos.setX(i, pos.getX(i) * k * cheek);
        if (y < 0) pos.setZ(i, pos.getZ(i) * (1 + (y / HEAD_R) * 0.12));
      }
      g.computeVertexNormals();
      return g;
    }
    case 'round':
    default: {
      const g = new THREE.SphereGeometry(HEAD_R, 22, 16);
      if (cheek !== 1) g.scale(cheek, 1, 1);
      return g;
    }
  }
}

// ── 지오메트리 조립 도우미 ─────────────────────────────────
const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _e = new THREE.Euler();
const UP = new THREE.Vector3(0, 1, 0);

function composeLocal(t) {
  _p.set(t.x || 0, t.y || 0, t.z || 0);
  if (t.quat) _q.copy(t.quat);
  else _q.setFromEuler(_e.set(t.rx || 0, t.ry || 0, t.rz || 0));
  const s = t.s ?? 1;
  _s.set((t.sx ?? 1) * s, (t.sy ?? 1) * s, (t.sz ?? 1) * s);
  return _m.compose(_p, _q, _s);
}

/** 일반(스키닝 없는) 병합 */
class GeoBuilder {
  constructor() { this.list = []; }

  add(geo, color, t = {}) {
    const g = normalizeForMerge(geo, color);
    g.applyMatrix4(composeLocal(t));
    this.list.push(g);
  }

  build() {
    const out = this.list.length === 1 ? this.list[0] : mergeGeometries(this.list, false);
    if (this.list.length > 1) for (const g of this.list) g.dispose();
    return out;
  }
}

/** 관절(Bone)별로 도형을 붙여 하나의 스킨드 지오메트리로 병합 */
class SkinBuilder {
  constructor(debug) {
    this.list = [];
    this.debug = debug ? [] : null;
  }

  /**
   * @param {THREE.BufferGeometry} geo
   * @param {string} color
   * @param {THREE.Bone} bone 이 도형이 붙을 관절 (bone.userData.index 필요, matrixWorld 는 기본자세 기준)
   * @param {object} t 관절 기준 로컬 위치/회전/크기
   */
  add(geo, color, bone, t = {}) {
    if (this.debug) {
      this.debug.push({
        type: geo.type || geo.constructor.name, params: geo.parameters || geo.__args, color, bone: bone.name, t: { ...t, quat: t.quat ? t.quat.toArray?.() : undefined },
      });
    }
    const g = normalizeForMerge(geo, color);
    g.applyMatrix4(composeLocal(t));
    g.applyMatrix4(bone.matrixWorld);
    const n = g.attributes.position.count;
    const si = new Uint16Array(n * 4);
    const sw = new Float32Array(n * 4);
    const idx = bone.userData.index;
    for (let i = 0; i < n; i++) {
      si[i * 4] = idx;
      sw[i * 4] = 1;
    }
    g.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
    g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
    this.list.push(g);
  }

  build() {
    const out = mergeGeometries(this.list, false);
    for (const g of this.list) g.dispose();
    this.list = [];
    return out;
  }
}

// ── 애니메이션 도우미 ─────────────────────────────────────
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => t * t * (3 - 2 * t);
/** 키프레임 [[시간, 값], ...] 사이를 부드럽게 보간 */
function kf(k, pts) {
  if (k <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    if (k <= pts[i][0]) {
      const [t0, v0] = pts[i - 1];
      const [t1, v1] = pts[i];
      return lerp(v0, v1, smooth((k - t0) / Math.max(1e-6, t1 - t0)));
    }
  }
  return pts[pts.length - 1][1];
}

// 공격 키프레임 (k: 0~1)
const PUNCH = {
  arm: [[0, -0.25], [0.22, 0.35], [0.42, -1.6], [0.6, -1.55], [1, -0.25]],
  armZ: [[0, 0.3], [0.42, 0.06], [0.6, 0.06], [1, 0.3]],
  elbow: [[0, -1.2], [0.22, -2.1], [0.42, -0.05], [0.6, -0.1], [1, -1.2]],
  twist: [[0, 0], [0.22, 0.28], [0.42, -0.55], [0.62, -0.5], [1, 0]],
  lean: [[0, 0], [0.42, 0.16], [0.62, 0.14], [1, 0]],
  lunge: [[0, 0], [0.42, 0.07], [0.62, 0.06], [1, 0]],
};
const KICK = {
  hip: [[0, 0], [0.25, -1.3], [0.45, -1.6], [0.6, -1.55], [0.85, -1.0], [1, 0]],
  knee: [[0, 0], [0.25, 1.9], [0.45, 0.05], [0.6, 0.1], [0.85, 1.4], [1, 0]],
  lean: [[0, 0], [0.25, -0.18], [0.45, -0.38], [0.6, -0.35], [0.85, -0.15], [1, 0]],
  turn: [[0, 0], [0.25, 0.15], [0.45, 0.4], [0.6, 0.38], [1, 0]],
  hop: [[0, 0], [0.4, 0.03], [0.6, 0.03], [1, 0]],
};

export const EXERCISES = ['sit', 'ex_tread', 'ex_bench', 'ex_curl', 'ex_legpress', 'ex_shoulder', 'ex_lat'];

export class CharacterModel {
  /**
   * @param {object} appearance
   * @param {{nickname?:string, blobShadow?:boolean, admin?:boolean}} opts
   */
  constructor(appearance = DEFAULT_APPEARANCE, opts = {}) {
    this.root = new THREE.Group();
    this.root.name = 'Character';
    this.appearance = sanitizeAppearance(appearance, { ownedItems: allAccIds(appearance) });
    this.bodyStats = { ...DEFAULT_BODY_STATS };
    this._castShadow = false;

    this.animPhase = 0;
    this.moveBlend = 0;
    this.runBlend = 0;
    this.time = Math.random() * 10;
    this.action = 'idle'; // 네트워크 동기화용 (idle | walk | run | jump | sit | ex_*)
    this.airBlend = 0;
    this.landT = 0;
    this._wasAirborne = false;
    // 전투 모션
    this.attack = null; // { type, t, dur, side }
    this._punchSide = 1;
    this.flinchT = 0;
    this.downT = 0;
    this.downBlend = 0;
    // 운동 / 앉기
    this.exercise = null; // EXERCISES 중 하나
    this.exerciseT = 0;
    this.exerciseK = 0; // 0~1 (기구 부품 움직임에 사용)
    this.exBlend = 0;
    // 말풍선
    this.bubble = null;
    this.bubbleT = 0;

    // 바닥 원형 그림자
    const blob = getBlobResources();
    this.blob = new THREE.Mesh(blob.geo, blob.mat);
    this.blob.position.y = 0.012;
    this.blob.renderOrder = 1;
    this.blob.visible = opts.blobShadow !== false;
    this.root.add(this.blob);

    this._build();

    this.nameTag = null;
    this._nameLabel = opts.nickname ? (opts.admin ? `★ ${opts.nickname}` : opts.nickname) : null;
    if (opts.nickname) this.setNickname(this._nameLabel, opts.admin ? '#ffd84a' : '#ffffff');
  }

  // ── 공개 API ───────────────────────────────────────────
  setAppearance(appearance) {
    this.appearance = sanitizeAppearance(appearance, { ownedItems: allAccIds(appearance) });
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
    if (this.mesh) this.mesh.castShadow = v;
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
    this._placeLabels();
  }

  /** 머리 위 말풍선 (채팅) */
  say(text) {
    this._clearBubble();
    const lines = wrapText(String(text), 13, 3);
    const fontPx = 30;
    const lineH = 38;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    ctx.font = `bold ${fontPx}px "Apple SD Gothic Neo","Malgun Gothic",sans-serif`;
    const textW = Math.max(...lines.map((l) => ctx.measureText(l).width));
    const W = Math.ceil(Math.min(460, textW + 44));
    const H = lines.length * lineH + 30 + 18;
    canvas.width = W;
    canvas.height = H;
    ctx.font = `bold ${fontPx}px "Apple SD Gothic Neo","Malgun Gothic",sans-serif`;
    // 말풍선 + 꼬리
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#2b2d33';
    ctx.lineWidth = 4;
    roundRect(ctx, 3, 3, W - 6, H - 24, 22);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(W / 2 - 12, H - 23);
    ctx.lineTo(W / 2, H - 4);
    ctx.lineTo(W / 2 + 12, H - 23);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(W / 2 - 10, H - 27, 20, 6);
    ctx.fillStyle = '#2b2d33';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    lines.forEach((l, i) => ctx.fillText(l, W / 2, 3 + 15 + lineH / 2 + i * lineH));
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
    const k = 0.0052;
    sprite.scale.set(W * k, H * k, 1);
    sprite.center.set(0.5, 0); // 아래쪽 꼬리 끝이 기준점
    sprite.renderOrder = 11;
    this.bubble = sprite;
    this.bubbleT = Math.min(9, 4 + text.length * 0.08);
    this.root.add(sprite);
    this._placeLabels();
  }

  /** 주먹(좌우 번갈아) / 발차기 모션 시작 */
  playAttack(type) {
    const dur = type === 'kick' ? 0.5 : 0.36;
    if (type === 'punch') this._punchSide *= -1;
    this.attack = { type, t: 0, dur, side: this._punchSide };
  }

  /** 맞았을 때 움찔 */
  flinch() {
    this.flinchT = 0.28;
  }

  /** 넘어져서 기절 (머리 위에 별이 빙글빙글) */
  knockDown(ms) {
    this.downT = ms / 1000;
    if (!this.stars) {
      this.stars = makeDizzyStars();
      this.root.add(this.stars);
    }
    this.stars.visible = true;
  }

  /** 앉기 / 기구 운동 자세 (null 이면 해제) */
  setExercise(type) {
    const t = EXERCISES.includes(type) ? type : null;
    if (t === this.exercise) return;
    this.exercise = t;
    this.exerciseT = 0;
    this.exBlend = 0;
    const curl = t === 'ex_curl';
    if (curl && !this.dumbbells) {
      this.dumbbells = [this.parts.elbowL, this.parts.elbowR].map((elbow) => {
        const m = new THREE.Mesh(getDumbbellGeo(), getCharacterMaterial());
        m.position.y = -0.15;
        elbow.add(m);
        return m;
      });
    }
    if (this.dumbbells) for (const d of this.dumbbells) d.visible = curl;
  }

  /**
   * 매 프레임 호출 (관절 회전값 몇 개만 바꾸므로 매우 가벼움)
   * @param {number} dt
   * @param {number} speed 수평 이동 속도 (m/s)
   * @param {boolean} airborne 공중에 떠 있는지 (점프)
   */
  update(dt, speed = 0, airborne = false) {
    const p = this.parts;
    if (!p) return;
    this.time += dt;

    const ex = this.exercise;
    if (ex === 'ex_tread') { speed = 5.2; airborne = false; }
    else if (ex) { speed = 0; airborne = false; }

    const targetMove = airborne ? 0 : Math.min(1, speed / 2.2);
    const targetRun = Math.min(1, Math.max(0, (speed - 3.4) / 2.4));
    this.moveBlend += (targetMove - this.moveBlend) * Math.min(1, dt * 10);
    this.runBlend += (targetRun - this.runBlend) * Math.min(1, dt * 6);
    this.airBlend += ((airborne ? 1 : 0) - this.airBlend) * Math.min(1, dt * (airborne ? 18 : 12));
    if (this._wasAirborne && !airborne) this.landT = 0.18; // 착지 순간 살짝 찌그러짐
    this._wasAirborne = airborne;
    this.landT = Math.max(0, this.landT - dt);

    if (ex) this.action = ex;
    else if (airborne) this.action = 'jump';
    else this.action = this.moveBlend < 0.15 ? 'idle' : (this.runBlend > 0.5 ? 'run' : 'walk');

    this._resetPose(p);
    this._locomotion(dt, speed, p);
    if (ex && ex !== 'ex_tread') this._exercisePose(dt, p);
    else if (ex === 'ex_tread') this.exerciseK = (Math.sin(this.animPhase) + 1) / 2;
    this._combatPose(dt, p);
    this._updateBubble(dt);
  }

  dispose() {
    this._disposeMesh();
    this._clearBubble();
    if (this.nameTag) {
      this.nameTag.material.map.dispose();
      this.nameTag.material.dispose();
    }
    this.root.removeFromParent();
  }

  // ── 포즈 ───────────────────────────────────────────────
  _resetPose(p) {
    p.root.rotation.set(0, 0, 0);
    p.root.position.set(0, 0, 0);
    p.hips.position.set(0, HIP_Y, 0);
    p.hips.rotation.set(0, 0, 0);
    p.torso.rotation.set(0, 0, 0);
    p.chest.scale.set(1, 1, 1);
    p.head.rotation.set(0, 0, 0);
    for (const b of [p.legL, p.legR, p.kneeL, p.kneeR, p.elbowL, p.elbowR]) b.rotation.set(0, 0, 0);
    p.armL.rotation.set(0, 0, -0.28);
    p.armR.rotation.set(0, 0, 0.28);
    p.elbowL.rotation.x = -0.15;
    p.elbowR.rotation.x = -0.15;
  }

  _locomotion(dt, speed, p) {
    this.animPhase = (this.animPhase + dt * (5 + speed * 1.9)) % TAU;
    const ph = this.animPhase;
    const m = this.moveBlend;
    const r = this.runBlend;
    const air = this.airBlend;
    const s = Math.sin(ph);
    const swing = (0.55 + 0.35 * r) * m;
    const mix = (walk, jump) => walk * (1 - air) + jump * air;

    p.legL.rotation.x = mix(-s * swing, -0.75);
    p.legR.rotation.x = mix(s * swing, -0.2);
    // 무릎: 다리가 뒤로 갔다 앞으로 올 때 굽힘
    const kneeAmt = (0.2 + 0.9 * r) * m;
    p.kneeL.rotation.x = mix(kneeAmt * (0.5 + 0.5 * Math.sin(ph + Math.PI / 2)), 1.15);
    p.kneeR.rotation.x = mix(kneeAmt * (0.5 + 0.5 * Math.sin(ph - Math.PI / 2)), 0.55);
    p.armL.rotation.x = mix(s * swing * 1.1, -0.35);
    p.armR.rotation.x = mix(-s * swing * 1.1, -0.35);
    const armOut = mix(0.28 - 0.1 * m + Math.sin(this.time * 1.8) * 0.03 * (1 - m), 2.2);
    p.armL.rotation.z = -armOut;
    p.armR.rotation.z = armOut;
    const elbow = mix(-(0.15 + 0.35 * m + 1.1 * r), -0.35);
    p.elbowL.rotation.x = elbow;
    p.elbowR.rotation.x = elbow;

    p.hips.position.y = HIP_Y + Math.abs(Math.cos(ph)) * (0.04 + 0.04 * r) * m * (1 - air);
    p.torso.rotation.z = s * 0.07 * m * (1 - r * 0.5) * (1 - air);
    p.torso.rotation.x = 0.16 * r * m - 0.08 * air;
    const breathe = Math.sin(this.time * 2.4) * 0.02 * (1 - m) - (this.landT / 0.18) * 0.12;
    p.chest.scale.set(1 - breathe * 0.5, 1 + breathe, 1 - breathe * 0.5);
    p.head.rotation.z = Math.sin(this.time * 1.3) * 0.05 * (1 - m) - s * 0.04 * m;
    p.head.rotation.x = -0.08 * r * m - 0.12 * air;
  }

  _sitLegs(p, w = 1) {
    p.hips.position.y = lerp(p.hips.position.y, 0.1, w);
    p.legL.rotation.x = lerp(p.legL.rotation.x, -1.5, w);
    p.legR.rotation.x = lerp(p.legR.rotation.x, -1.5, w);
    p.kneeL.rotation.x = lerp(p.kneeL.rotation.x, 1.45, w);
    p.kneeR.rotation.x = lerp(p.kneeR.rotation.x, 1.45, w);
  }

  _exercisePose(dt, p) {
    this.exerciseT += dt;
    this.exBlend = Math.min(1, this.exBlend + dt * 6);
    const w = smooth(this.exBlend);
    const t = this.exerciseT;
    const arm = (side, x, z, elbowX) => {
      const a = side < 0 ? p.armL : p.armR;
      const e = side < 0 ? p.elbowL : p.elbowR;
      a.rotation.x = lerp(a.rotation.x, x, w);
      a.rotation.z = lerp(a.rotation.z, side * z, w);
      e.rotation.x = lerp(e.rotation.x, elbowX, w);
    };
    switch (this.exercise) {
      case 'sit': {
        this._sitLegs(p, w);
        arm(-1, -0.45, 0.18, -0.85);
        arm(1, -0.45, 0.18, -0.85);
        this.exerciseK = 0;
        break;
      }
      case 'ex_bench': {
        // 벤치에 누워서 바벨을 밀어 올림
        const k = (Math.sin(t * 2.6) + 1) / 2;
        this.exerciseK = k;
        p.root.rotation.x = -Math.PI / 2 * w;
        p.root.position.y = LIE_LIFT * w;
        p.kneeL.rotation.x = 1.3 * w;
        p.kneeR.rotation.x = 1.3 * w;
        for (const side of [-1, 1]) arm(side, lerp(-1.05, -1.57, k), lerp(0.75, 0.22, k), lerp(-1.6, -0.05, k));
        break;
      }
      case 'ex_curl': {
        // 양팔 번갈아 덤벨 컬
        const kL = Math.max(0, Math.sin(t * 3));
        const kR = Math.max(0, Math.sin(t * 3 + Math.PI));
        this.exerciseK = Math.max(kL, kR);
        arm(-1, -0.12 - 0.25 * kL, 0.16, lerp(-0.1, -2.35, kL));
        arm(1, -0.12 - 0.25 * kR, 0.16, lerp(-0.1, -2.35, kR));
        p.torso.rotation.x = lerp(p.torso.rotation.x, -0.05, w);
        break;
      }
      case 'ex_legpress': {
        const k = (Math.sin(t * 2.4) + 1) / 2;
        this.exerciseK = k;
        p.root.rotation.x = -0.55 * w;
        p.hips.position.y = lerp(p.hips.position.y, 0.1, w);
        for (const [leg, knee] of [[p.legL, p.kneeL], [p.legR, p.kneeR]]) {
          leg.rotation.x = lerp(leg.rotation.x, lerp(-2.0, -1.35, k), w);
          knee.rotation.x = lerp(knee.rotation.x, lerp(2.0, 0.15, k), w);
        }
        arm(-1, -0.3, 0.55, -0.4);
        arm(1, -0.3, 0.55, -0.4);
        break;
      }
      case 'ex_shoulder': {
        const k = (Math.sin(t * 2.6) + 1) / 2;
        this.exerciseK = k;
        this._sitLegs(p, w);
        for (const side of [-1, 1]) arm(side, -0.2, lerp(1.6, 2.75, k), lerp(-1.6, -0.1, k));
        break;
      }
      case 'ex_lat': {
        const k = (Math.sin(t * 2.4) + 1) / 2; // 1 = 당긴 상태
        this.exerciseK = k;
        this._sitLegs(p, w);
        for (const side of [-1, 1]) arm(side, lerp(-0.15, -0.35, k), lerp(2.85, 1.95, k), lerp(-0.1, -1.9, k));
        p.torso.rotation.x = lerp(p.torso.rotation.x, -0.12 * k, w);
        break;
      }
      default:
        break;
    }
  }

  _combatPose(dt, p) {
    // ── 공격 ──
    if (this.attack) {
      const a = this.attack;
      a.t += dt;
      const k = a.t / a.dur;
      if (k >= 1) {
        this.attack = null;
      } else {
        const w = smooth(Math.min(1, k / 0.08, (1 - k) / 0.15)); // 앞뒤로 부드럽게 섞기
        if (a.type === 'punch') {
          const side = a.side;
          const armP = side > 0 ? p.armR : p.armL;
          const elbowP = side > 0 ? p.elbowR : p.elbowL;
          const armG = side > 0 ? p.armL : p.armR;
          const elbowG = side > 0 ? p.elbowL : p.elbowR;
          armP.rotation.x = lerp(armP.rotation.x, kf(k, PUNCH.arm), w);
          armP.rotation.z = lerp(armP.rotation.z, side * kf(k, PUNCH.armZ), w);
          elbowP.rotation.x = lerp(elbowP.rotation.x, kf(k, PUNCH.elbow), w);
          // 반대 손은 턱 앞에서 가드
          armG.rotation.x = lerp(armG.rotation.x, -1.0, w);
          armG.rotation.z = lerp(armG.rotation.z, -side * 0.12, w);
          elbowG.rotation.x = lerp(elbowG.rotation.x, -2.1, w);
          p.torso.rotation.y = lerp(p.torso.rotation.y, side * kf(k, PUNCH.twist), w);
          p.torso.rotation.x += kf(k, PUNCH.lean) * w;
          p.hips.position.z = kf(k, PUNCH.lunge) * w;
          // 다리는 앞뒤로 벌린 자세
          const front = side > 0 ? p.legL : p.legR;
          const back = side > 0 ? p.legR : p.legL;
          front.rotation.x = lerp(front.rotation.x, -0.3, w);
          back.rotation.x = lerp(back.rotation.x, 0.3, w);
          p.kneeL.rotation.x = lerp(p.kneeL.rotation.x, 0.25, w);
          p.kneeR.rotation.x = lerp(p.kneeR.rotation.x, 0.25, w);
        } else {
          p.legR.rotation.x = lerp(p.legR.rotation.x, kf(k, KICK.hip), w);
          p.kneeR.rotation.x = lerp(p.kneeR.rotation.x, kf(k, KICK.knee), w);
          p.legL.rotation.x = lerp(p.legL.rotation.x, 0.12, w);
          p.kneeL.rotation.x = lerp(p.kneeL.rotation.x, 0.3, w);
          p.torso.rotation.x += kf(k, KICK.lean) * w;
          p.hips.rotation.y = kf(k, KICK.turn) * w;
          p.hips.position.y += kf(k, KICK.hop) * w;
          // 팔은 균형 잡기
          p.armL.rotation.z = lerp(p.armL.rotation.z, -0.95, w);
          p.armR.rotation.z = lerp(p.armR.rotation.z, 0.95, w);
          p.armL.rotation.x = lerp(p.armL.rotation.x, -0.3, w);
          p.armR.rotation.x = lerp(p.armR.rotation.x, 0.2, w);
          p.elbowL.rotation.x = lerp(p.elbowL.rotation.x, -0.9, w);
          p.elbowR.rotation.x = lerp(p.elbowR.rotation.x, -0.9, w);
        }
      }
    }
    // ── 피격 움찔 ──
    if (this.flinchT > 0) {
      this.flinchT = Math.max(0, this.flinchT - dt);
      const f = Math.sin((this.flinchT / 0.28) * Math.PI);
      p.torso.rotation.x -= 0.35 * f;
      p.head.rotation.x -= 0.3 * f;
      p.armL.rotation.z -= 0.5 * f;
      p.armR.rotation.z += 0.5 * f;
    }
    // ── 기절 (뒤로 벌러덩) ──
    if (this.downT > 0) this.downT = Math.max(0, this.downT - dt);
    const target = this.downT > 0 ? 1 : 0;
    this.downBlend += (target - this.downBlend) * Math.min(1, dt * (target ? 10 : 5));
    const d = this.downBlend;
    if (d > 0.001) {
      p.root.rotation.x = lerp(p.root.rotation.x, -Math.PI / 2, d);
      p.root.position.y = lerp(p.root.position.y, LIE_LIFT, d);
      p.armL.rotation.z = lerp(p.armL.rotation.z, -1.2, d);
      p.armR.rotation.z = lerp(p.armR.rotation.z, 1.2, d);
      p.kneeL.rotation.x = lerp(p.kneeL.rotation.x, 0.5, d);
      p.kneeR.rotation.x = lerp(p.kneeR.rotation.x, 0.2, d);
    }
    if (this.stars) {
      this.stars.visible = this.downT > 0;
      if (this.stars.visible) {
        this.stars.rotation.y += dt * 4;
        this.stars.position.set(0, 0.55, -(this.height || 1.5) * 0.85);
      }
    }
  }

  _updateBubble(dt) {
    if (!this.bubble) return;
    this.bubbleT -= dt;
    if (this.bubbleT <= 0) { this._clearBubble(); return; }
    this.bubble.material.opacity = Math.min(1, this.bubbleT / 0.5);
  }

  _clearBubble() {
    if (!this.bubble) return;
    this.root.remove(this.bubble);
    this.bubble.material.map.dispose();
    this.bubble.material.dispose();
    this.bubble = null;
  }

  // ── 조립 ───────────────────────────────────────────────
  _disposeMesh() {
    if (this.mesh) {
      this.root.remove(this.mesh);
      this.mesh.geometry.dispose();
      this.mesh.skeleton?.dispose();
    }
    this.mesh = null;
    this.parts = null;
    this.dumbbells = null;
  }

  _build() {
    const prevExercise = this.exercise;
    this._disposeMesh();
    const a = this.appearance;
    const st = this.bodyStats;
    const O = findOutfit(a.outfit);
    const female = a.gender === 'female';
    const mus = Math.min(1, a.muscle + st.chest * 0.3 + st.arms * 0.2);
    const wt = a.weight;

    const C = {
      skin: a.skin,
      hair: a.hairColor,
      top: a.topColor,
      bottom: a.bottomColor,
      shoe: a.shoeColor,
      sole: '#4a4a52',
      eye: '#2b2420',
      white: '#ffffff',
      blush: female ? '#ff8fa3' : '#ffa6b3',
      mouth: '#8a3d36',
      gold: '#e8b923',
    };

    // 체형 수치 (성별 + 근육량 + 몸무게)
    const heightScale = (female ? 0.96 : 1) * (0.9 + a.height * 0.2);
    const sw = (female ? 0.88 : 1.0) * (1 + mus * 0.2 + wt * 0.08 + st.shoulders * 0.1 + st.back * 0.08);
    const hw = (female ? 1.02 : 0.92) * (1 + wt * 0.18);
    const limb = (female ? 0.92 : 1.0) * (1 + wt * 0.32 + mus * 0.15);
    const armR0 = 0.056 * limb * (1 + mus * 0.28 + st.arms * 0.3);
    const legR0 = 0.08 * limb * (1 + mus * 0.15 + st.legs * 0.3);
    const girthX = sw * (1 + wt * 0.2);
    const girthZ = 0.84 + wt * 0.3 + mus * 0.06;
    const cheek = 1 + wt * 0.07;

    // ── 관절(Bone) 만들기 (기본자세 = 모든 회전 0) ──
    const bones = [];
    const bone = (name, parent, x = 0, y = 0, z = 0) => {
      const b = new THREE.Bone();
      b.name = name;
      b.position.set(x, y, z);
      b.userData.index = bones.length;
      bones.push(b);
      if (parent) parent.add(b);
      return b;
    };
    const root = bone('root', null);
    const hips = bone('hips', root, 0, HIP_Y, 0);
    const legX = 0.1 * hw;
    const legL = bone('legL', hips, -legX, -0.01, 0);
    const kneeL = bone('kneeL', legL, 0, -THIGH, 0);
    const legR = bone('legR', hips, legX, -0.01, 0);
    const kneeR = bone('kneeR', legR, 0, -THIGH, 0);
    const torso = bone('torso', hips);
    const chest = bone('chest', torso);
    const head = bone('head', torso, 0, NECK_Y, 0);
    const shoulderX = 0.2 * sw + 0.035;
    const armL = bone('armL', torso, -shoulderX, SHOULDER_Y, 0);
    const elbowL = bone('elbowL', armL, 0, -UPPER_ARM, 0);
    const armR = bone('armR', torso, shoulderX, SHOULDER_Y, 0);
    const elbowR = bone('elbowR', armR, 0, -UPPER_ARM, 0);
    root.updateMatrixWorld(true);

    const debug = typeof globalThis !== 'undefined' && globalThis.__RECORD_PARTS;
    const b = new SkinBuilder(debug);

    // ── 다리 (허벅지 + 정강이·신발) ──
    for (const [leg, knee, side] of [[legL, kneeL, -1], [legR, kneeR, 1]]) {
      const legColor = O.longPants ? C.bottom : C.skin;
      b.add(new THREE.CapsuleGeometry(legR0 * 1.04, 0.11, 4, 12), O.longPants ? C.bottom : C.bottom, leg, { y: -0.1 });
      b.add(new THREE.CapsuleGeometry(legR0, 0.08, 4, 12), legColor, knee, { y: -0.08 });
      this._addShoe(b, knee, a.shoes, C, legR0);
      void side;
    }
    // ── 몸통 (달걀형): 아래쪽(하의)은 골반에, 위쪽(상의)은 가슴에 ──
    const tr = 0.25;
    const tS = { sx: girthX, sy: 1.1, sz: girthZ, y: 0.22 };
    b.add(new THREE.SphereGeometry(tr, 22, 12, 0, TAU, 0, Math.PI * 0.62), C.top, chest, tS);
    b.add(new THREE.SphereGeometry(tr * 1.02, 22, 8, 0, TAU, Math.PI * 0.58, Math.PI * 0.42), C.bottom, hips, { ...tS, y: tS.y - HIP_Y + HIP_Y });
    // 가슴 (근육질 남자 / 여자) — 몸통 안쪽으로 묻어 매끈하게
    const chestAmt = female ? 0.35 + wt * 0.2 : Math.max(0, mus - 0.35) * 1.4 + st.chest * 0.6;
    if (chestAmt > 0.05) {
      for (const side of [-1, 1]) {
        b.add(new THREE.SphereGeometry(0.1, 12, 10), C.top, chest, {
          x: side * 0.09 * sw, y: female ? 0.3 : 0.33, z: 0.14 * girthZ + 0.012, sx: 1.05, sy: female ? 0.95 : 0.8, sz: 0.3 + chestAmt * 0.3,
        });
      }
    }
    if (O.hood) b.add(new THREE.SphereGeometry(0.16, 14, 10), C.top, chest, { y: 0.44, z: -0.12, sx: 1.35, sy: 0.55, sz: 0.65 });
    if (a.outfit === 'tracksuit') b.add(new THREE.CylinderGeometry(0.105, 0.115, 0.05, 14), C.white, chest, { y: 0.47 }); // 흰 목깃
    if (a.acc.neck === 'necklace') {
      b.add(new THREE.TorusGeometry(0.115, 0.01, 4, 20), C.gold, chest, { y: 0.44, z: 0.025, rx: Math.PI / 2 + 0.35 });
      b.add(new THREE.SphereGeometry(0.022, 8, 6), C.gold, chest, { y: 0.39, z: 0.13 });
    }

    // ── 머리 ──
    this._addHead(b, head, a, C, female, cheek);

    // ── 팔 (윗팔 + 아래팔·손) ──
    for (const [arm, elbow, side] of [[armL, elbowL, -1], [armR, elbowR, 1]]) {
      const upperColor = O.sleeveless ? C.skin : (O.longSleeve ? C.top : C.skin);
      // 어깨: 팔 굵기와 거의 같게 (튀어나오지 않게)
      b.add(new THREE.SphereGeometry(armR0 + 0.004 + st.shoulders * 0.015, 12, 10), O.sleeveless ? C.skin : C.top, arm, { y: -0.01, sx: 1.05, sy: 0.9, sz: 1.0 });
      b.add(new THREE.CapsuleGeometry(armR0, 0.08, 4, 12), upperColor, arm, { y: -0.075 });
      if (!O.longSleeve && !O.sleeveless) b.add(new THREE.CapsuleGeometry(armR0 + 0.007, 0.03, 4, 12), C.top, arm, { y: -0.035 });
      b.add(new THREE.CapsuleGeometry(armR0 * 0.94, 0.06, 4, 12), O.longSleeve ? C.top : C.skin, elbow, { y: -0.06 });
      if (a.outfit === 'tracksuit') b.add(new THREE.CapsuleGeometry(armR0 * 0.96 + 0.004, 0.012, 3, 12), C.white, elbow, { y: -0.115 });
      b.add(new THREE.SphereGeometry(0.066 * limb, 12, 10), C.skin, elbow, { y: -0.155 });
      void side;
    }

    const geo = b.build();
    const mesh = new THREE.SkinnedMesh(geo, getCharacterMaterial());
    mesh.add(root);
    mesh.bind(new THREE.Skeleton(bones));
    mesh.frustumCulled = false; // 포즈가 바뀌어도 사라지지 않게 (캐릭터 수가 적어 부담 없음)
    mesh.castShadow = this._castShadow;
    root.scale.setScalar(heightScale);
    this.mesh = mesh;
    this.debugParts = b.debug;
    this.debugBones = debug ? bones.map((x) => ({
      name: x.name, parent: x.parent?.isBone ? x.parent.name : null, p: x.position.toArray?.() || [x.position.x, x.position.y, x.position.z],
    })) : null;
    this.root.add(mesh);

    this.parts = {
      root, hips, torso, chest, head, legL, kneeL, legR, kneeR, armL, elbowL, armR, elbowR,
    };
    this.heightScale = heightScale;
    this.height = (HIP_Y + NECK_Y + HEAD_C + HEAD_R + (a.hair === 'afro' || a.hair === 'topknot' || a.hair === 'mohawk' ? 0.12 : 0)) * heightScale;
    this.blob.scale.setScalar(heightScale * (0.85 + wt * 0.25) * sw);
    if (prevExercise) { this.exercise = null; this.setExercise(prevExercise); }
    this._placeLabels();
    this.update(0, 0);
  }

  _addShoe(b, knee, style, C, legR0) {
    const y = -0.175;
    const w = Math.max(1, legR0 / 0.08);
    if (style === 'slides') {
      b.add(new THREE.SphereGeometry(0.085, 14, 10), C.skin, knee, { y, z: 0.03, sx: w, sy: 0.6, sz: 1.3 });
      b.add(new THREE.SphereGeometry(0.095, 14, 8), C.shoe, knee, { y: y + 0.005, z: 0.05, sx: 1.08 * w, sy: 0.5, sz: 0.72 });
      b.add(new THREE.CylinderGeometry(0.095, 0.095, 0.022, 16), C.sole, knee, { y: y - 0.05, z: 0.03, sx: 1.05 * w, sz: 1.4 });
      return;
    }
    // 둥글고 짧은 신발
    b.add(new THREE.SphereGeometry(0.1, 16, 12), C.shoe, knee, { y, z: 0.03, sx: 1.02 * w, sy: 0.66, sz: 1.28 });
    b.add(new THREE.CylinderGeometry(0.098, 0.098, 0.022, 16), C.sole, knee, { y: y - 0.054, z: 0.03, sx: 1.03 * w, sz: 1.3 });
    if (style === 'hightop') b.add(new THREE.CylinderGeometry(0.092, 0.098, 0.1, 14), C.shoe, knee, { y: y + 0.055, sx: w, sz: w });
  }

  _addHead(b, head, a, C, female, cheek) {
    const F = FACE[a.face] || FACE.round;
    const c = HEAD_C;
    const fz = F.fz;
    b.add(makeHeadGeometry(a.face, cheek), C.skin, head, { y: c });

    // 귀 (작고 머리에 붙게)
    const earX = (a.face === 'square' ? 0.262 : 0.272 * F.hair[0]) * cheek;
    for (const side of [-1, 1]) {
      b.add(new THREE.SphereGeometry(0.048, 10, 8), C.skin, head, { x: side * earX, y: c - 0.01, sx: 0.5, sy: 1, sz: 0.8 });
      if (a.acc.ears === 'earrings') b.add(new THREE.SphereGeometry(0.022, 8, 6), C.gold, head, { x: side * (earX + 0.005), y: c - 0.07 });
    }
    // 눈 (세로로 긴 동그란 눈 + 하이라이트), 여자는 속눈썹
    const eyeS = female ? 1.1 : 1;
    for (const side of [-1, 1]) {
      b.add(new THREE.SphereGeometry(0.042 * eyeS, 12, 10), C.eye, head, { x: side * 0.105, y: c - 0.005, z: fz, sx: 0.85, sy: 1.2, sz: 0.45 });
      b.add(new THREE.SphereGeometry(0.014 * eyeS, 6, 4), C.white, head, { x: side * 0.105 + 0.014, y: c + 0.022, z: fz + 0.019 });
      b.add(new THREE.SphereGeometry(0.045, 10, 6), C.blush, head, { x: side * 0.172 * cheek, y: c - 0.075, z: fz - 0.05, sx: 1.25, sy: 0.6, sz: 0.25 });
      if (female) {
        b.add(new THREE.SphereGeometry(0.03, 8, 4), C.eye, head, { x: side * 0.14, y: c + 0.035, z: fz - 0.012, sx: 0.9, sy: 0.35, sz: 0.3, rz: side * -0.5 });
      } else {
        b.add(new THREE.CapsuleGeometry(0.011, 0.045, 2, 6), C.hair, head, { x: side * 0.105, y: c + 0.08, z: fz - 0.008, rz: Math.PI / 2 + side * 0.12 });
      }
    }
    // 웃는 입
    b.add(new THREE.TorusGeometry(0.026, 0.008, 4, 10, Math.PI), C.mouth, head, { y: c - 0.07, z: fz + 0.004, rz: Math.PI });

    // 모자를 쓰면 위로 솟는 머리(모히칸·아프로 등)는 모자 밑으로 눌린 짧은 머리로 표시
    const tall = ['mohawk', 'afro', 'topknot', 'bun', 'spiky', 'heihachi'];
    const hair = a.acc?.hat && tall.includes(a.hair) ? 'buzz' : a.hair;
    this._addHair(b, head, hair, C.hair, F.hair, c, C.skin);
    this._addHeadAcc(b, head, a, C, F, c, fz);
  }

  _addHair(b, head, style, color, k, c, skin) {
    if (style === 'bald') return;
    const [kx, ky, kz] = k;
    const R = HEAD_R;
    const at = (x, y, z) => ({ x: x * kx, y: c + y * ky, z: z * kz });
    const cap = (scale, theta, tilt = -0.38) => b.add(
      new THREE.SphereGeometry(R * scale, 22, 12, 0, TAU, 0, Math.PI * theta), color, head,
      { y: c, rx: tilt, sx: kx, sy: ky, sz: kz },
    );
    // 앞머리: 이마를 덮는 납작한 띠 (튀어나오지 않게)
    const fringe = (drop = 0) => b.add(new THREE.SphereGeometry(0.27, 18, 10, 0, TAU, 0, Math.PI * 0.55), color, head, {
      ...at(0, 0.11 - drop, 0.035), sx: 1.0 * kx, sy: 0.55, sz: 0.98 * kz, rx: 0.15,
    });

    switch (style) {
      case 'buzz':
        cap(1.02, 0.5);
        break;
      case 'spiky': {
        cap(1.04, 0.52);
        const dirs = [[0, 1, 0.1], [0.45, 0.85, 0], [-0.45, 0.85, 0], [0.25, 0.8, 0.5], [-0.25, 0.8, 0.5], [0, 0.75, -0.6], [0.4, 0.7, -0.45], [-0.4, 0.7, -0.45]];
        for (const [dx, dy, dz] of dirs) {
          const d = new THREE.Vector3(dx, dy, dz).normalize();
          const q = new THREE.Quaternion().setFromUnitVectors(UP, d);
          b.add(new THREE.ConeGeometry(0.075, 0.15, 7), color, head, { ...at(d.x * R * 1.05, d.y * R * 1.05, d.z * R * 1.05), quat: q });
        }
        break;
      }
      case 'long':
        // 등 중간까지 내려오는 긴 머리
        cap(1.05, 0.58);
        fringe();
        b.add(new THREE.CapsuleGeometry(0.21, 0.52, 6, 14), color, head, { ...at(0, -0.34, -0.16), sx: 1.38, sz: 0.52 });
        for (const side of [-1, 1]) b.add(new THREE.CapsuleGeometry(0.06, 0.34, 4, 10), color, head, { ...at(side * 0.255, -0.2, 0.0) });
        break;
      case 'ponytail':
        cap(1.05, 0.55);
        fringe();
        b.add(new THREE.SphereGeometry(0.07, 10, 8), color, head, at(0, 0.1, -0.3));
        b.add(new THREE.CapsuleGeometry(0.07, 0.22, 4, 12), color, head, { ...at(0, -0.12, -0.35), rx: 0.3 });
        break;
      case 'pigtails':
        cap(1.05, 0.55);
        fringe();
        for (const side of [-1, 1]) {
          b.add(new THREE.SphereGeometry(0.075, 10, 8), color, head, at(side * 0.27, 0.02, -0.06));
          b.add(new THREE.CapsuleGeometry(0.065, 0.2, 4, 10), color, head, { ...at(side * 0.34, -0.16, -0.06), rz: side * 0.25 });
        }
        break;
      case 'bun':
        cap(1.05, 0.55);
        fringe();
        b.add(new THREE.SphereGeometry(0.115, 14, 12), color, head, at(0, 0.29, -0.08));
        break;
      case 'bowl':
        // 바가지머리: 눈썹 위에서 수평으로 똑 자른 헬멧 모양
        b.add(new THREE.SphereGeometry(R * 1.1, 24, 14, 0, TAU, 0, Math.PI * 0.45), color, head, { y: c, sx: kx * 1.03, sy: ky, sz: kz * 1.02 });
        b.add(new THREE.CylinderGeometry(R * 1.105 * kx, R * 1.105 * kx, 0.03, 24, 1, true), color, head, { y: c + 0.05, sz: kz * 1.02 / kx });
        break;
      case 'heihachi':
        // 헤이하치컷: 정수리는 맨머리, 양옆이 위로 솟은 뿔 모양
        b.add(new THREE.SphereGeometry(R * 1.02, 18, 8, 0, TAU, Math.PI * 0.42, Math.PI * 0.2), color, head, { y: c, sx: kx, sy: ky, sz: kz });
        for (const side of [-1, 1]) {
          b.add(new THREE.ConeGeometry(0.1, 0.32, 10), color, head, { ...at(side * 0.3, 0.17, -0.02), rz: -side * 0.75, sz: 0.65 });
          b.add(new THREE.ConeGeometry(0.075, 0.24, 10), color, head, { ...at(side * 0.27, 0.07, -0.1), rz: -side * 1.05, sz: 0.6 });
        }
        void skin;
        break;
      case 'mohawk':
        // 모히칸: 가운데만 볏처럼
        b.add(new THREE.SphereGeometry(0.2, 18, 12), color, head, { ...at(0, 0.27, -0.02), sx: 0.24, sy: 0.85, sz: 1.3 });
        b.add(new THREE.SphereGeometry(R * 1.01, 18, 10, 0, TAU, 0, Math.PI * 0.5), color, head, { y: c, rx: -0.3, sx: 0.32 * kx, sy: ky, sz: kz });
        break;
      case 'afro':
        // 아프로: 크고 동그란 머리 (얼굴은 가리지 않게 뒤쪽으로)
        b.add(new THREE.SphereGeometry(0.39, 22, 16), color, head, { ...at(0, 0.15, -0.12), sx: 1.12, sy: 0.98, sz: 1.0 });
        break;
      case 'topknot':
        // 상투: 단정한 머리 + 정수리에 작은 상투
        cap(1.03, 0.52);
        b.add(new THREE.SphereGeometry(0.075, 12, 10), color, head, { ...at(0, 0.33, -0.02), sy: 1.25 });
        b.add(new THREE.CylinderGeometry(0.05, 0.06, 0.04, 12), '#e8505b', head, at(0, 0.29, -0.02));
        break;
      case 'short':
      default:
        cap(1.05, 0.55);
        fringe();
        break;
    }
  }

  _addHeadAcc(b, head, a, C, F, c, fz) {
    const [kx, ky, kz] = F.hair;
    const acc = a.acc || {};
    if (acc.hat === 'cap') {
      b.add(new THREE.SphereGeometry(HEAD_R * 1.1, 22, 12, 0, TAU, 0, Math.PI * 0.44), '#3d7dd8', head, { y: c + 0.02, sx: kx, sy: ky, sz: kz });
      b.add(new THREE.CylinderGeometry(0.17, 0.17, 0.018, 18), '#3d7dd8', head, { y: c + 0.1, z: 0.25 * kz, sz: 0.85, rx: 0.12 });
    } else if (acc.hat === 'beanie') {
      b.add(new THREE.SphereGeometry(HEAD_R * 1.1, 22, 12, 0, TAU, 0, Math.PI * 0.5), '#e8505b', head, { y: c + 0.02, sx: kx, sy: ky * 1.05, sz: kz });
      b.add(new THREE.SphereGeometry(0.06, 10, 8), '#ffffff', head, { y: c + 0.36 * ky });
    } else if (acc.hat === 'headband') {
      b.add(new THREE.TorusGeometry(HEAD_R * 1.02, 0.022, 6, 28), '#f6d55c', head, { y: c + 0.1, rx: Math.PI / 2 - 0.35, sx: kx, sy: kz });
    }
    if (acc.eyes === 'round_glasses' || acc.eyes === 'sunglasses') {
      const sun = acc.eyes === 'sunglasses';
      for (const side of [-1, 1]) {
        if (sun) b.add(new THREE.SphereGeometry(0.06, 12, 8), '#1d1d22', head, { x: side * 0.105, y: c, z: fz + 0.025, sx: 1.15, sy: 0.85, sz: 0.25 });
        b.add(new THREE.TorusGeometry(0.058, 0.008, 4, 16), sun ? '#1d1d22' : '#3a3f4b', head, { x: side * 0.105, y: c, z: fz + 0.03 });
      }
      b.add(new THREE.CapsuleGeometry(0.007, 0.05, 2, 4), '#3a3f4b', head, { y: c + 0.01, z: fz + 0.035, rz: Math.PI / 2 });
    }
  }

  _placeLabels() {
    const top = (this.height || 1.5) + 0.28;
    if (this.nameTag) this.nameTag.position.y = top;
    if (this.bubble) this.bubble.position.y = top + 0.22;
  }
}

/** 미리보기·화면 표시용: 외형에 들어 있는 악세사리는 그대로 보여 줌 (보유 여부 검증은 서버가 함) */
function allAccIds(appearance) {
  const acc = appearance?.acc;
  return acc && typeof acc === 'object' ? Object.values(acc).filter((v) => typeof v === 'string') : [];
}

function wrapText(text, maxChars, maxLines) {
  const words = text.split(' ');
  const lines = [];
  let cur = '';
  const push = () => { if (cur) lines.push(cur); cur = ''; };
  for (const w of words) {
    let word = w;
    while (word.length > maxChars) {
      push();
      lines.push(word.slice(0, maxChars));
      word = word.slice(maxChars);
    }
    if ((cur ? `${cur} ${word}` : word).length > maxChars) push();
    cur = cur ? `${cur} ${word}` : word;
  }
  push();
  if (lines.length > maxLines) {
    const cut = lines.slice(0, maxLines);
    cut[maxLines - 1] = `${cut[maxLines - 1].slice(0, maxChars - 1)}…`;
    return cut;
  }
  return lines.length ? lines : [''];
}

// 기절 별 (모든 캐릭터가 텍스처·재질 공유)
let starMaterial = null;
function makeDizzyStars() {
  if (!starMaterial) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#ffd84a';
    ctx.strokeStyle = '#b8860b';
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const rr = i % 2 === 0 ? 28 : 12;
      const ang = -Math.PI / 2 + (i * Math.PI) / 5;
      ctx.lineTo(32 + Math.cos(ang) * rr, 32 + Math.sin(ang) * rr);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    starMaterial = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
  }
  const g = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const sp = new THREE.Sprite(starMaterial);
    const ang = (i / 3) * Math.PI * 2;
    sp.position.set(Math.cos(ang) * 0.28, 0, Math.sin(ang) * 0.28);
    sp.scale.setScalar(0.2);
    g.add(sp);
  }
  return g;
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
