// 득근 타워 (점프맵) 3D 공간
// - 코스 데이터: shared/towerLayout.js (서버와 같은 파일)
// - 움직이는 발판 / 사라지는 매트 / 회전 바벨은 "서버 시각" 으로 계산 → 모든 사람 화면에서 같은 위치
// - 헬스장과 같은 장면(scene)의 먼 곳(x≈300)에 있고, 들어와 있을 때만 보이게 합니다.
import * as THREE from 'three';
import { CollisionWorld } from './CollisionWorld.js';
import { batchStatic } from './StaticBatcher.js';
import { m } from './equipment.js';
import { createPortal } from './portal.js';
import { Npc } from './Npc.js';
import {
  TOWER_ORIGIN, TOWER_BOUNDS, TOWER_ELEMENTS, TOWER_GOAL, TOWER_EXIT_PORTAL, TOWER_TOP_PORTAL,
  TOWER_NPC, STAGE_NAMES, BAR, TOWER_HALF, moveOffset, fadeState, spinAngle, hitsSpinBar, onKillStrip,
} from '../shared/towerLayout.js';

const OX = TOWER_ORIGIN.x;
const OZ = TOWER_ORIGIN.z;

function shade(hex, k) {
  const c = new THREE.Color(hex);
  c.r = Math.min(1, c.r * k); c.g = Math.min(1, c.g * k); c.b = Math.min(1, c.b * k);
  return `#${c.getHexString()}`;
}

