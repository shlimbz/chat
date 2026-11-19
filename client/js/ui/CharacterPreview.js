// 캐릭터 3D 미리보기 (캐릭터 만들기 · 캐릭터 선택 화면이 하나를 함께 사용)
// WebGL 화면을 하나만 만들고 필요한 화면으로 옮겨 붙여서 메모리를 아낌
import * as THREE from 'three';
import { el } from './dom.js';
import { CharacterModel } from '../character/CharacterModel.js';
import { DEFAULT_APPEARANCE } from '../shared/appearance.js';

let shared = null;

export function getCharacterPreview() {
  if (!shared) shared = new CharacterPreview();
  return shared;
}

class CharacterPreview {
  constructor() {
    this.canvas = el('canvas', { class: 'preview-canvas' });
    this.hint = el('div', { class: 'creator-hint', text: '드래그해서 돌려보기' });
    this.wrap = el('div', { class: 'preview-wrap' }, [this.canvas, this.hint]);

    const renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer = renderer;

    const scene = new THREE.Scene();
    this.scene = scene;
    this.camera = new THREE.PerspectiveCamera(32, 1, 0.1, 50);
    this.camera.position.set(0, 1.0, 4.0);
    this.camera.lookAt(0, 0.74, 0);

    scene.add(new THREE.HemisphereLight('#ffffff', '#b9a990', 2.0));
    const key = new THREE.DirectionalLight('#fff3e0', 2.2);
    key.position.set(2, 4, 3);
    scene.add(key);
    const rim = new THREE.DirectionalLight('#cfe0ff', 1.0);
    rim.position.set(-3, 2, -2);
    scene.add(rim);

    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(0.75, 0.85, 0.12, 24),
      new THREE.MeshLambertMaterial({ color: '#f6d55c', flatShading: true }),
    );
    base.position.y = -0.06;
    scene.add(base);

    this.model = new CharacterModel(DEFAULT_APPEARANCE);
    this.model.fxPreview = true; // 제자리에서도 트레일이 보이게
    this.model.root.rotation.y = 0.35;
    scene.add(this.model.root);

    // 드래그 회전
    let dragging = false;
    let lastX = 0;
    this._userRotated = 0;
    this.canvas.addEventListener('pointerdown', (e) => {
      dragging = true; lastX = e.clientX; this.canvas.setPointerCapture(e.pointerId);
    });
    this.canvas.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      this.model.root.rotation.y += (e.clientX - lastX) * 0.012;
      lastX = e.clientX;
      this._userRotated = 3;
    });
    const stop = () => { dragging = false; };
    this.canvas.addEventListener('pointerup', stop);
    this.canvas.addEventListener('pointercancel', stop);
    window.addEventListener('resize', () => { if (this._raf) this.resize(); });
    this._raf = 0;
  }

  /** 미리보기를 container 안으로 옮기고 그리기 시작 */
  mount(container) {
    container.append(this.wrap);
    this.resize();
    this.start();
  }

  setAppearance(appearance) {
    this.model.setAppearance(appearance);
  }

  setVisible(v) {
    this.model.root.visible = v;
  }

  resize() {
    const rect = this.wrap.getBoundingClientRect();
    const w = Math.max(100, Math.floor(rect.width));
    const h = Math.max(100, Math.floor(rect.height));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  start() {
    cancelAnimationFrame(this._raf);
    let last = performance.now();
    const tick = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (this._userRotated > 0) this._userRotated -= dt;
      else this.model.root.rotation.y += dt * 0.5;
      this.model.update(dt, 0);
      this.renderer.render(this.scene, this.camera);
      this._raf = requestAnimationFrame(tick);
    };
    this._raf = requestAnimationFrame(tick);
  }

  stop() {
    cancelAnimationFrame(this._raf);
    this._raf = 0;
  }
}
