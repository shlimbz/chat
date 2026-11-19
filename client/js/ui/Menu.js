// ESC 메뉴 + 설정 화면
// 아직 구현되지 않은 메뉴는 "Phase N 예정" 으로 비활성 표시합니다.
import { el } from './dom.js';

export class Menu {
  /**
   * @param {HTMLElement} root
   * @param {{onResume:Function,onCustomize:Function,onSettingsChange:Function,getSettings:Function,getProfile:Function}} handlers
   */
  constructor(root, handlers) {
    this.h = handlers;
    this.mainView = this._buildMain();
    this.settingsView = this._buildSettings();
    this.infoView = this._buildInfo();
    this.panel = el('div', { class: 'menu-panel' }, [this.mainView, this.settingsView, this.infoView]);
    this.overlay = el('div', { id: 'menu', class: 'overlay dim hidden' }, [this.panel]);
    this.overlay.addEventListener('pointerdown', (e) => { if (e.target === this.overlay) this.close(); });
    root.append(this.overlay);
  }

  isOpen() { return !this.overlay.classList.contains('hidden'); }

  open() {
    this._show('main');
    this.overlay.classList.remove('hidden');
  }

  close() {
    if (!this.isOpen()) return;
    this.overlay.classList.add('hidden');
    this.h.onResume?.();
  }

  /** ESC 처리: 하위 화면이면 메인으로, 메인이면 닫기 */
  back() {
    if (this.current !== 'main') this._show('main');
    else this.close();
  }

  _show(name) {
    this.current = name;
    this.mainView.classList.toggle('hidden', name !== 'main');
    this.settingsView.classList.toggle('hidden', name !== 'settings');
    this.infoView.classList.toggle('hidden', name !== 'info');
    if (name === 'settings') this._syncSettings();
    if (name === 'info') this._syncInfo();
  }

  _buildMain() {
    const btn = (text, fn, disabledNote) => {
      const b = el('button', { class: 'menu-btn', attrs: { type: 'button' } }, [text]);
      if (disabledNote) {
        b.disabled = true;
        b.append(el('span', { class: 'menu-note', text: disabledNote }));
      } else {
        b.addEventListener('click', fn);
      }
      return b;
    };
    return el('div', { class: 'menu-view' }, [
      el('div', { class: 'logo', html: 'ONLINE <span>GYM</span>' }),
      btn('계속하기', () => this.close()),
      btn('캐릭터 정보', () => this._show('info')),
      btn('캐릭터 커스터마이징', () => { this.overlay.classList.add('hidden'); this.h.onCustomize?.(); }),
      btn('설정', () => this._show('settings')),
      btn('운동 기록', null, 'Phase 4 예정'),
      btn('성장 현황', null, 'Phase 5 예정'),
      btn('접속자 목록', null, 'Phase 2 예정'),
    ]);
  }

  _buildInfo() {
    this.infoBody = el('div', { class: 'menu-info' });
    return el('div', { class: 'menu-view hidden' }, [
      el('h3', { text: '캐릭터 정보' }),
      this.infoBody,
      el('button', { class: 'menu-btn', attrs: { type: 'button' }, text: '← 돌아가기', on: { click: () => this._show('main') } }),
    ]);
  }

  _syncInfo() {
    const p = this.h.getProfile();
    this.infoBody.replaceChildren(
      row('닉네임', p.nickname),
      row('레벨', 'Lv.1'),
      row('경험치', '— (Phase 5에서 구현)'),
      row('운동 기록', '— (Phase 4에서 구현)'),
      row('저장 위치', '이 브라우저 (서버 저장은 Phase 2)'),
    );
  }

  _buildSettings() {
    this.sensInput = el('input', { attrs: { type: 'range', min: '0.2', max: '3', step: '0.1' } });
    this.sensValue = el('span', { class: 'menu-value' });
    this.invertInput = el('input', { attrs: { type: 'checkbox' } });
    this.shadowInput = el('input', { attrs: { type: 'checkbox' } });
    this.nameTagInput = el('input', { attrs: { type: 'checkbox' } });

    const emit = () => {
      const s = {
        mouseSensitivity: Number(this.sensInput.value),
        invertY: this.invertInput.checked,
        shadows: this.shadowInput.checked,
        showNameTags: this.nameTagInput.checked,
      };
      this.sensValue.textContent = `${s.mouseSensitivity.toFixed(1)}x`;
      this.h.onSettingsChange?.(s);
    };
    for (const input of [this.sensInput, this.invertInput, this.shadowInput, this.nameTagInput]) {
      input.addEventListener('input', emit);
    }

    return el('div', { class: 'menu-view hidden' }, [
      el('h3', { text: '설정' }),
      el('label', { class: 'menu-row' }, [el('span', { text: '마우스 감도' }), this.sensInput, this.sensValue]),
      el('label', { class: 'menu-row' }, [el('span', { text: '카메라 상하 반전' }), this.invertInput]),
      el('label', { class: 'menu-row' }, [el('span', { text: '그림자' }), this.shadowInput]),
      el('label', { class: 'menu-row' }, [el('span', { text: '닉네임 표시' }), this.nameTagInput]),
      el('button', { class: 'menu-btn', attrs: { type: 'button' }, text: '← 돌아가기', on: { click: () => this._show('main') } }),
    ]);
  }

  _syncSettings() {
    const s = this.h.getSettings();
    this.sensInput.value = String(s.mouseSensitivity);
    this.sensValue.textContent = `${s.mouseSensitivity.toFixed(1)}x`;
    this.invertInput.checked = s.invertY;
    this.shadowInput.checked = s.shadows;
    this.nameTagInput.checked = s.showNameTags;
  }
}

function row(label, value) {
  return el('div', { class: 'menu-info-row' }, [el('span', { text: label }), el('b', { text: value })]);
}
