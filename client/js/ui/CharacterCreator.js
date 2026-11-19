// 캐릭터 생성 / 커스터마이징 화면 (실시간 3D 미리보기 포함)
import * as THREE from 'three';
import { el } from './dom.js';
import { CharacterModel } from '../character/CharacterModel.js';
import {
  BODY_PRESETS, SKIN_COLORS, HAIR_STYLES, HAIR_COLORS, FACE_SHAPES, OUTFITS, CLOTH_COLORS, SHOES, SHOE_COLORS,
  DEFAULT_APPEARANCE, sanitizeAppearance, randomAppearance, validateNickname, NICKNAME_MAX,
} from '../shared/appearance.js';

// 화면에 표시할 옵션 그룹 정의
const SECTIONS = [
  { key: 'body', title: '체형', kind: 'chips', options: BODY_PRESETS },
  { key: 'skin', title: '피부색', kind: 'colors', options: SKIN_COLORS },
  { key: 'face', title: '얼굴 형태', kind: 'chips', options: FACE_SHAPES },
  { key: 'hair', title: '헤어스타일', kind: 'chips', options: HAIR_STYLES },
  { key: 'hairColor', title: '헤어 컬러', kind: 'colors', options: HAIR_COLORS },
  { key: 'outfit', title: '의상', kind: 'chips', options: OUTFITS },
  { key: 'topColor', title: '상의 색상', kind: 'colors', options: CLOTH_COLORS },
  { key: 'bottomColor', title: '하의 색상', kind: 'colors', options: CLOTH_COLORS },
  { key: 'shoes', title: '신발', kind: 'chips', options: SHOES },
  { key: 'shoeColor', title: '신발 색상', kind: 'colors', options: SHOE_COLORS },
];

export class CharacterCreator {
  constructor(root) {
    this.rootEl = root;
    this.appearance = { ...DEFAULT_APPEARANCE };
    this.mode = 'create';
    this._resolve = null;
    this._raf = 0;
    this._buildDom();
    this._buildPreview();
  }

  /**
   * @param {{mode:'create'|'edit', profile?:{nickname:string, appearance:object}}} opts
   * @returns {Promise<{nickname:string, appearance:object}|null>} 취소 시 null
   */
  open({ mode = 'create', profile = null } = {}) {
    this.mode = mode;
    this.appearance = sanitizeAppearance(profile?.appearance || DEFAULT_APPEARANCE);
    this.nickInput.value = profile?.nickname || '';
    this.nickInput.disabled = mode === 'edit';
    this.errorEl.textContent = '';
    this.titleEl.textContent = mode === 'edit' ? '캐릭터 커스터마이징' : '캐릭터 만들기';
    this.submitBtn.textContent = mode === 'edit' ? '저장하기' : '헬스장 입장하기';
    this.cancelBtn.classList.toggle('hidden', mode !== 'edit');
    this._refreshSelections();
    this.model.setAppearance(this.appearance);
    this.overlay.classList.remove('hidden');
    this._resize();
    this._startLoop();
    if (mode === 'create') setTimeout(() => this.nickInput.focus(), 50);
    return new Promise((resolve) => { this._resolve = resolve; });
  }

  isOpen() {
    return !this.overlay.classList.contains('hidden');
  }

  close(result = null) {
    this.overlay.classList.add('hidden');
    cancelAnimationFrame(this._raf);
    this._raf = 0;
    const r = this._resolve;
    this._resolve = null;
    if (r) r(result);
  }

