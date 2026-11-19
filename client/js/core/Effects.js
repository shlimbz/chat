// 타격 이펙트(팡! 하는 별 모양) + 효과음
// - 이펙트: 스프라이트 몇 개를 미리 만들어 두고 돌려 씀 (새로 만들지 않아 가벼움)
// - 효과음: 파일 없이 Web Audio 로 즉석에서 합성
import * as THREE from 'three';

const POOL = 8;
const LIFE = 0.32;

export class HitEffects {
  constructor(scene) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const ctx = c.getContext('2d');
    ctx.translate(64, 64);
    ctx.fillStyle = '#fff3a0';
    ctx.strokeStyle = '#ff8a3d';
    ctx.lineWidth = 6;
    ctx.beginPath();
    for (let i = 0; i < 16; i++) {
      const r = i % 2 === 0 ? 58 : 28;
      const a = (i * Math.PI) / 8;
      ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.items = [];
    for (let i = 0; i < POOL; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false }));
      sp.visible = false;
      sp.renderOrder = 20;
      scene.add(sp);
      this.items.push({ sp, t: 0 });
    }
    this._next = 0;
  }

  spawn(x, y, z, big = false) {
    const it = this.items[this._next];
    this._next = (this._next + 1) % POOL;
    it.t = LIFE;
    it.big = big;
    it.sp.position.set(x, y, z);
    it.sp.material.rotation = Math.random() * Math.PI;
    it.sp.visible = true;
  }

  update(dt) {
    for (const it of this.items) {
      if (it.t <= 0) continue;
      it.t -= dt;
      if (it.t <= 0) { it.sp.visible = false; continue; }
      const k = 1 - it.t / LIFE;
      const s = (it.big ? 0.9 : 0.6) * (0.4 + k * 0.9);
      it.sp.scale.set(s, s, 1);
      it.sp.material.opacity = 1 - k * k;
    }
  }
}

/** 간단한 합성 효과음 */
export class Sfx {
  constructor() {
    this.enabled = true;
    this.ctx = null;
  }

  _ac() {
    if (!this.enabled) return null;
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }

  _noise(ac, dur, freq, gain, q = 1) {
    const len = Math.floor(ac.sampleRate * dur);
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ac.createBufferSource();
    src.buffer = buf;
    const f = ac.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ac.createGain();
    g.gain.value = gain;
    src.connect(f).connect(g).connect(ac.destination);
    src.start();
  }

  _tone(ac, from, to, dur, gain, type = 'sine') {
    const o = ac.createOscillator();
    o.type = type;
    const g = ac.createGain();
    const t = ac.currentTime;
    o.frequency.setValueAtTime(from, t);
    o.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(ac.destination);
    o.start(t);
    o.stop(t + dur);
  }

  swing() {
    const ac = this._ac();
    if (ac) this._noise(ac, 0.12, 1800, 0.08, 0.7);
  }

  hit(heavy = false) {
    const ac = this._ac();
    if (!ac) return;
    this._noise(ac, heavy ? 0.16 : 0.1, heavy ? 900 : 1400, heavy ? 0.5 : 0.35);
    this._tone(ac, heavy ? 180 : 240, 60, heavy ? 0.18 : 0.12, 0.35);
  }

  knockdown() {
    const ac = this._ac();
    if (!ac) return;
    this._tone(ac, 880, 220, 0.5, 0.15, 'triangle');
  }
}
