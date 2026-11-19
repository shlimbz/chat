// 트레일(움직이면 뒤에 남는 빛) · 오라(발밑에서 빛나는 고리) 이펙트
// - 캐릭터 1명당 Points 1개(+오라 원판 1개) = 드로우콜 1~2번, 파티클 최대 48개
// - 살아 있는 파티클이 없고 새로 만들 것도 없으면 아무 계산도 하지 않음
// - 텍스처는 모든 캐릭터가 공유
import * as THREE from 'three';

const MAX = 48;
const _texCache = new Map();

function makeTexture(kind) {
  if (_texCache.has(kind)) return _texCache.get(kind);
  const S = 64;
  const cv = document.createElement('canvas');
  cv.width = S;
  cv.height = S;
  const g = cv.getContext('2d');
  g.translate(S / 2, S / 2);
  g.fillStyle = '#ffffff';
  g.strokeStyle = '#ffffff';
  if (kind === 'dot') {
    const grd = g.createRadialGradient(0, 0, 0, 0, 0, S / 2);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.4, 'rgba(255,255,255,0.7)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(-S / 2, -S / 2, S, S);
  } else if (kind === 'star') {
    g.beginPath();
    for (let i = 0; i < 8; i++) {
      const r = i % 2 ? 6 : 28;
      const a = (i / 8) * Math.PI * 2;
      g.lineTo(Math.sin(a) * r, -Math.cos(a) * r);
    }
    g.closePath();
    g.fill();
  } else if (kind === 'heart') {
    g.beginPath();
    g.moveTo(0, 22);
    g.bezierCurveTo(-30, 2, -22, -24, 0, -10);
    g.bezierCurveTo(22, -24, 30, 2, 0, 22);
    g.fill();
  } else if (kind === 'ring') {
    g.lineWidth = 5;
    g.beginPath();
    g.arc(0, 0, 24, 0, Math.PI * 2);
    g.stroke();
    g.beginPath();
    g.arc(-9, -9, 5, 0, Math.PI * 2);
    g.fill();
  } else if (kind === 'aura') {
    const grd = g.createRadialGradient(0, 0, S * 0.18, 0, 0, S / 2);
    grd.addColorStop(0, 'rgba(255,255,255,0)');
    grd.addColorStop(0.55, 'rgba(255,255,255,0.15)');
    grd.addColorStop(0.8, 'rgba(255,255,255,0.9)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(-S / 2, -S / 2, S, S);
    // 작은 점 장식
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      g.beginPath();
      g.arc(Math.cos(a) * 22, Math.sin(a) * 22, 2.2, 0, Math.PI * 2);
      g.fillStyle = 'rgba(255,255,255,1)';
      g.fill();
    }
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  _texCache.set(kind, tex);
  return tex;
}

/** 아이템별 이펙트 설정 */
export const FX = {
  trail_sparkle: { tex: 'star', colors: ['#fff6b0', '#ffd84a', '#ffffff'], size: 0.2, life: 0.9, rate: 26, rise: 0.25, spread: 0.18 },
  trail_bubble: { tex: 'ring', colors: ['#9fe3ff', '#c9f1ff', '#e8fbff'], size: 0.22, life: 1.3, rate: 14, rise: 0.45, spread: 0.2 },
  trail_heart: { tex: 'heart', colors: ['#ff5d8f', '#ff9db5', '#ffc2d4'], size: 0.2, life: 1.0, rate: 16, rise: 0.4, spread: 0.18 },
  trail_fire: { tex: 'dot', colors: ['#ffdd55', '#ff8a2b', '#ff4a2b'], size: 0.3, life: 0.55, rate: 40, rise: 0.7, spread: 0.12 },
  trail_rainbow: { tex: 'dot', rainbow: true, size: 0.24, life: 0.9, rate: 44, rise: 0.02, spread: 0.03 },
  aura_gold: { ring: '#ffc93a', tex: 'star', colors: ['#ffe680', '#ffd84a'], size: 0.13, life: 1.4, rate: 7, rise: 0.6, idle: true },
  aura_ice: { ring: '#7fdcff', tex: 'star', colors: ['#d8f6ff', '#9fe3ff'], size: 0.12, life: 1.6, rate: 7, rise: 0.45, idle: true },
  aura_love: { ring: '#ff7aa8', tex: 'heart', colors: ['#ff8fb8', '#ffc2d4'], size: 0.13, life: 1.4, rate: 6, rise: 0.5, idle: true },
};

class Emitter {
  constructor(cfg) {
    this.cfg = cfg;
    this.pos = new Float32Array(MAX * 3);
    this.col = new Float32Array(MAX * 3);
    this.vel = new Float32Array(MAX * 3);
    this.base = new Float32Array(MAX * 3);
    this.age = new Float32Array(MAX).fill(Infinity);
    this.next = 0;
    this.acc = 0;
    this.alive = 0;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    this.points = new THREE.Points(geo, new THREE.PointsMaterial({
      size: cfg.size,
      map: makeTexture(cfg.tex),
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    }));
    this.points.frustumCulled = false;
    this.points.renderOrder = 3;
    this._c = new THREE.Color();
  }

  spawn(x, y, z, vx, vy, vz, time) {
    const i = this.next;
    this.next = (this.next + 1) % MAX;
    const c = this.cfg;
    if (c.rainbow) this._c.setHSL((time * 0.35) % 1, 0.9, 0.6);
    else this._c.set(c.colors[(Math.random() * c.colors.length) | 0]);
    this.base.set([this._c.r, this._c.g, this._c.b], i * 3);
    this.pos.set([x, y, z], i * 3);
    this.vel.set([vx, vy, vz], i * 3);
    this.age[i] = 0;
  }

  /** @returns {boolean} 살아 있는 파티클이 있는지 */
  step(dt) {
    const life = this.cfg.life;
    let alive = 0;
    for (let i = 0; i < MAX; i++) {
      if (this.age[i] >= life) continue;
      this.age[i] += dt;
      const k = Math.max(0, 1 - this.age[i] / life);
      const j = i * 3;
      this.pos[j] += this.vel[j] * dt;
      this.pos[j + 1] += this.vel[j + 1] * dt;
      this.pos[j + 2] += this.vel[j + 2] * dt;
      // 가산 혼합이라 색을 어둡게 하면 사라지는 효과
      const f = k * k;
      this.col[j] = this.base[j] * f;
      this.col[j + 1] = this.base[j + 1] * f;
      this.col[j + 2] = this.base[j + 2] * f;
      if (this.age[i] >= life) { this.col[j] = 0; this.col[j + 1] = 0; this.col[j + 2] = 0; }
      alive++;
    }
    const geo = this.points.geometry;
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
    this.alive = alive;
    return alive > 0;
  }

  dispose() {
    this.points.removeFromParent();
    this.points.geometry.dispose();
    this.points.material.dispose();
  }
}

export class CosmeticFx {
  /**
   * @param {string|null} trail 트레일 아이템 id
   * @param {string|null} aura 오라 아이템 id
   * @param {THREE.Object3D} root 캐릭터 루트 (이 루트의 부모 = 월드에 파티클 추가)
   */
  constructor(trail, aura, root) {
    this.root = root;
    this.key = `${trail || ''}|${aura || ''}`;
    this.trail = trail && FX[trail] ? new Emitter(FX[trail]) : null;
    this.auraCfg = aura && FX[aura] ? FX[aura] : null;
    this.auraFx = this.auraCfg ? new Emitter(this.auraCfg) : null;
    this.ring = null;
    this.time = Math.random() * 10;
    this.enabled = true;
    if (this.auraCfg) {
      this.ring = new THREE.Mesh(
        new THREE.CircleGeometry(0.62, 32),
        new THREE.MeshBasicMaterial({
          color: this.auraCfg.ring, map: makeTexture('aura'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        }),
      );
      this.ring.rotation.x = -Math.PI / 2;
      this.ring.position.y = 0.025;
      this.ring.renderOrder = 2;
      root.add(this.ring);
    }
  }

  setEnabled(v) {
    this.enabled = v;
    if (this.ring) this.ring.visible = v;
    for (const e of [this.trail, this.auraFx]) if (e && !v) e.points.visible = false;
  }

  /**
   * @param {number} dt
   * @param {boolean} moving 움직이는 중(트레일 생성)
   * @param {boolean} preview 상점·외형 미리보기: 제자리에서도 트레일이 보이게
   */
  update(dt, moving, preview = false) {
    this.time += dt;
    const world = this.root.parent;
    if (!world || !this.enabled) return;
    const rp = this.root.position;
    const ry = this.root.rotation.y;
    const fx = Math.sin(ry);
    const fz = Math.cos(ry);

    if (this.ring) {
      this.ring.rotation.z = this.time * 0.6;
      const s = 1 + Math.sin(this.time * 3) * 0.05;
      this.ring.scale.set(s, s, s);
    }

    const run = (e, emitting, spawnFn) => {
      if (!e) return;
      if (!e.points.parent) world.add(e.points);
      if (emitting) {
        e.acc += dt * e.cfg.rate;
        let n = Math.min(4, Math.floor(e.acc));
        e.acc -= n;
        while (n-- > 0) spawnFn(e);
      }
      if (emitting || e.alive > 0) e.points.visible = e.step(dt) || emitting;
    };

    // 트레일: 등 뒤 허리~어깨 높이에서 생겨 뒤로 흩어짐
    run(this.trail, moving || preview, (e) => {
      const c = e.cfg;
      const sp = c.spread;
      const back = preview ? 0.2 : 0.18;
      const h = c.rainbow ? 0.55 : 0.25 + Math.random() * 0.7;
      const pv = preview ? 1.4 : 0; // 미리보기: 뒤로 흘러가는 것처럼
      e.spawn(
        rp.x - fx * back + (Math.random() - 0.5) * sp,
        rp.y + h,
        rp.z - fz * back + (Math.random() - 0.5) * sp,
        -fx * pv + (Math.random() - 0.5) * 0.3,
        c.rise * (0.5 + Math.random() * 0.5),
        -fz * pv + (Math.random() - 0.5) * 0.3,
        this.time,
      );
    });
    // 오라: 고리 둘레에서 위로 올라가는 작은 입자
    run(this.auraFx, true, (e) => {
      const a = Math.random() * Math.PI * 2;
      const r = 0.45 + Math.random() * 0.15;
      e.spawn(rp.x + Math.cos(a) * r, rp.y + 0.05, rp.z + Math.sin(a) * r, 0, e.cfg.rise * (0.6 + Math.random() * 0.6), 0, this.time);
    });
  }

  dispose() {
    this.trail?.dispose();
    this.auraFx?.dispose();
    if (this.ring) {
      this.ring.removeFromParent();
      this.ring.geometry.dispose();
      this.ring.material.dispose();
    }
  }
}