function textSprite(lines, { bg = 'rgba(30,36,48,0.85)', fg = '#ffffff', w = 3.4, sub = '#ffd84a' } = {}) {
  const c = document.createElement('canvas');
  c.width = 768;
  c.height = 224;
  const g = c.getContext('2d');
  g.fillStyle = bg;
  g.beginPath();
  g.roundRect(8, 8, 752, 208, 40);
  g.fill();
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = sub;
  g.font = 'bold 64px "Arial Black", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
  g.fillText(lines[0], 384, 72, 720);
  if (lines[1]) {
    g.fillStyle = fg;
    g.font = 'bold 58px "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
    g.fillText(lines[1], 384, 156, 720);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  sp.scale.set(w, w * (224 / 768), 1);
  sp.userData.noBatch = true;
  return sp;
}

/** 하늘 배경 (그라데이션 텍스처 1장) */
function skyTexture() {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#7cc6ff');
  grad.addColorStop(0.6, '#bfe6ff');
  grad.addColorStop(1, '#fff2d9');
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class Tower {
  constructor(scene) {
    this.root = new THREE.Group();
    this.root.name = 'Tower';
    this.root.visible = false;
    scene.add(this.root);
    this.sky = skyTexture();
    this.collision = new CollisionWorld({
      minX: TOWER_BOUNDS.minX, maxX: TOWER_BOUNDS.maxX, minZ: TOWER_BOUNDS.minZ, maxZ: TOWER_BOUNDS.maxZ,
    });
    this.interactables = [];
    this.moving = []; // { el, obj, box, lastDx, lastDz }
    this.fading = []; // { el, obj, mat, box }
    this.spinners = []; // { el, bar }
    this.kills = TOWER_ELEMENTS.filter((e) => e.kind === 'kill');
    this.flags = []; // 체크포인트 깃발 (통과하면 색이 바뀜)
    this.portals = [];
    this.npcs = [];
    this._t = 0;

    this._buildGround();
    this._buildPillar();
    for (const el of TOWER_ELEMENTS) this._buildElement(el);
    this._buildPortalsAndNpc();

    this.root.updateMatrixWorld(true);
    this.batchStats = batchStatic(this.root);
  }

  setActive(v) {
    this.root.visible = v;
  }

  /** 근처 상호작용 대상 (높이도 확인 — 정상의 포탈은 정상에서만) */
  findNearestInteractable(x, z, range, y = 0) {
    let best = null;
    let bestD = range * range;
    for (const it of this.interactables) {
      if (Math.abs((it.y || 0) - y) > 1.6) continue;
      const dx = it.x - x;
      const dz = it.z - z;
      const d2 = dx * dx + dz * dz;
      if (d2 < bestD) { bestD = d2; best = it; }
    }
    return best;
  }

  /** 걸어 들어가면 바로 이동하는 포탈 (고리 가운데 근처) */
  portalAt(x, y, z) {
    for (const p of this.portals) {
      if (Math.abs(y - p.y) < 1.2 && Math.hypot(x - p.x, z - p.z) < 0.75) return p;
    }
    return null;
  }

  /** 통과한 체크포인트 표시 */
  setReached(cp) {
    this.flags.forEach((f, i) => {
      const on = i <= cp;
      if (f.on === on) return;
      f.on = on;
      f.mat.color.set(on ? '#39d98a' : '#ffffff');
    });
  }

  /**
   * 함정 판정 (내 캐릭터만)
   * @returns {null|'kill'|'bar'}
   */
  hazard(pos, ms) {
    for (const k of this.kills) if (onKillStrip(k, pos.x, pos.y, pos.z)) return 'kill';
    for (const s of this.spinners) if (hitsSpinBar(s.el, ms, pos.x, pos.y, pos.z)) return 'bar';
    return null;
  }

  /**
   * @param {number} dt
   * @param {number} ms 서버 시각
   * @param {{x:number,y:number,z:number}|null} viewer
   */
  update(dt, ms, viewer) {
    if (!this.root.visible) return;
    this._t += dt;
    for (const mv of this.moving) {
      const { dx, dz } = moveOffset(mv.el, ms);
      const e = mv.el;
      mv.obj.position.x = e.x + dx;
      mv.obj.position.z = e.z + dz;
      const b = mv.box;
      // 이번 프레임 이동량 → 위에 서 있는 캐릭터도 같이 이동 (PlayerController)
      b.dx = dx - mv.lastDx;
      b.dz = dz - mv.lastDz;
      mv.lastDx = dx;
      mv.lastDz = dz;
      b.minX = e.x + dx - e.w / 2; b.maxX = e.x + dx + e.w / 2;
      b.minZ = e.z + dz - e.d / 2; b.maxZ = e.z + dz + e.d / 2;
    }
    for (const f of this.fading) {
      const st = fadeState(f.el, ms);
      f.box.off = !st.solid;
      const target = !st.solid ? 0.12 : st.blink ? (Math.sin(this._t * 28) > 0 ? 0.35 : 0.95) : 0.95;
      f.mat.opacity = target;
      f.mat.depthWrite = st.solid;
    }
    for (const s of this.spinners) s.bar.rotation.y = -spinAngle(s.el, ms);
    if (this.killMat) {
      const k = 0.6 + Math.sin(this._t * 6) * 0.4;
      this.killMat.color.setRGB(1, 0.15 + k * 0.2, 0.25 + k * 0.15);
    }
    for (const p of this.portals) p.visual.update(dt);
    for (const n of this.npcs) n.update(dt, viewer);
    if (this.trophy) this.trophy.rotation.y += dt * 0.8;
  }

  // ── 만들기 ─────────────────────────────────────────
  _buildGround() {
    const S = TOWER_HALF * 2;
    // 파스텔 체크무늬 바닥 (텍스처 1장)
    const c = document.createElement('canvas');
    c.width = c.height = 512;
    const g = c.getContext('2d');
    const cells = 16;
    const cs = 512 / cells;
    for (let i = 0; i < cells; i++) {
      for (let j = 0; j < cells; j++) {
        g.fillStyle = (i + j) % 2 ? '#bde8c4' : '#d9f2dc';
        g.fillRect(i * cs, j * cs, cs, cs);
      }
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(S, S), new THREE.MeshLambertMaterial({ map: tex }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(OX, 0, OZ);
    this.root.add(floor);
    // 가장자리 낮은 울타리 (실제 경계는 CollisionWorld bounds)
    const fence = (w, d, x, z) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, 0.5, d), m('#ffffff'));
      b.position.set(x, 0.25, z);
      this.root.add(b);
      const t = new THREE.Mesh(new THREE.BoxGeometry(w + 0.02, 0.08, d + 0.02), m('#ff8fab'));
      t.position.set(x, 0.52, z);
      this.root.add(t);
    };
    fence(S, 0.3, OX, OZ - TOWER_HALF);
    fence(S, 0.3, OX, OZ + TOWER_HALF);
    fence(0.3, S, OX - TOWER_HALF, OZ);
    fence(0.3, S, OX + TOWER_HALF, OZ);
    // 멀리 떠 있는 구름 (장식)
    const cloudMat = m('#ffffff');
    const cloud = (x, y, z, s) => {
      for (const [dx, dy, r] of [[0, 0, 1.4], [1.3, -0.2, 1.0], [-1.3, -0.25, 1.05], [0.5, 0.5, 0.9]]) {
        const p = new THREE.Mesh(new THREE.IcosahedronGeometry(r * s, 0), cloudMat);
        p.position.set(x + dx * s, y + dy * s, z);
        this.root.add(p);
      }
    };
    cloud(OX - 30, 14, OZ - 26, 2.2);
    cloud(OX + 32, 22, OZ - 10, 2.6);
    cloud(OX + 12, 30, OZ + 34, 2.0);
    cloud(OX - 34, 26, OZ + 18, 2.4);
    cloud(OX + 4, 8, OZ - 36, 2.0);
    // 입구 매트
    const mat = new THREE.Mesh(new THREE.PlaneGeometry(9, 4), m('#ffd166'));
    mat.rotation.x = -Math.PI / 2;
    mat.position.set(OX, 0.01, OZ + 12.6);
    this.root.add(mat);
  }

  _buildPillar() {
    const H = TOWER_GOAL.top + 3;
    const colors = ['#ff8fab', '#ffd166', '#7bdff2', '#b8f2a1', '#cdb4db'];
    const seg = 2.2;
    for (let i = 0, y = 0; y < H; i++, y += seg) {
      const h = Math.min(seg, H - y);
      const p = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 2.1, h, 12), m(colors[i % colors.length]));
      p.position.set(OX, y + h / 2, OZ);
      this.root.add(p);
    }
    const cap = new THREE.Mesh(new THREE.ConeGeometry(2.6, 2.2, 12), m('#e8505b'));
    cap.position.set(OX, H + 1.1, OZ);
    this.root.add(cap);
    this.collision.addBox(OX - 2.0, OX + 2.0, OZ - 2.0, OZ + 2.0, 'pillar');
    // 기둥 아래 간판
    const sign = textSprite(['득근 타워', '빨간 건 닿으면 체크포인트로!'], { w: 5 });
    sign.position.set(OX, 3.2, OZ + 2.4);
    this.root.add(sign);
  }

  _buildElement(el) {
    if (el.kind === 'kill') {
      if (!this.killMat) this.killMat = new THREE.MeshBasicMaterial({ color: '#ff3b5c' });
      const k = new THREE.Mesh(new THREE.BoxGeometry(el.w, el.h, el.d), this.killMat);
      k.position.set(el.x, el.top - el.h / 2, el.z);
      k.userData.noBatch = true;
      this.root.add(k);
      return;
    }
    const top = el.top;
    const body = el.h - 0.06;
    const group = new THREE.Group();
    group.position.set(el.x, 0, el.z);
    const fade = el.kind === 'fade';
    let mat = null;
    if (fade) {
      mat = new THREE.MeshLambertMaterial({ color: el.color, transparent: true, opacity: 0.95, flatShading: true });
      const slab = new THREE.Mesh(new THREE.BoxGeometry(el.w, el.h, el.d), mat);
      slab.position.y = top - el.h / 2;
      group.add(slab);
    } else {
      const b = new THREE.Mesh(new THREE.BoxGeometry(el.w, body, el.d), m(shade(el.color, 0.78)));
      b.position.y = top - 0.06 - body / 2;
      group.add(b);
      const t = new THREE.Mesh(new THREE.BoxGeometry(el.w, 0.06, el.d), m(el.color));
      t.position.y = top - 0.03;
      group.add(t);
    }
    if (el.kind === 'move') {
      // 러닝머신 벨트 줄무늬
      for (let i = -1; i <= 1; i++) {
        const s = new THREE.Mesh(new THREE.BoxGeometry(el.w * 0.8, 0.012, 0.08), m('#1d6f8c'));
        s.position.set(0, top + 0.006, i * el.d * 0.28);
        group.add(s);
      }
    }
    if (el.pad) {
      const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.68, 0.05, 18), new THREE.MeshBasicMaterial({ color: '#fff36b' }));
      pad.position.y = top + 0.025;
      group.add(pad);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.05, 6, 18), new THREE.MeshBasicMaterial({ color: '#ff8a3d' }));
      ring.rotation.x = Math.PI / 2;
      ring.position.y = top + 0.06;
      group.add(ring);
    }
    if (el.kind === 'cp') this._decorateCheckpoint(el, group);
    this.root.add(group);

    if (el.solid !== false) {
      const box = this.collision.addBox(el.x - el.w / 2, el.x + el.w / 2, el.z - el.d / 2, el.z + el.d / 2, el.id, top, top - el.h);
      box.dx = 0;
      box.dz = 0;
      if (el.pad) box.pad = el.pad;
      if (el.move) {
        group.userData.dynamic = true; // 움직이는 발판: 부품을 메시 1개로 합쳐 따로 움직임
        this.moving.push({
          el, obj: group, box, lastDx: 0, lastDz: 0,
        });
      }
      if (fade) {
        group.userData.noBatch = true;
        this.fading.push({ el, obj: group, mat, box });
      }
    }
    if (el.spin) {
      const bar = new THREE.Group();
      bar.position.set(el.x, top + BAR.height, el.z);
      bar.userData.dynamic = true;
      const len = el.spin.len;
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(BAR.radius, BAR.radius, len * 2, 8), m('#c9ced6'));
      rod.rotation.z = Math.PI / 2;
      bar.add(rod);
      for (const s of [-1, 1]) {
        const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.14, 12), m('#e8505b'));
        plate.rotation.z = Math.PI / 2;
        plate.position.x = s * (len - 0.1);
        bar.add(plate);
      }
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, BAR.height, 8), m('#3a3f4b'));
      hub.position.set(el.x, top + BAR.height / 2, el.z);
      this.root.add(hub);
      this.root.add(bar);
      this.spinners.push({ el, bar });
    }
  }

  _decorateCheckpoint(el, group) {
    const top = el.top;
    if (el.goal) {
      // 정상: 큰 트로피
      const t = new THREE.Group();
      t.position.set(el.x - (TOWER_TOP_PORTAL.x - el.x), top, el.z);
      t.userData.dynamic = true;
      const gold = m('#ffd84a');
      const base = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.3, 0.7), m('#3a3f4b'));
      base.position.y = 0.15;
      t.add(base);
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.16, 0.5, 8), gold);
      stem.position.y = 0.55;
      t.add(stem);
      const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.22, 0.7, 12), gold);
      cup.position.y = 1.15;
      t.add(cup);
      for (const s of [-1, 1]) {
        const h = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.05, 6, 12), gold);
        h.position.set(s * 0.52, 1.2, 0);
        t.add(h);
      }
      this.root.add(t);
      this.collision.addBox(t.position.x - 0.4, t.position.x + 0.4, el.z - 0.4, el.z + 0.4, 'trophy', top + 1.6, top);
      this.trophy = t;
      const sign = textSprite(['🏆 정상!', '축하합니다! 포탈로 돌아가요'], { w: 4.2, bg: 'rgba(120, 82, 0, 0.85)' });
      sign.position.set(el.x, top + 3.4, el.z);
      this.root.add(sign);
      return;
    }
    // 깃발
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.0, 6), m('#ffffff'));
    pole.position.set(el.w / 2 - 0.3, top + 1.0, -el.d / 2 + 0.3);
    group.add(pole);
    const flagMat = new THREE.MeshBasicMaterial({ color: el.cp === 0 ? '#39d98a' : '#ffffff', side: THREE.DoubleSide });
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.45), flagMat);
    flag.position.set(el.w / 2 - 0.3 - 0.37, top + 1.75, -el.d / 2 + 0.3);
    flag.userData.noBatch = true;
    group.add(flag);
    this.flags.push({ mat: flagMat, on: el.cp === 0 });
    // 다음 단계 안내 간판
    const next = STAGE_NAMES[el.cp];
    if (next) {
      const sign = textSprite([`STAGE ${el.cp + 1}`, next], { w: 3.2 });
      sign.position.set(el.x, top + 2.6, el.z);
      this.root.add(sign);
    }
  }

  _buildPortalsAndNpc() {
    // 1층: 헬스장으로 돌아가는 포탈
    const exit = createPortal({ color: '#3d7dd8', label: '🏋️ 헬스장으로' });
    exit.group.position.set(TOWER_EXIT_PORTAL.x, 0, TOWER_EXIT_PORTAL.z);
    exit.group.rotation.y = Math.PI;
    this.root.add(exit.group);
    this.portals.push({ visual: exit, x: TOWER_EXIT_PORTAL.x, y: 0, z: TOWER_EXIT_PORTAL.z });
    this.interactables.push({
      id: 'tower-exit', type: 'portal', to: 'gym', label: '헬스장으로', x: TOWER_EXIT_PORTAL.x, z: TOWER_EXIT_PORTAL.z, y: 0,
    });
    // 정상: 돌아가는 포탈
    const P = TOWER_TOP_PORTAL;
    const topP = createPortal({ color: '#f9a03f', label: '🏋️ 헬스장으로', radius: 0.95 });
    topP.group.position.set(P.x, P.y, P.z);
    topP.group.rotation.y = Math.PI / 2;
    this.root.add(topP.group);
    this.portals.push({ visual: topP, x: P.x, y: P.y, z: P.z });
    this.interactables.push({
      id: 'tower-top-exit', type: 'portal', to: 'gym', label: '헬스장으로', x: P.x, z: P.z, y: P.y,
    });
    // 안내원
    const npc = new Npc(this.root, {
      id: 'npc-tower', name: '타워 안내원 핑키', look: 'tower', x: TOWER_NPC.x, z: TOWER_NPC.z, r: TOWER_NPC.r, greet: '타워 처음이에요? E 로 말 걸어요!', greetMobile: '타워 처음이에요? [말 걸기] 눌러요!',
    });
    this.npcs.push(npc);
    this.collision.addBox(TOWER_NPC.x - 0.3, TOWER_NPC.x + 0.3, TOWER_NPC.z - 0.3, TOWER_NPC.z + 0.3, 'npc', 1.8);
    this.interactables.push({
      id: 'npc-tower', type: 'npc', npc: 'tower', label: npc.name, x: TOWER_NPC.x, z: TOWER_NPC.z, y: 0,
    });
  }
}