  // ── DOM ───────────────────────────────────────────────
  _buildDom() {
    this.titleEl = el('h2', { class: 'creator-title', text: '캐릭터 만들기' });
    this.nickInput = el('input', {
      class: 'creator-nick',
      attrs: { type: 'text', maxlength: String(NICKNAME_MAX), placeholder: '닉네임 (2~12자)', autocomplete: 'off', spellcheck: 'false' },
      on: {
        keydown: (e) => { if (e.key === 'Enter') this._submit(); },
        input: () => { this.errorEl.textContent = ''; },
      },
    });
    this.errorEl = el('div', { class: 'creator-error' });

    this.sectionEls = {};
    const sections = SECTIONS.map((sec) => {
      const list = el('div', { class: sec.kind === 'colors' ? 'swatches' : 'chips' });
      for (const opt of sec.options) {
        const value = typeof opt === 'string' ? opt : opt.id;
        const btn = sec.kind === 'colors'
          ? el('button', { class: 'swatch', attrs: { type: 'button', title: value, 'data-value': value }, style: { background: value } })
          : el('button', { class: 'chip', attrs: { type: 'button', 'data-value': value }, text: opt.label });
        btn.addEventListener('click', () => this._set(sec.key, value));
        list.append(btn);
      }
      this.sectionEls[sec.key] = list;
      return el('div', { class: 'creator-section' }, [el('div', { class: 'creator-label', text: sec.title }), list]);
    });

    this.submitBtn = el('button', { class: 'btn btn-primary', attrs: { type: 'button' }, text: '헬스장 입장하기', on: { click: () => this._submit() } });
    this.cancelBtn = el('button', { class: 'btn', attrs: { type: 'button' }, text: '취소', on: { click: () => this.close(null) } });
    const randomBtn = el('button', { class: 'btn', attrs: { type: 'button' }, text: '🎲 랜덤', on: { click: () => this._randomize() } });

    const panel = el('div', { class: 'creator-panel' }, [
      el('div', { class: 'logo', html: 'ONLINE <span>GYM</span>' }),
      this.titleEl,
      el('div', { class: 'creator-section' }, [el('div', { class: 'creator-label', text: '닉네임' }), this.nickInput, this.errorEl]),
      el('div', { class: 'creator-scroll' }, sections),
      el('div', { class: 'creator-actions' }, [randomBtn, this.cancelBtn, this.submitBtn]),
    ]);

    this.previewCanvas = el('canvas', { class: 'creator-canvas' });
    const previewWrap = el('div', { class: 'creator-preview' }, [
      this.previewCanvas,
      el('div', { class: 'creator-hint', text: '드래그해서 돌려보기' }),
    ]);

    this.overlay = el('div', { id: 'creator', class: 'overlay hidden' }, [el('div', { class: 'creator-wrap' }, [panel, previewWrap])]);
    this.overlay.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.mode === 'edit') { e.stopPropagation(); this.close(null); }
    });
    this.rootEl.append(this.overlay);
  }

  _set(key, value) {
    this.appearance = sanitizeAppearance({ ...this.appearance, [key]: value });
    this._refreshSelections();
    this.model.setAppearance(this.appearance);
  }

  _randomize() {
    this.appearance = sanitizeAppearance(randomAppearance());
    this._refreshSelections();
    this.model.setAppearance(this.appearance);
  }

  _refreshSelections() {
    for (const [key, list] of Object.entries(this.sectionEls)) {
      for (const btn of list.children) {
        btn.classList.toggle('selected', btn.dataset.value === this.appearance[key]);
      }
    }
  }

  _submit() {
    const nick = validateNickname(this.nickInput.value);
    if (!nick.ok) {
      this.errorEl.textContent = nick.error;
      this.nickInput.focus();
      return;
    }
    this.close({ nickname: nick.value, appearance: { ...this.appearance } });
  }

  // ── 3D 미리보기 ───────────────────────────────────────
  _buildPreview() {
    const renderer = new THREE.WebGLRenderer({ canvas: this.previewCanvas, antialias: true, alpha: true });
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

    this.model = new CharacterModel(this.appearance);
    this.model.root.rotation.y = 0.35;
    scene.add(this.model.root);

    // 드래그 회전
    let dragging = false;
    let lastX = 0;
    this._userRotated = 0;
    this.previewCanvas.addEventListener('pointerdown', (e) => {
      dragging = true; lastX = e.clientX; this.previewCanvas.setPointerCapture(e.pointerId);
    });
    this.previewCanvas.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      this.model.root.rotation.y += (e.clientX - lastX) * 0.012;
      lastX = e.clientX;
      this._userRotated = 3;
    });
    const stop = () => { dragging = false; };
    this.previewCanvas.addEventListener('pointerup', stop);
    this.previewCanvas.addEventListener('pointercancel', stop);
    window.addEventListener('resize', () => { if (this.isOpen()) this._resize(); });
  }

  _resize() {
    const rect = this.previewCanvas.parentElement.getBoundingClientRect();
    const w = Math.max(100, Math.floor(rect.width));
    const h = Math.max(100, Math.floor(rect.height));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  _startLoop() {
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
}
