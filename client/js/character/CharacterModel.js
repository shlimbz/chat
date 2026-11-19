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
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { normalizeForMerge } from '../core/geometryUtils.js';
import {
  buildShell, facePlacement, hairline, headHalfWidth, surfaceDist, outsideFace,
} from './headShape.js';
import {
  addHat, addEyewear, addEarItem, addNeckItem, addPrint, addBackItem, shoeOverride, addShoeExtras, hatFlattensHair,
} from './accessoryParts.js';
import { CosmeticFx } from './CosmeticFx.js';
import * as G from './prim.js';
import {
  makeTorsoShape, torsoPart, tubePart, hemRadius, vertexNormals,
} from './bodyMesh.js';
import {
  DEFAULT_APPEARANCE, DEFAULT_BODY_STATS, findOutfit, sanitizeAppearance, sanitizeBodyStats,
} from '../shared/appearance.js';

const TAU = Math.PI * 2;

/** 색을 밝게(+)/어둡게(-) */
function shade(hex, amt) {
  const n = Number.parseInt(String(hex).replace('#', ''), 16) || 0;
  const f = (v) => Math.round(amt < 0 ? v * (1 + amt) : v + (255 - v) * amt);
  const r = f((n >> 16) & 255);
  const g2 = f((n >> 8) & 255);
  const bl = f(n & 255);
  return `#${((r << 16) | (g2 << 8) | bl).toString(16).padStart(6, '0')}`;
}
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

const FACE_KINDS = ['round', 'oval', 'square', 'vline'];

