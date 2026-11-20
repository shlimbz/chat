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
  TOWER_NPC, STAGE_NAMES, BAR, TOWER_HALF, ROPE, SANDBAG, CRUSH, moveOffset, fadeState, spinAngle, hitsSpinBar, onKillStrip,
  turnAngle, windAt, inWind, ropeAngle, hitsRope, crushHeight, crushWarn, hitsCrusher, sandbagPos, sandbagHit,
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
    this.turners = []; // { el, obj, box, last }  회전 원판
    this.belts = []; // { el, stripes, axis }  뒤로 미는 러닝머신 벨트 (줄무늬만 움직임)
    this.fans = []; // { el, blades, streaks }
    this.ropes = []; // { el, rope }
    this.crushers = []; // { el, head, warn }
    this.sandbags = []; // { el, swing }
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
   * 함정 판정 (내 캐릭터만) — 닿으면 체크포인트로
   * @returns {null|'kill'|'bar'|'rope'|'crush'}
   */
  hazard(pos, ms) {
    for (const k of this.kills) if (onKillStrip(k, pos.x, pos.y, pos.z)) return 'kill';
    for (const s of this.spinners) if (hitsSpinBar(s.el, ms, pos.x, pos.y, pos.z)) return 'bar';
    for (const r of this.ropes) if (hitsRope(r.el, ms, pos.x, pos.y, pos.z)) return 'rope';
    for (const c of this.crushers) if (hitsCrusher(c.el, ms, pos.x, pos.y, pos.z)) return 'crush';
    return null;
  }

  /**
   * 내 캐릭터를 미는 기믹: 선풍기 바람(계속 밂) / 샌드백(맞으면 날아감)
   * @param {import('../character/PlayerController.js').PlayerController} player
   * @returns {'sandbag'|null} 이번 프레임에 샌드백에 맞았는지
   */
  pushPlayer(player, ms) {
    const p = player.position;
    let wx = 0;
    let wz = 0;
    for (const f of this.fans) {
      const w = windAt(f.el, ms);
      if (w && inWind(f.el, p.x, p.y, p.z)) { wx += w.vx; wz += w.vz; }
    }
    player.push.x = wx;
    player.push.z = wz;
    if (performance.now() < (this._bagCooldown || 0)) return null;
    for (const sb of this.sandbags) {
      const hit = sandbagHit(sb.el, ms, p.x, p.y, p.z);
      if (!hit) continue;
      this._bagCooldown = performance.now() + 700;
      player.applyHit(hit.kx, hit.kz, 3.2, false, 0);
      return 'sandbag';
    }
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
    for (const t of this.turners) {
      const a = turnAngle(t.el, ms);
      t.box.turnD = a - t.last;
      t.last = a;
      t.obj.rotation.y = a;
    }
    for (const bt of this.belts) {
      // 벨트 줄무늬가 미는 방향으로 흘러감
      const k = (this._t * 1.8) % 0.5;
      bt.stripes.forEach((st, i) => {
        const o = ((i * 0.5 + k) % 2) - 1;
        st.position.x = bt.el.conveyor.vx / 1.8 * o;
        st.position.z = bt.el.conveyor.vz / 1.8 * o;
      });
    }
    for (const f of this.fans) {
      const on = !!windAt(f.el, ms);
      f.speed += ((on ? 22 : 0) - f.speed) * Math.min(1, dt * 3);
      f.blades.rotation.z += f.speed * dt;
      f.streaks.visible = on;
      if (on) f.streaks.children.forEach((st, i) => { st.position.z = 0.3 + ((this._t * 3.5 + i * 0.61) % 2.8); });
    }
    for (const r of this.ropes) r.rope.rotation.x = ropeAngle(r.el, ms);
    for (const c of this.crushers) {
      c.head.position.y = c.el.top + crushHeight(c.el, ms);
      const warn = crushWarn(c.el, ms);
      c.warn.visible = warn || crushHeight(c.el, ms) < 1;
      if (warn) c.warn.material.opacity = 0.25 + 0.35 * (Math.sin(this._t * 20) > 0 ? 1 : 0);
    }
    for (const sb of this.sandbags) sb.swing.rotation.z = sandbagPos(sb.el, ms).ang;
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
    const group = new THREE.Group();
    group.position.set(el.x, 0, el.z);
    const add = (geo, color, x, y, z, basic = false) => {
      const mesh = new THREE.Mesh(geo, basic ? new THREE.MeshBasicMaterial({ color }) : m(color));
      mesh.position.set(x, y, z);
      group.add(mesh);
      return mesh;
    };
    const box = (w, h, d, color, x, y, z, basic) => add(new THREE.BoxGeometry(w, h, d), color, x, y, z, basic);
    const cyl = (r1, r2, h, color, x, y, z, seg = 24, basic) => add(new THREE.CylinderGeometry(r1, r2, h, seg), color, x, y, z, basic);
    let fadeMat = null;

    switch (el.kind) {
      case 'plate':
      case 'fake': {
        // 범퍼 원판: 바깥 고무 + 안쪽 단 + 가운데 쇠 허브 (가짜 원판은 허브가 없음 — 눈썰미 힌트)
        const r = el.w / 2;
        cyl(r, r, el.h - 0.04, shade(el.color, 0.75), 0, top - 0.04 - (el.h - 0.04) / 2, 0, 28);
        cyl(r, r, 0.04, el.color, 0, top - 0.02, 0, 28);
        cyl(r * 0.72, r * 0.72, 0.012, shade(el.color, 0.88), 0, top + 0.004, 0, 28);
        if (el.kind === 'plate') {
          cyl(r * 0.22, r * 0.22, 0.03, '#c9ced6', 0, top + 0.013, 0, 16);
          cyl(r * 0.1, r * 0.1, 0.035, '#59606e', 0, top + 0.016, 0, 12);
        }
        if (el.slip) {
          // 땀 웅덩이 (반짝이는 하늘색)
          for (const [dx, dz, rr] of [[0.35, 0.2, 0.32], [-0.4, -0.3, 0.26], [0.1, -0.5, 0.2]]) {
            cyl(rr, rr, 0.01, '#bfe9ff', dx * r, top + 0.02, dz * r, 14, true);
          }
        }
        if (el.kind === 'fake') group.userData.fake = true;
        break;
      }
      case 'bench': {
        // 벤치: 가죽 쿠션 + 쇠 다리
        const narrowX = el.w < el.d;
        box(el.w, 0.14, el.d, el.color, 0, top - 0.07, 0);
        box(el.w * 0.9, 0.06, el.d * 0.9, '#2b2d33', 0, top - 0.17, 0);
        for (const s of [-1, 1]) {
          const lx = narrowX ? 0 : s * (el.w / 2 - 0.25);
          const lz = narrowX ? s * (el.d / 2 - 0.25) : 0;
          box(narrowX ? el.w * 0.8 : 0.08, el.h - 0.2, narrowX ? 0.08 : el.d * 0.8, '#59606e', lx, top - 0.2 - (el.h - 0.2) / 2, lz);
        }
        break;
      }
      case 'mat':
        box(el.w, el.h - 0.05, el.d, '#3a3f4b', 0, top - 0.05 - (el.h - 0.05) / 2, 0);
        box(el.w, 0.05, el.d, el.color, 0, top - 0.025, 0);
        break;
      case 'move':
      case 'tread': {
        // 러닝머신 데크 + 검은 벨트 + 옆 레일
        box(el.w, el.h - 0.05, el.d, '#c9ced6', 0, top - 0.05 - (el.h - 0.05) / 2, 0);
        box(el.w * 0.86, 0.05, el.d * 0.86, '#2b2d33', 0, top - 0.025, 0);
        box(el.w, 0.05, el.d, el.kind === 'tread' ? '#f9a03f' : '#4cc9f0', 0, top - 0.075, 0);
        if (el.kind === 'tread') {
          // 미는 방향 줄무늬 (움직임) + 경고 화살표
          const alongX = Math.abs(el.conveyor.vx) > Math.abs(el.conveyor.vz);
          const stripes = [];
          for (let i = 0; i < 4; i++) {
            const st = box(alongX ? 0.08 : el.w * 0.8, 0.012, alongX ? el.d * 0.8 : 0.08, '#6b7280', 0, top + 0.006, 0, true);
            stripes.push(st);
          }
          group.userData.noBatch = true;
          this.belts.push({ el, stripes });
        } else {
          for (let i = -1; i <= 1; i++) box(el.w * 0.8, 0.012, 0.08, '#4cc9f0', 0, top + 0.006, i * el.d * 0.28, true);
        }
        break;
      }
      case 'tramp': {
        // 트램펄린: 파란 테두리 + 검은 매트 + 다리
        const r = el.w / 2;
        cyl(r, r, 0.12, el.color, 0, top - 0.06, 0, 28);
        cyl(r * 0.82, r * 0.82, 0.02, '#1d1d22', 0, top + 0.005, 0, 28, true);
        const ring = new THREE.Mesh(new THREE.TorusGeometry(r * 0.55, 0.04, 6, 24), new THREE.MeshBasicMaterial({ color: '#fff36b' }));
        ring.rotation.x = Math.PI / 2;
        ring.position.y = top + 0.02;
        group.add(ring);
        for (let i = 0; i < 4; i++) {
          const a = (i / 4) * Math.PI * 2 + 0.6;
          cyl(0.05, 0.05, el.h, '#59606e', Math.cos(a) * r * 0.8, top - 0.12 - el.h / 2, Math.sin(a) * r * 0.8, 6);
        }
        break;
      }
      case 'ring': {
        // 복싱 링 바닥 + 위쪽 쇠 틀에 매달린 샌드백
        box(el.w, el.h - 0.06, el.d, '#2b2d33', 0, top - 0.06 - (el.h - 0.06) / 2, 0);
        box(el.w, 0.06, el.d, el.color, 0, top - 0.03, 0);
        box(el.w * 0.8, 0.012, el.d * 0.8, shade(el.color, 1.25), 0, top + 0.006, 0);
        const sb = el.sandbag;
        const swingRoot = new THREE.Group();
        swingRoot.position.set(el.x, top + SANDBAG.pivot, el.z);
        swingRoot.rotation.y = Math.atan2(-sb.az, sb.ax);
        swingRoot.userData.noBatch = true;
        // 틀 (흔들리는 방향과 직각으로 걸친 가로대 + 양쪽 기둥, 발판 밖)
        const frame = new THREE.Group();
        frame.position.copy(swingRoot.position);
        frame.rotation.y = swingRoot.rotation.y;
        // 가로대는 흔들리는 방향(안쪽↔바깥쪽)으로, 기둥은 발판 바깥 양옆 → 지나가는 길을 막지 않음
        const reach = el.w / 2 + 0.6;
        const beam = new THREE.Mesh(new THREE.BoxGeometry(reach * 2, 0.16, 0.16), m('#59606e'));
        beam.position.y = 0.08;
        frame.add(beam);
        for (const sgn of [-1, 1]) {
          const post = new THREE.Mesh(new THREE.BoxGeometry(0.14, SANDBAG.pivot + 0.4, 0.14), m('#59606e'));
          post.position.set(sgn * reach, -SANDBAG.pivot / 2 - 0.12, 0);
          frame.add(post);
        }
        this.root.add(frame);
        const swing = new THREE.Group();
        swing.userData.dynamic = true;
        const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, SANDBAG.len - SANDBAG.half, 6), m('#c9ced6'));
        chain.position.y = -(SANDBAG.len - SANDBAG.half) / 2;
        swing.add(chain);
        const bag = new THREE.Mesh(new THREE.CylinderGeometry(SANDBAG.radius, SANDBAG.radius, SANDBAG.half * 2, 14), m('#e8505b'));
        bag.position.y = -SANDBAG.len;
        swing.add(bag);
        for (const yy of [-SANDBAG.len + SANDBAG.half - 0.04, -SANDBAG.len - SANDBAG.half + 0.04]) {
          const cap = new THREE.Mesh(new THREE.CylinderGeometry(SANDBAG.radius + 0.01, SANDBAG.radius + 0.01, 0.08, 14), m('#2b2d33'));
          cap.position.y = yy;
          swing.add(cap);
        }
        swingRoot.add(swing);
        this.root.add(swingRoot);
        this.sandbags.push({ el, swing });
        break;
      }
      case 'spin': {
        // 큰 고무 원판 위에서 바벨이 빙글빙글
        const r = el.w / 2;
        cyl(r, r, el.h - 0.05, '#2b2d33', 0, top - 0.05 - (el.h - 0.05) / 2, 0, 32);
        cyl(r, r, 0.05, '#3a3f4b', 0, top - 0.025, 0, 32);
        const ring = new THREE.Mesh(new THREE.TorusGeometry(r - 0.12, 0.03, 4, 32), m('#e8505b'));
        ring.rotation.x = Math.PI / 2;
        ring.position.y = top + 0.005;
        group.add(ring);
        break;
      }
      case 'turn': {
        // 회전 원판 (노란 20kg 원판이 돌아감 — 위에 서면 같이 돎)
        const r = el.w / 2;
        cyl(r, r, el.h - 0.04, shade(el.color, 0.75), 0, top - 0.04 - (el.h - 0.04) / 2, 0, 32);
        cyl(r, r, 0.04, el.color, 0, top - 0.02, 0, 32);
        cyl(r * 0.22, r * 0.22, 0.03, '#c9ced6', 0, top + 0.013, 0, 16);
        // 돌아가는 게 보이도록 숫자 대신 굵은 줄 4개
        for (let i = 0; i < 4; i++) {
          const st = box(r * 0.62, 0.012, 0.16, '#2b2d33', 0, top + 0.006, 0);
          st.geometry.translate(r * 0.5, 0, 0);
          st.rotation.y = (i * Math.PI) / 2;
        }
        group.userData.dynamic = true;
        break;
      }
      case 'rope': {
        // 나무 바닥 + 양옆 기둥 사이에서 도는 줄넘기 줄
        box(el.w, el.h - 0.05, el.d, '#8a6a4a', 0, top - 0.05 - (el.h - 0.05) / 2, 0);
        box(el.w, 0.05, el.d, el.color, 0, top - 0.025, 0);
        const ax = -el.rope.pz;
        const az = el.rope.px; // 줄과 나란한 방향 (진행 방향과 직각)
        const half = Math.max(el.w, el.d) / 2 + 0.15;
        for (const sgn of [-1, 1]) {
          box(0.12, ROPE.height + 0.2, 0.12, '#f9a03f', ax * half * sgn, top + (ROPE.height + 0.2) / 2, az * half * sgn);
          box(0.2, 0.2, 0.2, '#e8505b', ax * half * sgn, top + ROPE.height, az * half * sgn);
        }
        const ropeRoot = new THREE.Group();
        ropeRoot.position.set(el.x, top + ROPE.height, el.z);
        ropeRoot.rotation.y = Math.atan2(-el.rope.px, -el.rope.pz);
        const spin = new THREE.Group();
        spin.userData.noBatch = true;
        const line = new THREE.Mesh(new THREE.CylinderGeometry(ROPE.thick, ROPE.thick, half * 2, 6), new THREE.MeshBasicMaterial({ color: '#ff3b5c' }));
        line.rotation.z = Math.PI / 2;
        line.position.y = -ROPE.radius;
        spin.add(line);
        for (const sgn of [-1, 1]) {
          const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, ROPE.radius, 6), new THREE.MeshBasicMaterial({ color: '#ff3b5c' }));
          arm.position.set(sgn * half, -ROPE.radius / 2, 0);
          spin.add(arm);
        }
        ropeRoot.add(spin);
        ropeRoot.userData.noBatch = true;
        this.root.add(ropeRoot);
        this.ropes.push({ el, rope: spin });
        break;
      }
      case 'crush': {
        // 덤벨 프레스: 쇠 바닥 + 양옆 기둥 + 위에서 쿵 내려오는 거대한 덤벨
        box(el.w, el.h - 0.05, el.d, '#3a3f4b', 0, top - 0.05 - (el.h - 0.05) / 2, 0);
        box(el.w, 0.05, el.d, el.color, 0, top - 0.025, 0);
        const H = CRUSH.up + CRUSH.thick + 0.3;
        for (const [sx, sz] of [[-1, -1], [1, 1]]) box(0.16, H, 0.16, '#c9ced6', sx * (el.w / 2 + 0.12), top + H / 2, sz * (el.d / 2 + 0.12));
        const head = new THREE.Group();
        head.position.set(el.x, top + CRUSH.up, el.z);
        head.userData.dynamic = true;
        const hw = el.w - 0.1;
        const hd = el.d - 0.1;
        const plate = new THREE.Mesh(new THREE.BoxGeometry(hw, CRUSH.thick * 0.6, hd), m('#2b2d33'));
        plate.position.y = CRUSH.thick * 0.3;
        head.add(plate);
        const stripe = new THREE.Mesh(new THREE.BoxGeometry(hw + 0.01, 0.08, hd + 0.01), m('#f6d55c'));
        stripe.position.y = CRUSH.thick * 0.6;
        head.add(stripe);
        const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, hw * 0.7, 8), m('#c9ced6'));
        handle.rotation.z = Math.PI / 2;
        handle.position.y = CRUSH.thick * 0.6 + 0.2;
        head.add(handle);
        this.root.add(head);
        // 곧 내려온다는 경고 (발판 위 빨간 사각형 깜빡임)
        const warn = new THREE.Mesh(new THREE.PlaneGeometry(hw, hd), new THREE.MeshBasicMaterial({ color: '#ff3b5c', transparent: true, opacity: 0.4, depthWrite: false }));
        warn.rotation.x = -Math.PI / 2;
        warn.position.set(el.x, top + 0.012, el.z);
        warn.visible = false;
        warn.userData.noBatch = true;
        this.root.add(warn);
        this.crushers.push({ el, head, warn });
        break;
      }
      case 'fade': {
        // 요가매트: 반투명 재질 (사라질 때 흐려짐) + 한쪽 끝이 돌돌 말림
        fadeMat = new THREE.MeshLambertMaterial({ color: el.color, transparent: true, opacity: 0.95, flatShading: true });
        const slab = new THREE.Mesh(new THREE.BoxGeometry(el.w, el.h, el.d), fadeMat);
        slab.position.y = top - el.h / 2;
        group.add(slab);
        const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, el.d, 10), fadeMat);
        roll.rotation.x = Math.PI / 2;
        roll.position.set(el.w / 2 - 0.12, top - 0.12, 0);
        group.add(roll);
        break;
      }
      case 'cp':
      default:
        // 체크포인트: 검은 고무 바닥 타일 + 초록 테두리
        box(el.w, el.h - 0.06, el.d, '#2b2d33', 0, top - 0.06 - (el.h - 0.06) / 2, 0);
        box(el.w, 0.06, el.d, el.color, 0, top - 0.03, 0);
        box(el.w - 0.4, 0.012, el.d - 0.4, '#3a3f4b', 0, top + 0.006, 0);
        break;
    }
    if (el.kind === 'cp') this._decorateCheckpoint(el, group);
    if (el.wind) this._addFan(el);
    this.root.add(group);

    if (el.solid !== false) {
      const box3 = el.round
        ? this.collision.addCylinder(el.x, el.z, el.w / 2, el.id, top, top - el.h)
        : this.collision.addBox(el.x - el.w / 2, el.x + el.w / 2, el.z - el.d / 2, el.z + el.d / 2, el.id, top, top - el.h);
      box3.dx = 0;
      box3.dz = 0;
      if (el.pad) box3.pad = el.pad;
      if (el.slip) box3.slip = true;
      if (el.conveyor) box3.conveyor = el.conveyor;
      if (el.move) {
        group.userData.dynamic = true; // 움직이는 발판: 부품을 메시 1개로 합쳐 따로 움직임
        this.moving.push({
          el, obj: group, box: box3, lastDx: 0, lastDz: 0,
        });
      }
      if (el.turn) {
        box3.turnD = 0;
        this.turners.push({
          el, obj: group, box: box3, last: 0,
        });
      }
      if (fadeMat) {
        group.userData.noBatch = true;
        this.fading.push({ el, obj: group, mat: fadeMat, box: box3 });
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
      for (const sgn of [-1, 1]) {
        const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.14, 14), m('#e8505b'));
        plate.rotation.z = Math.PI / 2;
        plate.position.x = sgn * (len - 0.12);
        bar.add(plate);
        const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.06, 10), m('#3d7dd8'));
        collar.rotation.z = Math.PI / 2;
        collar.position.x = sgn * (len - 0.24);
        bar.add(collar);
      }
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, BAR.height, 8), m('#59606e'));
      hub.position.set(el.x, top + BAR.height / 2, el.z);
      this.root.add(hub);
      this.root.add(bar);
      this.spinners.push({ el, bar });
    }
  }

  /** 선풍기: 발판 안쪽(기둥 쪽)에 떠서 바깥으로 바람 — 켜지면 날개가 돌고 바람 줄이 보임 */
  _addFan(el) {
    const ox = el.x - OX;
    const oz = el.z - OZ;
    const L = Math.hypot(ox, oz) || 1;
    const ux = ox / L;
    const uz = oz / L;
    const g = new THREE.Group();
    g.position.set(el.x - ux * (el.w / 2 + 0.5), el.top + 0.9, el.z - uz * (el.w / 2 + 0.5));
    g.rotation.y = Math.atan2(ux, uz);
    g.userData.noBatch = true;
    const cage = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.05, 6, 20), m('#c9ced6'));
    g.add(cage);
    const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.0, 6), m('#59606e'));
    stand.position.y = -0.55;
    g.add(stand);
    const blades = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.55, 0.03), m('#7bdff2'));
      b.geometry.translate(0, 0.3, 0);
      b.rotation.z = (i * Math.PI * 2) / 3;
      blades.add(b);
    }
    const hubMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.08, 8), m('#3d7dd8'));
    hubMesh.rotation.x = Math.PI / 2;
    blades.add(hubMesh);
    g.add(blades);
    // 바람 줄 (켜졌을 때만, 바깥쪽으로 흘러감)
    const streaks = new THREE.Group();
    const smat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.6, depthWrite: false });
    for (let i = 0; i < 6; i++) {
      const st = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.6), smat);
      st.position.set(((i * 0.53) % 1 - 0.5) * 1.0, ((i * 0.37) % 1 - 0.5) * 1.0, 0.3);
      streaks.add(st);
    }
    streaks.visible = false;
    g.add(streaks);
    this.root.add(g);
    this.fans.push({ el, blades, streaks, speed: 0 });
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
