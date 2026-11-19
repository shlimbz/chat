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
    this.playersView = this._buildPlayers();
    this.adminView = this._buildAdmin();
    this.panel = el('div', { class: 'menu-panel' }, [this.mainView, this.settingsView, this.infoView, this.playersView, this.adminView]);
    this.overlay = el('div', { id: 'menu', class: 'overlay dim hidden' }, [this.panel]);
    this.overlay.addEventListener('pointerdown', (e) => { if (e.target === this.overlay) this.close(); });
    root.append(this.overlay);
  }

  isOpen() { return !this.overlay.classList.contains('hidden'); }

  open() {
    this._syncMain();
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
    this.playersView.classList.toggle('hidden', name !== 'players');
    this.adminView.classList.toggle('hidden', name !== 'admin');
    if (name === 'admin') this._syncAdmin();
    if (name === 'settings') this._syncSettings();
    if (name === 'info') this._syncInfo();
    if (name === 'players') this._syncPlayers();
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
    this.accountLine = el('div', { class: 'menu-account' });
    this.adminBtn = btn('🛡️ 관리자 패널', () => this._show('admin'));
    this.changeBtn = btn('캐릭터 변경', () => this.h.onChangeCharacter?.());
    this.logoutBtn = btn('로그아웃', () => this.h.onLogout?.());
    return el('div', { class: 'menu-view' }, [
      el('div', { class: 'logo', html: 'ONLINE <span>GYM</span>' }),
      this.accountLine,
      btn('계속하기', () => this.close()),
      btn('캐릭터 정보', () => this._show('info')),
      btn('캐릭터 꾸미기', () => { this.overlay.classList.add('hidden'); this.h.onCustomize?.(); }),
      btn('접속자 목록', () => this._show('players')),
      this.adminBtn,
      btn('설정', () => this._show('settings')),
      btn('운동 기록', null, 'Phase 4 예정'),
      btn('성장 현황', null, 'Phase 5 예정'),
      this.changeBtn,
      this.logoutBtn,
    ]);
  }

  _syncMain() {
    const acc = this.h.getAccount?.();
    this.accountLine.textContent = acc ? `👤 ${acc.username}${acc.isAdmin ? ' · 관리자' : ''}` : '오프라인 모드';
    this.adminBtn.classList.toggle('hidden', !acc?.isAdmin);
    this.changeBtn.classList.toggle('hidden', !this.h.onChangeCharacter);
    this.logoutBtn.classList.toggle('hidden', !this.h.onLogout);
  }

  // ── 관리자 패널 ───────────────────────────────────────
  _buildAdmin() {
    this.adminMsg = el('div', { class: 'menu-hint admin-msg' });
    this.adminList = el('div', { class: 'menu-players' });
    this.noticeInput = el('input', { class: 'menu-input', attrs: { type: 'text', maxlength: '200', placeholder: '전체 공지 내용' } });
    const noticeBtn = el('button', { class: 'chip', attrs: { type: 'button' }, text: '공지', on: { click: () => this._doAdmin('notice', null, { text: this.noticeInput.value }).then(() => { this.noticeInput.value = ''; }) } });
    this.unbanInput = el('input', { class: 'menu-input', attrs: { type: 'text', maxlength: '16', placeholder: '차단 해제할 계정 아이디' } });
    const unbanBtn = el('button', { class: 'chip', attrs: { type: 'button' }, text: '해제', on: { click: () => this._doAdmin('unban', this.unbanInput.value.trim()) } });
    return el('div', { class: 'menu-view hidden' }, [
      el('h3', { text: '🛡️ 관리자 패널' }),
      el('div', { class: 'menu-hint', text: '채팅 명령어도 사용 가능: /help' }),
      this.adminList,
      el('div', { class: 'menu-inline' }, [this.noticeInput, noticeBtn]),
      el('div', { class: 'menu-inline' }, [this.unbanInput, unbanBtn]),
      this.adminMsg,
      el('button', { class: 'menu-btn', attrs: { type: 'button' }, text: '← 돌아가기', on: { click: () => this._show('main') } }),
    ]);
  }

  _syncAdmin() {
    const list = (this.h.getPlayers?.() || []).filter((p) => !p.self);
    this.adminMsg.textContent = '';
    if (!list.length) {
      this.adminList.replaceChildren(el('div', { class: 'menu-hint', text: '다른 접속자가 없습니다.' }));
      return;
    }
    this.adminList.replaceChildren(...list.map((p) => {
      const row = el('div', { class: 'menu-info-row admin-row' }, [el('b', { text: p.admin ? `★ ${p.nickname}` : p.nickname })]);
      if (!p.admin) {
        const actions = el('span', { class: 'admin-actions' });
        const act = (label, action, extra, confirmText) => {
          const b = el('button', { class: 'chip', attrs: { type: 'button' }, text: label });
          b.addEventListener('click', () => {
            if (confirmText && b.dataset.confirm !== '1') {
              b.dataset.confirm = '1';
              b.textContent = confirmText;
              setTimeout(() => { b.dataset.confirm = ''; b.textContent = label; }, 3000);
              return;
            }
            this._doAdmin(action, p.nickname, extra);
          });
          return b;
        };
        actions.append(
          act('뮤트', 'mute', { minutes: 10 }),
          act('추방', 'kick', {}, '추방?'),
          act('차단', 'ban', {}, '차단?'),
          act('삭제', 'delchar', {}, '삭제?'),
        );
        row.append(actions);
      }
      return row;
    }));
  }

  async _doAdmin(action, target, extra = {}) {
    this.adminMsg.textContent = '처리 중…';
    const r = await this.h.onAdmin?.(action, target, extra);
    this.adminMsg.textContent = r?.message || '';
    if (r?.ok) setTimeout(() => { if (this.current === 'admin') this._syncAdmin(); this.adminMsg.textContent = r.message; }, 400);
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
      row('계정', this.h.getAccount?.()?.username || '-'),
      row('저장 위치', p.online ? '게임 서버' : '이 브라우저 (오프라인 모드)'),
    );
  }

  _buildPlayers() {
    this.playersBody = el('div', { class: 'menu-players' });
    return el('div', { class: 'menu-view hidden' }, [
      el('h3', { text: '접속자 목록' }),
      this.playersBody,
      el('button', { class: 'menu-btn', attrs: { type: 'button' }, text: '← 돌아가기', on: { click: () => this._show('main') } }),
    ]);
  }

  _syncPlayers() {
    const list = this.h.getPlayers?.() || [];
    this.playersBody.replaceChildren(
      el('div', { class: 'menu-hint', text: `현재 ${list.length}명` }),
      ...list.map((p) => {
        const r = el('div', { class: 'menu-info-row' }, [el('b', { text: p.self ? `${p.nickname} (나)` : p.nickname })]);
        if (!p.self) {
          r.append(el('button', { class: 'chip', attrs: { type: 'button' }, text: '귓속말', on: { click: () => this.h.onWhisper?.(p.nickname) } }));
        }
        return r;
      }),
    );
  }

  _buildSettings() {
    this.sensInput = el('input', { attrs: { type: 'range', min: '0.2', max: '3', step: '0.1' } });
    this.sensValue = el('span', { class: 'menu-value' });
    this.invertInput = el('input', { attrs: { type: 'checkbox' } });
    this.nameTagInput = el('input', { attrs: { type: 'checkbox' } });
    this.fpsInput = el('input', { attrs: { type: 'checkbox' } });
    this.soundInput = el('input', { attrs: { type: 'checkbox' } });
    this.quality = 'medium';

    const emit = () => {
      const s = {
        mouseSensitivity: Number(this.sensInput.value),
        invertY: this.invertInput.checked,
        quality: this.quality,
        showNameTags: this.nameTagInput.checked,
        showFps: this.fpsInput.checked,
        sound: this.soundInput.checked,
      };
      this.sensValue.textContent = `${s.mouseSensitivity.toFixed(1)}x`;
      this.h.onSettingsChange?.(s);
    };
    for (const input of [this.sensInput, this.invertInput, this.nameTagInput, this.fpsInput, this.soundInput]) {
      input.addEventListener('input', emit);
    }

    // 그래픽 품질 선택 (낮음 / 보통 / 높음)
    this.qualityBox = el('div', { class: 'menu-quality' });
    for (const [id, label] of [['low', '낮음'], ['medium', '보통'], ['high', '높음']]) {
      const b = el('button', { class: 'chip', attrs: { type: 'button', 'data-value': id }, text: label });
      b.addEventListener('click', () => { this.quality = id; this._syncQuality(); emit(); });
      this.qualityBox.append(b);
    }

    return el('div', { class: 'menu-view hidden' }, [
      el('h3', { text: '설정' }),
      el('div', { class: 'menu-row' }, [el('span', { text: '그래픽 품질' }), this.qualityBox]),
      el('div', { class: 'menu-hint', text: '높음: 실시간 그림자·거울 반사 (무거움)' }),
      el('label', { class: 'menu-row' }, [el('span', { text: '마우스 감도' }), this.sensInput, this.sensValue]),
      el('label', { class: 'menu-row' }, [el('span', { text: '카메라 상하 반전' }), this.invertInput]),
      el('label', { class: 'menu-row' }, [el('span', { text: '닉네임 표시' }), this.nameTagInput]),
      el('label', { class: 'menu-row' }, [el('span', { text: '효과음' }), this.soundInput]),
      el('label', { class: 'menu-row' }, [el('span', { text: 'FPS 표시' }), this.fpsInput]),
      el('button', { class: 'menu-btn', attrs: { type: 'button' }, text: '← 돌아가기', on: { click: () => this._show('main') } }),
    ]);
  }

  _syncQuality() {
    for (const b of this.qualityBox.children) b.classList.toggle('selected', b.dataset.value === this.quality);
  }

  _syncSettings() {
    const s = this.h.getSettings();
    this.sensInput.value = String(s.mouseSensitivity);
    this.sensValue.textContent = `${s.mouseSensitivity.toFixed(1)}x`;
    this.invertInput.checked = s.invertY;
    this.nameTagInput.checked = s.showNameTags;
    this.fpsInput.checked = s.showFps;
    this.soundInput.checked = s.sound !== false;
    this.quality = s.quality;
    this._syncQuality();
  }
}

function row(label, value) {
  return el('div', { class: 'menu-info-row' }, [el('span', { text: label }), el('b', { text: value })]);
}