/** headShape.js 가 만든 껍질 데이터 → BufferGeometry (부드러운 법선) */
function shellGeometry(data) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
  g.setIndex(new THREE.BufferAttribute(data.indices, 1));
  g.computeVertexNormals();
  if (globalThis.__RECORD_PARTS) g.__raw = { p: Array.from(data.positions), i: Array.from(data.indices) };
  return g;
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
        type: geo.type || geo.constructor.name, params: geo.parameters || geo.__args, raw: geo.__raw, color, tag: this.tag || null, bone: bone.name, t: { ...t, quat: t.quat ? t.quat.toArray?.() : undefined },
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

  /**
   * 여러 관절에 나눠 붙는 매끈한 파츠 (bodyMesh.js 결과)
   * @param {{pos:number[], idx:number[], wts:{a:string,b:string,w:number}[], tcol:string[]}} part 골반 기준 좌표
   * @param {number} yOffset 골반 높이 (모델 좌표로 옮김)
   */
  addSkinned(part, yOffset) {
    const byName = this.boneByName;
    const nor = vertexNormals(part.pos, part.idx);
    const n = part.idx.length;
    const P = new Float32Array(n * 3);
    const N = new Float32Array(n * 3);
    const Cc = new Float32Array(n * 3);
    const SI = new Uint16Array(n * 4);
    const SW = new Float32Array(n * 4);
    const col = new THREE.Color();
    for (let k = 0; k < n; k++) {
      const v = part.idx[k];
      P[k * 3] = part.pos[v * 3];
      P[k * 3 + 1] = part.pos[v * 3 + 1] + yOffset;
      P[k * 3 + 2] = part.pos[v * 3 + 2];
      N[k * 3] = nor[v * 3]; N[k * 3 + 1] = nor[v * 3 + 1]; N[k * 3 + 2] = nor[v * 3 + 2];
      if (k % 3 === 0) col.set(part.tcol[k / 3]);
      Cc[k * 3] = col.r; Cc[k * 3 + 1] = col.g; Cc[k * 3 + 2] = col.b;
      const w = part.wts[v];
      SI[k * 4] = byName[w.a].userData.index;
      SI[k * 4 + 1] = byName[w.b].userData.index;
      SW[k * 4] = 1 - w.w;
      SW[k * 4 + 1] = w.w;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(P, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(N, 3));
    g.setAttribute('color', new THREE.BufferAttribute(Cc, 3));
    g.setAttribute('skinIndex', new THREE.BufferAttribute(SI, 4));
    g.setAttribute('skinWeight', new THREE.BufferAttribute(SW, 4));
    this.list.push(g);
    if (this.debug) {
      this.debug.push({
        type: 'Skinned', color: '#000000', bone: 'root',
        skin: {
          p: Array.from(P), tc: part.tcol, si: Array.from(SI), sw: Array.from(SW),
        },
        t: {},
      });
    }
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
    this.fx?.update(dt, speed > 0.6 || airborne, this.fxPreview === true);

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

  /** 트레일/오라: 아이템이 바뀔 때만 다시 만듦 */
  _syncFx() {
    const acc = this.appearance.acc || {};
    const key = `${acc.trail || ''}|${acc.aura || ''}`;
    if (this.fx?.key === key) return;
    this.fx?.dispose();
    this.fx = acc.trail || acc.aura ? new CosmeticFx(acc.trail, acc.aura, this.root) : null;
    if (this.fx && this._fxEnabled === false) this.fx.setEnabled(false);
  }

  /** 저사양 설정: 다른 사람의 트레일/오라 끄기 */
  setFxEnabled(v) {
    this._fxEnabled = v;
    this.fx?.setEnabled(v);
  }

  dispose() {
    this.fx?.dispose();
    this.fx = null;
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
    const armOut = mix((this.armOut0 ?? 0.28) - 0.06 * m + Math.sin(this.time * 1.8) * 0.02 * (1 - m), 2.2);
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
      // 팔을 몸 쪽으로 내리는 자세라도 몸통을 파고들지 않을 만큼은 벌림
      const minOut = (this.armOut0 ?? 0) * Math.max(0, 1 - Math.abs(x) / 1.3);
      a.rotation.z = lerp(a.rotation.z, side * Math.max(z, minOut), w);
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
      brow: '#51392f',
      gold: '#e8b923',
    };

    // 체형 수치 (성별 + 근육량 + 몸무게) — 동물의숲처럼 둥글고 귀여운 범위 안에서 변화
    const heightScale = (female ? 0.96 : 1) * (0.94 + a.height * 0.12);
    // 근육량: 어깨·팔이 굵어지고 위가 넓은 실루엣 / 몸무게: 배·허리·허벅지·볼살이 둥글게
    const sw = (female ? 0.92 : 1.0) * (0.88 + mus * 0.34 + wt * 0.08 + st.shoulders * 0.08 + st.back * 0.06);
    const hw = (female ? 1.04 : 0.96) * (0.9 + wt * 0.34);
    const limb = 0.9 + wt * 0.26 + mus * 0.1;
    const armR0 = 0.045 * limb * (1 + mus * 0.5 + st.arms * 0.25);
    const legR0 = 0.064 * limb * (1 + wt * 0.2 + mus * 0.15 + st.legs * 0.2);
    const girthX = sw * (1 + wt * 0.2);
    const girthZ = 0.78 + wt * 0.42 + mus * 0.08;
    const waist = 1 - mus * 0.12 + wt * 0.08; // 아래쪽(골반) 폭 배율
    const cheek = 1 + wt * 0.14;
    const belly = Math.max(0, wt - 0.25) / 0.75;
    const bust = female ? 0.55 + wt * 0.25 : 0;
    const pecs = female ? 0 : Math.min(1.3, Math.max(0, mus - 0.3) / 0.7 + st.chest * 0.5);

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
    // 어깨 위치는 몸통 폭에 맞춤 (몸통이 넓어지면 팔도 바깥으로)
    const shapeEarly = makeTorsoShape({ girthX, girthZ, waist, belly, bust, pecs });
    let torsoMaxX = 0;
    for (let y = 0.05; y <= SHOULDER_Y; y += 0.01) torsoMaxX = Math.max(torsoMaxX, shapeEarly.rx(y));
    const shoulderX = torsoMaxX + armR0 * 1.1; // 어깨 공이 몸통 옆면에 딱 붙는 위치
    const armL = bone('armL', torso, -shoulderX, SHOULDER_Y, 0);
    const elbowL = bone('elbowL', armL, 0, -UPPER_ARM, 0);
    const armR = bone('armR', torso, shoulderX, SHOULDER_Y, 0);
    const elbowR = bone('elbowR', armR, 0, -UPPER_ARM, 0);
    root.updateMatrixWorld(true);

    const debug = typeof globalThis !== 'undefined' && globalThis.__RECORD_PARTS;
    const b = new SkinBuilder(debug);
    b.boneByName = Object.fromEntries(bones.map((x) => [x.name, x]));

    // ── 몸통: 표면 하나 (상의/하의는 색 영역) → 배·가슴이 옷을 뚫고 나올 수 없음 ──
    const shape = makeTorsoShape({
      girthX, girthZ, waist, belly, bust, pecs,
    });
    const WAIST_Y = 0.13;
    b.addSkinned(torsoPart(shape, {
      waistY: WAIST_Y,
      top: C.top,
      bottom: C.bottom,
      hem: shade(C.top, -0.12), // 상의 밑단
      collarY: a.outfit === 'tracksuit' ? 0.445 : null,
      collar: C.white,
    }), HIP_Y);
    if (O.hood) {
      const [hx, hy, hz] = shape.outside(0.42, Math.PI, 0.035);
      b.add(G.sphere(0.15, 14, 10), C.top, chest, { x: hx, y: hy, z: hz, sx: 1.3, sy: 0.55, sz: 0.55 });
    }

    // ── 다리: 허벅지~발목 관 하나, 무릎에서 부드럽게 굽음. 반바지는 같은 관의 색 + 바짓단 ──
    for (const [leg, knee, side] of [[legL, kneeL, -1], [legR, kneeR, 1]]) {
      const len = THIGH + 0.14;
      const base = (sv) => legR0 * (1 - 0.18 * (sv / len));
      const shortsEdge = 0.11;
      b.addSkinned(tubePart({
        pivot: [side * legX, -0.01, 0],
        len,
        joint: THIGH,
        bones: [leg.name, knee.name],
        radius: O.longPants ? (sv) => base(sv) * 1.06 : hemRadius(base, shortsEdge, 1.16),
        paint: (sv) => (O.longPants || sv < shortsEdge ? C.bottom : C.skin),
      }), HIP_Y);
      this._addShoe(b, knee, a.shoes, C, legR0, shoeOverride(a.acc.feet));
    }

    // 팔을 내렸을 때 몸통을 파고들지 않는 최소 벌림 각도 (체형마다 계산)
    {
      const armR = (d) => armR0 * 1.18 * (1 + (mus * 0.16 + st.arms * 0.1));
      const handR = 0.062 * limb;
      let need = 0;
      for (let th = 0; th <= 1.0; th += 0.01) {
        let ok = true;
        // 어깨 관절 근처(d<0.09)는 원래 몸통과 맞닿는 부분이라 제외, 그 아래 팔·손이 몸에 묻히지 않게
        for (let d = 0.06; d <= UPPER_ARM + 0.155; d += 0.01) {
          const y = SHOULDER_Y - d * Math.cos(th);
          const x = shoulderX + d * Math.sin(th);
          const r = d > UPPER_ARM + 0.12 ? handR : armR(d);
          if (x - r < shape.rx(y) + 0.006) { ok = false; break; }
        }
        need = th;
        if (ok) break;
      }
      this.armOut0 = need + 0.06; // 걷기 흔들림(-0.06)까지 고려
    }

    // ── 팔: 어깨~손목 관 하나 + 동그란 손. 소매는 같은 관의 색 + 소매단 ──
    for (const [arm, elbow, side] of [[armL, elbowL, -1], [armR, elbowR, 1]]) {
      const len = UPPER_ARM + 0.135;
      const bicep = mus * 0.16 + st.arms * 0.1;
      const base = (sv) => armR0 * (1 - 0.14 * (sv / len)) * (1 + bicep * Math.exp(-(((sv - 0.065) / 0.035) ** 2)));
      const sleeveEdge = 0.07;
      let radius = base;
      let paint = () => C.skin;
      if (O.longSleeve) {
        radius = (sv) => base(sv) * 1.07;
        paint = (sv) => (a.outfit === 'tracksuit' && sv > len - 0.03 ? C.white : C.top);
      } else if (!O.sleeveless) {
        radius = hemRadius(base, sleeveEdge, 1.16);
        paint = (sv) => (sv < sleeveEdge ? C.top : C.skin);
      }
      b.addSkinned(tubePart({
        pivot: [side * shoulderX, SHOULDER_Y, 0], len, joint: UPPER_ARM, bones: [arm.name, elbow.name], radius, paint,
      }), HIP_Y);
      b.add(G.sphere(0.062 * limb, 14, 10), C.skin, elbow, { y: -0.155 }); // 동그란 손
    }

    // ── 치장 아이템 (몸) ──
    if (a.acc.print) addPrint(a.acc.print, { b, chest, shape, topColor: C.top, sw });
    if (a.acc.neck) addNeckItem(a.acc.neck, { b, chest, shape });
    if (a.acc.back) addBackItem(a.acc.back, { b, chest, shape, sw });

    // ── 머리 ──
    // 긴 머리가 몸통을 뚫지 않도록 등 표면 위치를 알려줌
    let backZ = 0;
    for (let y = 0.05; y <= 0.46; y += 0.03) backZ = Math.min(backZ, shape.point(y, Math.PI)[1]);
    this._addHead(b, head, a, C, female, cheek, { backZ, hasBackItem: !!a.acc.back });

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
    const hairExtra = !a.acc.hat && (a.hair === 'afro' || a.hair === 'topknot' || a.hair === 'mohawk') ? 0.12 : 0;
    const hatExtra = {
      party_hat: 0.28, bunny_ears: 0.24, halo: 0.2, cowboy: 0.16, crown: 0.14, cat_ears: 0.07,
    }[a.acc.hat] || 0;
    this.height = (HIP_Y + NECK_Y + HEAD_C + HEAD_R + Math.max(hairExtra, hatExtra)) * heightScale;
    this.blob.scale.setScalar(heightScale * (0.85 + wt * 0.25) * sw);
    if (prevExercise) { this.exercise = null; this.setExercise(prevExercise); }
    this._syncFx();
    this._placeLabels();
    this.update(0, 0);
  }

  _addShoe(b, knee, baseStyle, C0, legR0, over = null) {
    const y = -0.175;
    const w = Math.max(1, legR0 / 0.08);
    // 신발 아이템을 신으면 기본 신발 대신 아이템 모양/색
    const C = over ? { ...C0, shoe: over.color, sole: over.sole } : C0;
    const style = over ? ({ bunny: 'sneakers', rocket: 'sneakers' }[over.style] || over.style) : baseStyle;
    addShoeExtras(over, b, knee, y, w);
    if (style === 'slides') {
      b.add(G.sphere(0.085, 14, 10), C.skin, knee, { y, z: 0.03, sx: w, sy: 0.6, sz: 1.3 });
      b.add(G.sphere(0.095, 14, 8), C.shoe, knee, { y: y + 0.005, z: 0.05, sx: 1.08 * w, sy: 0.5, sz: 0.72 });
      b.add(G.cylinder(0.095, 0.095, 0.022, 16), C.sole, knee, { y: y - 0.05, z: 0.03, sx: 1.05 * w, sz: 1.4 });
      return;
    }
    // 둥글고 짧은 신발
    b.add(G.sphere(0.1, 16, 12), C.shoe, knee, { y, z: 0.03, sx: 1.02 * w, sy: 0.66, sz: 1.28 });
    b.add(G.cylinder(0.098, 0.098, 0.022, 16), C.sole, knee, { y: y - 0.054, z: 0.03, sx: 1.03 * w, sz: 1.3 });
    if (style === 'hightop') b.add(G.cylinder(0.092, 0.098, 0.1, 14), C.shoe, knee, { y: y + 0.055, sx: w, sz: w });
  }

  _addHead(b, head, a, C, female, cheek, body = { backZ: -0.2, hasBackItem: false }) {
    const c = HEAD_C;
    const face = FACE_KINDS.includes(a.face) ? a.face : 'round';
    const hw = headHalfWidth(face, cheek);
    const wr = Math.sqrt(hw / HEAD_R); // 얼굴 폭에 맞춰 눈 간격을 조금만 조정
    const H = {
      face, cheek, c, hw, backZ: body.backZ, hasBackItem: body.hasBackItem,
    };
    // 얼굴 표면 위 (x, y) 에 파츠를 붙임: 위치 + 표면 기울기 + 파츠 자체 회전(rz)
    const onFace = (x, y, lift, t = {}) => {
      const p = facePlacement(face, cheek, x, y, lift);
      return {
        ...t, x: p.x, y: c + p.y, z: p.z, rx: p.rx + (t.rx || 0), ry: p.ry + (t.ry || 0),
      };
    };

    // 머리 (헤어·모자와 같은 표면 정의를 사용)
    b.add(shellGeometry(buildShell(face, cheek, { scale: 1, seg: 18 })), C.skin, head, { y: c });

    // 귀: 머리 옆면에 반쯤 묻히게
    for (const side of [-1, 1]) {
      b.add(G.sphere(0.048, 10, 8), C.skin, head, {
        x: side * (hw - 0.004), y: c - 0.015, z: -0.01, sx: 0.55, sy: 1, sz: 0.8,
      });
    }
    if (a.acc.ears) addEarItem(a.acc.ears, { b, head, H });

    b.tag = 'face'; // (개발용 검사 도구 표시) 여기부터 이목구비
    // ── 눈 (동물의숲 느낌: 크고 동글, 하이라이트) ──
    const eyeY = 0.0;
    const eyeX = 0.105 * wr;
    const eyeStyle = a.eyes || 'round';
    const iris = a.eyeColor || C.eye;
    const darkIris = iris === C.eye;
    const arcEye = (x) => b.add(G.torus(0.032, 0.0085, 4, 14, Math.PI), C.eye, head, onFace(x, eyeY - 0.012, 0.002, { sz: 0.6 }));
    const roundEye = (x, side, { w = 0.9, h = 1.15, r = 0.044, hl = 1, tilt = 0 } = {}) => {
      b.add(G.sphere(r, 14, 10), C.eye, head, onFace(x, eyeY, 0.002, { sx: w, sy: h, sz: 0.38, rz: tilt }));
      if (!darkIris) b.add(G.sphere(r * 0.72, 12, 8), iris, head, onFace(x, eyeY - r * 0.18, 0.006, { sx: w, sy: h * 0.9, sz: 0.3, rz: tilt }));
      if (hl > 0) {
        b.add(G.sphere(0.013 * hl, 8, 6), C.white, head, onFace(x + 0.013, eyeY + 0.018, 0.016, { sz: 0.5 }));
        if (hl > 1) b.add(G.sphere(0.0075, 6, 5), C.white, head, onFace(x - 0.012, eyeY - 0.018, 0.016, { sz: 0.5 }));
      }
      void side;
    };
    for (const side of [-1, 1]) {
      const x = side * eyeX;
      switch (eyeStyle) {
        case 'smile': arcEye(x); break;
        case 'wink': if (side > 0) arcEye(x); else roundEye(x, side); break;
        case 'dot':
          b.add(G.sphere(0.024, 10, 8), C.eye, head, onFace(x, eyeY, 0.002, { sy: 1.15, sz: 0.4 }));
          b.add(G.sphere(0.007, 6, 5), C.white, head, onFace(x + 0.007, eyeY + 0.01, 0.01, { sz: 0.5 }));
          break;
        case 'sleepy':
          b.add(G.sphere(0.042, 12, 8, 0, TAU, Math.PI / 2, Math.PI / 2), C.eye, head, onFace(x, eyeY + 0.004, 0.002, { sx: 0.95, sy: 0.9, sz: 0.38 }));
          b.add(G.capsule(0.0065, 0.07, 2, 6), C.eye, head, onFace(x, eyeY + 0.004, 0.008, { rz: Math.PI / 2, sz: 0.6 }));
          break;
        case 'sharp': roundEye(x, side, { w: 1.15, h: 0.85, tilt: side * -0.2, hl: 0.8 }); break;
        case 'oval': roundEye(x, side, { w: 0.82, h: 1.35 }); break;
        case 'sparkle': roundEye(x, side, { r: 0.048, hl: 1.35 }); break;
        case 'lash':
          roundEye(x, side);
          for (const k of [0, 1, 2]) {
            b.add(G.capsule(0.005, 0.024, 2, 5), C.eye, head, onFace(x + side * (0.03 + k * 0.006), eyeY + 0.038 - k * 0.014, 0.004, { rz: side * (-0.5 - k * 0.35), sz: 0.6 }));
          }
          break;
        case 'round':
        default:
          roundEye(x, side);
          if (female) b.add(G.capsule(0.0055, 0.028, 2, 5), C.eye, head, onFace(x + side * 0.036, eyeY + 0.034, 0.004, { rz: side * -0.6, sz: 0.6 }));
          break;
      }
      // 볼
      const cx = side * 0.17 * wr;
      if (a.cheeks === 'freckles') {
        for (const [dx, dy] of [[-0.018, 0.006], [0.0, -0.01], [0.018, 0.004]]) {
          b.add(G.sphere(0.0065, 6, 5), '#b7774f', head, onFace(cx + side * dx, -0.07 + dy, 0.001, { sz: 0.35 }));
        }
      } else if (a.cheeks !== 'none') {
        const rosy = a.cheeks === 'rosy';
        b.add(G.sphere(rosy ? 0.05 : 0.042, 12, 8), rosy ? '#ff7d95' : C.blush, head, onFace(cx, -0.072, 0.001, { sx: 1.2, sy: 0.65, sz: 0.15 }));
      }
    }

    // ── 눈썹 ──
    if (a.brows !== 'none') {
      const angled = a.brows === 'angled';
      for (const side of [-1, 1]) {
        const rz = Math.PI / 2 + (angled ? side * -0.3 : a.brows === 'straight' ? 0 : side * -0.1);
        b.add(G.capsule(angled ? 0.011 : 0.008, angled ? 0.05 : 0.045, 3, 8), C.brow, head, onFace(side * eyeX, 0.088, 0.004, { rz, sz: 0.55 }));
      }
    }

    // ── 코 ──
    const noseY = -0.045;
    if (a.nose === 'dot') {
      b.add(G.sphere(0.011, 8, 6), C.mouth, head, onFace(0, noseY, 0.002, { sz: 0.5 }));
    } else if (a.nose === 'round') {
      b.add(G.sphere(0.026, 10, 8), C.skin, head, onFace(0, noseY, 0.004, { sx: 1.05, sy: 0.8, sz: 0.7 }));
    } else if (a.nose !== 'none') {
      b.add(G.sphere(0.019, 10, 8), C.skin, head, onFace(0, noseY, 0.004, { sy: 0.75, sz: 0.75 }));
    }

    // ── 입 ──
    const mY = -0.112;
    switch (a.mouth || 'smile') {
      case 'small':
        b.add(G.capsule(0.006, 0.026, 2, 6), C.mouth, head, onFace(0, mY, 0.002, { rz: Math.PI / 2, sz: 0.6 }));
        break;
      case 'open':
        b.add(G.sphere(0.028, 10, 8), C.mouth, head, onFace(0, mY - 0.004, 0.001, { sx: 0.85, sy: 0.95, sz: 0.3 }));
        b.add(G.sphere(0.012, 7, 5), '#f08b9e', head, onFace(0, mY - 0.016, 0.006, { sx: 1.1, sy: 0.6, sz: 0.3 }));
        break;
      case 'cat':
        for (const side of [-1, 1]) {
          b.add(G.torus(0.014, 0.006, 4, 10, Math.PI), C.mouth, head, onFace(side * 0.014, mY + 0.004, 0.002, { rz: Math.PI, sz: 0.6 }));
        }
        break;
      case 'grin':
        b.add(G.sphere(0.04, 12, 8, 0, TAU, Math.PI / 2, Math.PI / 2), C.mouth, head, onFace(0, mY + 0.012, 0.001, { sx: 1, sy: 0.75, sz: 0.3 }));
        b.add(G.box(0.044, 0.01, 0.004), C.white, head, onFace(0, mY + 0.006, 0.009));
        break;
      case 'neutral':
        b.add(G.capsule(0.0055, 0.036, 2, 6), C.mouth, head, onFace(0, mY, 0.002, { rz: Math.PI / 2, sz: 0.6 }));
        break;
      case 'smile':
      default:
        b.add(G.torus(0.026, 0.007, 4, 12, Math.PI), C.mouth, head, onFace(0, mY + 0.006, 0.002, { rz: Math.PI, sz: 0.6 }));
        break;
    }

    b.tag = null;
    // ── 헤어 + 모자/안경 ──
    // 위로 솟는 머리(모히칸·아프로 등)는 모자를 쓰면 모자 밑으로 눌린 짧은 머리로 표시
    const tall = ['mohawk', 'afro', 'topknot', 'bun', 'spiky', 'heihachi'];
    const hair = hatFlattensHair(a.acc?.hat) && tall.includes(a.hair) ? 'buzz' : a.hair;
    this._addHair(b, head, hair, C.hair, H);
    this._addHeadAcc(b, head, a, H, onFace, eyeX);
  }

  /**
   * 헤어스타일. 모든 머리카락은 "머리 표면을 바깥으로 부풀린 껍질" 이므로
   * 얼굴형·볼살이 바뀌어도 머리가 머리카락을 뚫고 나오지 않습니다.
   * 헤어라인(앞 F · 옆 S · 뒤 B)은 눈썹 위·귀 위에서 끝나 얼굴을 가리지 않습니다.
   */
  _addHair(b, head, style, color, H) {
    const { face, cheek, c, hw } = H;
    // 모든 머리카락은 얼굴 보호 구역(outsideFace)을 침범하지 않음 → 눈썹·눈이 가려지지 않음
    const shell = (keep, scale, seg = 22) => b.add(shellGeometry(buildShell(face, cheek, { keep: (n, p) => keep(n, p) && outsideFace(n, p), scale, seg })), color, head, { y: c });
    const cap = (scale = 1.06, F = 0.45, S = 0.2, B = -0.55) => shell((n) => n[1] > hairline(n, F, S, B), scale);
    // 앞머리: 이마 앞쪽만 조금 더 두껍게 (눈썹보다 위에서 끝남)
    const fringe = (scale = 1.095, low = 0.37) => shell((n) => n[2] > 0.3 && n[1] > low && n[1] < 0.8, scale, 26);
    // 표면 위 한 점 (방향 d, 배율 s) — 묶음머리/뿔 같은 덩어리 위치에 사용
    const at = (dx, dy, dz, s = 1, out = 0) => {
      const l = Math.hypot(dx, dy, dz);
      const nx = dx / l;
      const ny = dy / l;
      const nz = dz / l;
      const d = surfaceDist(face, cheek, nx, ny, nz) * s + out;
      return { x: nx * d, y: c + ny * d, z: nz * d };
    };
    const wx = hw / HEAD_R; // 볼살·얼굴형에 따른 가로 배율

    switch (style) {
      case 'buzz':
        cap(1.03, 0.52, 0.24, -0.5);
        break;
      case 'spiky': {
        cap(1.04, 0.5, 0.22, -0.5);
        const dirs = [[0, 1, 0.1], [0.45, 0.85, 0], [-0.45, 0.85, 0], [0.25, 0.8, 0.5], [-0.25, 0.8, 0.5], [0, 0.75, -0.6], [0.4, 0.7, -0.45], [-0.4, 0.7, -0.45], [0, 0.9, 0.35]];
        for (const [dx, dy, dz] of dirs) {
          const v = new THREE.Vector3(dx, dy, dz).normalize();
          const q = new THREE.Quaternion().setFromUnitVectors(UP, v);
          b.add(G.cone(0.07, 0.16, 7), color, head, { ...at(dx, dy, dz, 1.0, 0.06), quat: q });
        }
        break;
      }
      case 'long':
        cap(1.065, 0.45, 0.08, -0.8);
        fringe();
        // 등까지 내려오는 뒷머리 + 얼굴 옆으로 흘러내리는 옆머리
        // 뒷머리는 항상 등 표면보다 뒤에 (체중이 늘어도 몸이 머리카락을 뚫지 않음)
        // 등 아이템(가방·날개 등)을 메면 어깨 길이로 짧게 묶음
        if (H.hasBackItem) {
          b.add(G.capsule(0.2, 0.12, 6, 14), color, head, { x: 0, y: c - 0.15, z: -0.12, sx: 1.3 * wx, sy: 0.7, sz: 0.62 });
        } else {
          b.add(G.capsule(0.2, 0.5, 6, 14), color, head, { x: 0, y: c - 0.3, z: Math.min(-0.17, H.backZ - 0.105), sx: 1.3 * wx, sz: 0.5 });
        }
        for (const side of [-1, 1]) {
          b.add(G.capsule(0.055, 0.2, 4, 10), color, head, { x: side * (hw - 0.01), y: c - 0.15, z: -0.02 });
        }
        break;
      case 'ponytail':
        cap(1.06, 0.45, 0.16, -0.6);
        fringe();
        b.add(G.sphere(0.065, 10, 8), color, head, at(0, 0.3, -1, 1.05, 0.02));
        b.add(G.capsule(0.06, 0.24, 4, 12), color, head, { ...at(0, -0.15, -1, 1.05, 0.07), rx: 0.3 });
        break;
      case 'pigtails':
        cap(1.06, 0.45, 0.16, -0.6);
        fringe();
        for (const side of [-1, 1]) {
          b.add(G.sphere(0.07, 10, 8), color, head, at(side, 0.15, -0.25, 1.05, 0.02));
          b.add(G.capsule(0.06, 0.2, 4, 10), color, head, { ...at(side, -0.35, -0.3, 1.05, 0.06), rz: side * 0.25 });
        }
        break;
      case 'bun':
        cap(1.06, 0.45, 0.16, -0.6);
        fringe();
        b.add(G.sphere(0.11, 14, 12), color, head, at(0, 1, -0.35, 1.04, 0.06));
        break;
      case 'bowl':
        // 바가지머리: 귀 윗선까지 둥글게 덮고 앞머리는 눈썹 위에서 일자로
        cap(1.1, 0.38, 0.06, -0.1);
        break;
      case 'heihachi': {
        // 정수리는 맨머리, 옆·뒤 띠 + 양옆으로 솟은 뿔
        shell((n) => n[1] < 0.5 && n[1] > hairline(n, 9, 0.02, -0.45), 1.045);
        for (const side of [-1, 1]) {
          b.add(G.cone(0.09, 0.3, 10), color, head, { ...at(side, 0.55, -0.1, 1, 0.07), rz: -side * 0.8, sz: 0.65 });
          b.add(G.cone(0.065, 0.22, 10), color, head, { ...at(side, 0.25, -0.3, 1, 0.05), rz: -side * 1.1, sz: 0.6 });
        }
        break;
      }
      case 'mohawk':
        // 가운데 줄만 남기고 볏처럼 세움
        shell((n) => Math.abs(n[0]) < 0.2 && n[1] > hairline(n, 0.48, 0.1, -0.5), 1.03);
        b.add(G.sphere(0.2, 18, 12), color, head, { ...at(0, 1, -0.15, 1, -0.02), sx: 0.22, sy: 0.75, sz: 1.3, rx: -0.15 });
        break;
      case 'afro':
        // 정수리·뒤로 부풀고, 이마 선(F)은 눈썹 위에서 끝남
        shell((n) => n[1] > hairline(n, 0.46, 0.06, -0.55),
          (n) => 1.1 + 0.45 * Math.min(1, Math.max(0, n[1] * 0.75 + 0.35 - Math.max(0, n[2]) * 0.55)), 24);
        break;
      case 'topknot':
        cap(1.05, 0.45, 0.18, -0.55);
        fringe();
        b.add(G.sphere(0.075, 12, 10), color, head, { ...at(0, 1, -0.1, 1.05, 0.06), sy: 1.25 });
        b.add(G.cylinder(0.05, 0.06, 0.04, 12), '#e8505b', head, at(0, 1, -0.1, 1.05, 0.012));
        break;
      case 'short':
      default:
        cap(1.06, 0.45, 0.2, -0.55);
        fringe();
        break;
    }
  }

  _addHeadAcc(b, head, a, H, onFace, eyeX) {
    const { face, cheek, c } = H;
    const acc = a.acc || {};
    const shell = (keep, scale, color, seg = 22) => b.add(shellGeometry(buildShell(face, cheek, { keep: (n, p) => keep(n, p) && outsideFace(n, p), scale, seg })), color, head, { y: c });
    const at = (dx, dy, dz, s = 1, out = 0) => {
      const l = Math.hypot(dx, dy, dz);
      const d = surfaceDist(face, cheek, dx / l, dy / l, dz / l) * s + out;
      return { x: (dx / l) * d, y: c + (dy / l) * d, z: (dz / l) * d };
    };
    const ctx = {
      b, head, H, shell, at, onFace, eyeX,
    };
    if (acc.hat) addHat(acc.hat, ctx);
    if (acc.eyes) addEyewear(acc.eyes, ctx);
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
