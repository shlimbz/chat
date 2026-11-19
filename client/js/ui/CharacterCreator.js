// 캐릭터 생성 / 커스터마이징 화면 (실시간 3D 미리보기 포함)
import { el } from './dom.js';
import { getCharacterPreview } from './CharacterPreview.js';
import {
  GENDERS, BODY_PRESETS, BODY_SLIDERS, SKIN_COLORS, HAIR_STYLES, HAIR_COLORS, FACE_SHAPES, EYE_STYLES, EYE_COLORS, CHEEK_STYLES, BROW_STYLES, NOSE_STYLES, MOUTH_STYLES, OUTFITS, CLOTH_COLORS, SHOES, SHOE_COLORS,
  DEFAULT_APPEARANCE, sanitizeAppearance, randomAppearance, validateNickname, NICKNAME_MAX,
} from '../shared/appearance.js';

// 화면에 표시할 옵션 그룹 정의
const SECTIONS = [
  { key: 'gender', title: '성별', kind: 'chips', options: GENDERS },
  { key: 'body', title: '체형 (빠른 선택 + 세부 조절)', kind: 'body' },
  { key: 'skin', title: '피부색', kind: 'colors', options: SKIN_COLORS },
  { key: 'face', title: '얼굴 형태', kind: 'chips', options: FACE_SHAPES },
  { key: 'eyes', title: '눈 모양', kind: 'chips', options: EYE_STYLES },
  { key: 'eyeColor', title: '눈 색', kind: 'colors', options: EYE_COLORS },
  { key: 'cheeks', title: '볼', kind: 'chips', options: CHEEK_STYLES },
  { key: 'brows', title: '눈썹', kind: 'chips', options: BROW_STYLES },
  { key: 'nose', title: '코 모양', kind: 'chips', options: NOSE_STYLES },
  { key: 'mouth', title: '입 모양', kind: 'chips', options: MOUTH_STYLES },
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
    this._onSubmit = null;
    this._buildDom();
    this.preview = getCharacterPreview();
  }

  /**
   * @param {{mode:'create'|'edit', profile?:{nickname:string, appearance:object}, error?:string,
   *          submitLabel?:string, cancelable?:boolean,
   *          onSubmit?:(result:{nickname:string, appearance:object})=>Promise<string|null>}} opts
   *   onSubmit: 서버 저장 등 — 오류 문구를 반환하면 화면에 표시하고 닫지 않음
   * @returns {Promise<{nickname:string, appearance:object}|null>} 취소 시 null
   */
  open({
    mode = 'create', profile = null, error = '', submitLabel, cancelable, onSubmit = null,
  } = {}) {
    this.mode = mode;
    this._onSubmit = onSubmit;
    this.appearance = sanitizeAppearance(profile?.appearance || DEFAULT_APPEARANCE, { ownedItems: null });
    this.nickInput.value = profile?.nickname || '';
    this.nickInput.disabled = mode === 'edit';
    this.errorEl.textContent = error;
    this.titleEl.textContent = mode === 'edit' ? '캐릭터 꾸미기' : '새 캐릭터 만들기';
    this.submitBtn.textContent = submitLabel || (mode === 'edit' ? '저장하기' : '헬스장 입장하기');
    this.submitBtn.disabled = false;
    this.cancelBtn.classList.toggle('hidden', !(cancelable ?? mode === 'edit'));
    this._refreshSelections();
    this.overlay.classList.remove('hidden');
    this.preview.mount(this.previewSlot);
    this.preview.setVisible(true);
    this.preview.setAppearance(this.appearance);
    if (mode === 'create' && !window.matchMedia('(pointer: coarse)').matches) setTimeout(() => this.nickInput.focus(), 50);
    return new Promise((resolve) => { this._resolve = resolve; });
  }

  isOpen() {
    return !this.overlay.classList.contains('hidden');
  }

  close(result = null) {
    this.overlay.classList.add('hidden');
    this.preview.stop();
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
    this.sliders = {};
    const sections = SECTIONS.map((sec) => {
      if (sec.kind === 'body') return this._buildBodySection(sec);
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

    this.previewSlot = el('div', { class: 'creator-preview' });

    this.overlay = el('div', { id: 'creator', class: 'overlay hidden' }, [el('div', { class: 'creator-wrap' }, [panel, this.previewSlot])]);
    this.overlay.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.mode === 'edit') { e.stopPropagation(); this.close(null); }
    });
    this.rootEl.append(this.overlay);
  }

  /** 체형: 예시 버튼(보통/슬림/근육질/통통) + 근육량·몸무게·키 슬라이더 */
  _buildBodySection(sec) {
    const presets = el('div', { class: 'chips' }, BODY_PRESETS.map((pr) => el('button', {
      class: 'chip', attrs: { type: 'button' }, text: pr.label,
      on: { click: () => this._setMany({ muscle: pr.muscle, weight: pr.weight }) },
    })));
    const rows = BODY_SLIDERS.map((sl) => {
      const input = el('input', { class: 'body-slider', attrs: { type: 'range', min: '0', max: '1', step: '0.05' } });
      input.addEventListener('input', () => this._setMany({ [sl.key]: Number(input.value) }, true));
      this.sliders[sl.key] = input;
      return el('div', { class: 'slider-row' }, [
        el('span', { class: 'slider-label', text: sl.label }),
        el('small', { text: sl.min }),
        input,
        el('small', { text: sl.max }),
      ]);
    });
    return el('div', { class: 'creator-section' }, [el('div', { class: 'creator-label', text: sec.title }), presets, ...rows]);
  }

  _set(key, value) {
    this._setMany({ [key]: value });
  }

  /** 값 변경 → 미리보기 갱신 (슬라이더는 프레임당 한 번만 다시 만듦) */
  _setMany(values, fromSlider = false) {
    this.appearance = sanitizeAppearance({ ...this.appearance, ...values }, { ownedItems: null });
    if (!fromSlider) this._refreshSelections();
    if (this._pending) return;
    this._pending = requestAnimationFrame(() => {
      this._pending = 0;
      this.preview.setAppearance(this.appearance);
    });
  }

  _randomize() {
    this.appearance = sanitizeAppearance({ ...randomAppearance(), acc: this.appearance.acc }, { ownedItems: null }); // 착용 중인 치장템은 유지
    this._refreshSelections();
    this.preview.setAppearance(this.appearance);
  }

  _refreshSelections() {
    for (const [key, list] of Object.entries(this.sectionEls)) {
      for (const btn of list.children) {
        btn.classList.toggle('selected', btn.dataset.value === this.appearance[key]);
      }
    }
    for (const [key, input] of Object.entries(this.sliders)) input.value = String(this.appearance[key]);
  }

  async _submit() {
    const nick = this.mode === 'edit' ? { ok: true, value: this.nickInput.value } : validateNickname(this.nickInput.value);
    if (!nick.ok) {
      this.errorEl.textContent = nick.error;
      this.nickInput.focus();
      return;
    }
    const result = { nickname: nick.value, appearance: { ...this.appearance } };
    if (this._onSubmit) {
      this.submitBtn.disabled = true;
      const label = this.submitBtn.textContent;
      this.submitBtn.textContent = '저장 중…';
      let err = null;
      try {
        err = await this._onSubmit(result);
      } catch (e) {
        err = e?.message || '저장하지 못했습니다.';
      }
      this.submitBtn.disabled = false;
      this.submitBtn.textContent = label;
      if (err) {
        this.errorEl.textContent = err;
        return;
      }
    }
    this.close(result);
  }
}
