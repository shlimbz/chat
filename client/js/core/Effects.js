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

  _tone(ac, from, to, dur, gain, type = 'sine', delay = 0, out = null) {
    const o = ac.createOscillator();
    o.type = type;
    const g = ac.createGain();
    const t = ac.currentTime + delay;
    o.frequency.setValueAtTime(from, t);
    o.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(out || ac.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
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

  // ── 득근 타워 효과음 ──
  jump() {
    const ac = this._ac();
    if (ac) this._tone(ac, 320, 640, 0.13, 0.07, 'square');
  }

  /** 점프대: 띠요옹 */
  pad() {
    const ac = this._ac();
    if (!ac) return;
    this._tone(ac, 160, 900, 0.32, 0.16, 'sine');
    this._tone(ac, 240, 1200, 0.25, 0.05, 'triangle', 0.03);
  }

  /** 체크포인트: 띠링 (도-미-솔-도) */
  checkpoint() {
    const ac = this._ac();
    if (!ac) return;
    [1047, 1319, 1568, 2093].forEach((f, i) => this._tone(ac, f, f, 0.16, 0.09, 'triangle', i * 0.07));
  }

  /** 함정에 닿음 / 떨어짐: 뿌우웅 */
  fail() {
    const ac = this._ac();
    if (!ac) return;
    this._tone(ac, 520, 70, 0.45, 0.12, 'square');
    this._noise(ac, 0.25, 700, 0.15);
  }

  /** 포탈 이동: 슈우웅 */
  portal() {
    const ac = this._ac();
    if (!ac) return;
    this._tone(ac, 180, 1400, 0.55, 0.1, 'sine');
    this._tone(ac, 90, 700, 0.55, 0.05, 'sawtooth', 0.05);
    this._noise(ac, 0.5, 2400, 0.06, 2);
  }

  /** 정상 도착: 빰빠밤~ */
  win() {
    const ac = this._ac();
    if (!ac) return;
    const notes = [[523, 0], [659, 0.12], [784, 0.24], [1047, 0.36], [784, 0.54], [1047, 0.66]];
    for (const [f, t] of notes) {
      this._tone(ac, f, f, t === 0.66 ? 0.7 : 0.16, 0.08, 'square', t);
      this._tone(ac, f / 2, f / 2, t === 0.66 ? 0.7 : 0.16, 0.06, 'triangle', t);
    }
  }

  /** 대화창 넘기기: 톡 */
  blip() {
    const ac = this._ac();
    if (ac) this._tone(ac, 880, 990, 0.05, 0.05, 'square');
  }
}

/**
 * 득근 타워 배경음악 — 파일 없이 Web Audio 로 연주하는 8비트풍 반복 곡 (직접 작곡한 짧은 루프)
 * 4마디(C-Am-F-G) × 2가지 멜로디, 140 BPM
 */
const MELODY = [
  // A
  72, 76, 79, 76, 81, 79, 76, 74, 72, null, 76, 79, 81, null, 79, 76,
  77, 76, 74, 72, 74, 76, 77, 79, 79, null, 74, null, 71, 74, 79, null,
  // B
  84, 83, 81, 79, 81, 79, 76, 79, 76, null, 72, 76, 79, 81, 79, null,
  77, 81, 84, 81, 77, 76, 74, 72, 74, 76, 79, 83, 84, null, null, null,
];
const BASS = [48, 45, 41, 43]; // 마디별 근음
const midi = (n) => 440 * 2 ** ((n - 69) / 12);

export class TowerMusic {
  /** @param {Sfx} sfx 같은 AudioContext 를 사용 */
  constructor(sfx) {
    this.sfx = sfx;
    this.playing = false;
    this.volume = 0.5;
  }

  start() {
    if (this.playing) return;
    const ac = this.sfx._ac();
    if (!ac) return;
    this.playing = true;
    this.out = ac.createGain();
    this.out.gain.value = 0;
    this.out.gain.linearRampToValueAtTime(0.11 * this.volume, ac.currentTime + 1.2); // 서서히 커짐
    this.out.connect(ac.destination);
    this.step = 0;
    this.next = ac.currentTime + 0.1;
    const eighth = 60 / 140 / 2;
    this.timer = setInterval(() => {
      if (!this.sfx.enabled) { this.stop(); return; }
      while (this.next < ac.currentTime + 0.15) {
        this._play(ac, this.step, this.next - ac.currentTime, eighth);
        this.step = (this.step + 1) % MELODY.length;
        this.next += eighth;
      }
    }, 30);
  }

  _play(ac, i, delay, len) {
    const d = Math.max(0, delay);
    const n = MELODY[i];
    if (n) this.sfx._tone(ac, midi(n), midi(n), len * 0.9, 0.22, 'square', d, this.out);
    const bar = Math.floor(i / 8) % 4;
    if (i % 2 === 0) {
      const b = BASS[bar] + (i % 4 === 2 ? 12 : 0);
      this.sfx._tone(ac, midi(b), midi(b), len * 1.7, 0.5, 'triangle', d, this.out);
    }
    if (i % 2 === 1) this._hat(ac, d);
  }

  _hat(ac, delay) {
    if (!this._hatBuf) {
      const len = Math.floor(ac.sampleRate * 0.04);
      this._hatBuf = ac.createBuffer(1, len, ac.sampleRate);
      const data = this._hatBuf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    }
    const src = ac.createBufferSource();
    src.buffer = this._hatBuf;
    const f = ac.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 6000;
    const g = ac.createGain();
    g.gain.value = 0.25;
    src.connect(f).connect(g).connect(this.out);
    src.start(ac.currentTime + delay);
  }

  stop() {
    if (!this.playing) return;
    this.playing = false;
    clearInterval(this.timer);
    const ac = this.sfx.ctx;
    const out = this.out;
    if (ac && out) {
      out.gain.cancelScheduledValues(ac.currentTime);
      out.gain.setValueAtTime(out.gain.value, ac.currentTime);
      out.gain.linearRampToValueAtTime(0, ac.currentTime + 0.4);
      setTimeout(() => out.disconnect(), 600);
    }
    this.out = null;
  }
}
