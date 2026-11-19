// 로그인 / 회원가입 화면 + 캐릭터 선택 화면
import { el } from './dom.js';
import { getCharacterPreview } from './CharacterPreview.js';
import { validateUsername, validatePassword } from '../shared/protocol.js';
import { DEFAULT_APPEARANCE } from '../shared/appearance.js';

// ── 로그인 ─────────────────────────────────────────────────
export class LoginScreen {
  constructor(root) {
    this.mode = 'login';
    this.tabLogin = el('button', { class: 'auth-tab selected', attrs: { type: 'button' }, text: '로그인', on: { click: () => this._setMode('login') } });
    this.tabRegister = el('button', { class: 'auth-tab', attrs: { type: 'button' }, text: '회원가입', on: { click: () => this._setMode('register') } });
    this.user = el('input', { class: 'auth-input', attrs: { type: 'text', placeholder: '아이디 (영문/숫자 4~16자)', autocomplete: 'username', autocapitalize: 'off', spellcheck: 'false', maxlength: '16' } });
    this.pass = el('input', { class: 'auth-input', attrs: { type: 'password', placeholder: '비밀번호 (6자 이상)', autocomplete: 'current-password', maxlength: '64' } });
    this.pass2 = el('input', { class: 'auth-input hidden', attrs: { type: 'password', placeholder: '비밀번호 확인', autocomplete: 'new-password', maxlength: '64' } });
    this.error = el('div', { class: 'creator-error' });
    this.status = el('div', { class: 'auth-status' });
    this.submit = el('button', { class: 'btn btn-primary auth-submit', attrs: { type: 'submit' }, text: '로그인' });
    this.offlineBtn = el('button', { class: 'auth-link', attrs: { type: 'button' }, text: '서버 없이 오프라인으로 둘러보기' });

    const form = el('form', { class: 'auth-form' }, [this.user, this.pass, this.pass2, this.error, this.submit]);
    form.addEventListener('submit', (e) => { e.preventDefault(); this._submit(); });
    for (const i of [this.user, this.pass, this.pass2]) i.addEventListener('input', () => { this.error.textContent = ''; });

    this.overlay = el('div', { id: 'login', class: 'overlay screen hidden' }, [
      el('div', { class: 'auth-panel' }, [
        el('div', { class: 'logo logo-big', html: 'ONLINE <span>GYM</span>' }),
        el('p', { class: 'auth-sub', text: '동글동글 친구들과 함께하는 3D 헬스장' }),
        el('div', { class: 'auth-tabs' }, [this.tabLogin, this.tabRegister]),
        form,
        this.status,
        this.offlineBtn,
      ]),
    ]);
    root.append(this.overlay);
  }

  /**
   * @param {{onLogin:Function, onRegister:Function, error?:string, status?:string}} h
   *   onLogin/onRegister(username, password) → Promise<오류문구|null>
   * @returns {Promise<'ok'|'offline'>}
   */
  open(h) {
    this.h = h;
    this.error.textContent = h.error || '';
    this.status.textContent = h.status || '';
    this.overlay.classList.remove('hidden');
    if (!window.matchMedia('(pointer: coarse)').matches) setTimeout(() => this.user.focus(), 50);
    return new Promise((resolve) => {
      this._resolve = resolve;
      this.offlineBtn.onclick = () => { this.close(); resolve('offline'); };
    });
  }

  setStatus(text) {
    this.status.textContent = text;
  }

  close() {
    this.overlay.classList.add('hidden');
  }

  _setMode(m) {
    this.mode = m;
    this.tabLogin.classList.toggle('selected', m === 'login');
    this.tabRegister.classList.toggle('selected', m === 'register');
    this.pass2.classList.toggle('hidden', m !== 'register');
    this.pass.setAttribute('autocomplete', m === 'register' ? 'new-password' : 'current-password');
    this.submit.textContent = m === 'register' ? '가입하고 시작하기' : '로그인';
    this.error.textContent = '';
  }

  async _submit() {
    const u = validateUsername(this.user.value);
    if (!u.ok) { this.error.textContent = u.error; return; }
    const p = validatePassword(this.pass.value);
    if (!p.ok) { this.error.textContent = p.error; return; }
    if (this.mode === 'register' && this.pass.value !== this.pass2.value) {
      this.error.textContent = '비밀번호 확인이 일치하지 않습니다.';
      return;
    }
    this.submit.disabled = true;
    const fn = this.mode === 'register' ? this.h.onRegister : this.h.onLogin;
    let err = null;
    try {
      err = await fn(u.value, this.pass.value);
    } catch (e) {
      err = e?.message || '오류가 발생했습니다.';
    }
    this.submit.disabled = false;
    if (err) {
      this.error.textContent = err;
      return;
    }
    this.pass.value = '';
    this.pass2.value = '';
    this.close();
    this._resolve('ok');
  }
}

// ── 캐릭터 선택 ─────────────────────────────────────────────
export class CharacterSelect {
  constructor(root) {
    this.accountEl = el('div', { class: 'select-account' });
    this.slots = el('div', { class: 'select-slots' });
    this.error = el('div', { class: 'creator-error' });
    this.enterBtn = el('button', { class: 'btn btn-primary', attrs: { type: 'button' }, text: '헬스장 입장하기' });
    this.editBtn = el('button', { class: 'btn', attrs: { type: 'button' }, text: '꾸미기' });
    this.deleteBtn = el('button', { class: 'btn btn-danger', attrs: { type: 'button' }, text: '삭제' });
    this.logoutBtn = el('button', { class: 'auth-link', attrs: { type: 'button' }, text: '로그아웃' });
    this.previewSlot = el('div', { class: 'creator-preview select-preview' });
    this.nameEl = el('div', { class: 'select-name' });

    this.overlay = el('div', { id: 'select', class: 'overlay screen hidden' }, [
      el('div', { class: 'creator-wrap' }, [
        el('div', { class: 'creator-panel select-panel' }, [
          el('div', { class: 'logo', html: 'ONLINE <span>GYM</span>' }),
          el('div', { class: 'select-head' }, [this.accountEl, this.logoutBtn]),
          el('h2', { class: 'creator-title', text: '캐릭터 선택' }),
          this.slots,
          this.error,
          el('div', { class: 'creator-actions' }, [this.deleteBtn, this.editBtn, this.enterBtn]),
        ]),
        el('div', { class: 'select-right' }, [this.previewSlot, this.nameEl]),
      ]),
    ]);
    root.append(this.overlay);
    this.preview = getCharacterPreview();
  }

  /**
   * @param {{account:{username:string,isAdmin:boolean}, characters:Array, max:number,
   *          onCreate:Function, onEdit:Function, onDelete:Function}} o
   *   onCreate() → Promise<character|null>, onEdit(c) → Promise<character|null>, onDelete(c) → Promise<오류|null>
   * @returns {Promise<{character:object}|{logout:true}>}
   */
  open(o) {
    this.o = o;
    this.list = [...o.characters];
    this.selected = this.list[0] || null;
    this.accountEl.replaceChildren(
      el('span', { text: `👤 ${o.account.username}` }),
      ...(o.account.isAdmin ? [el('span', { class: 'admin-badge', text: '관리자' })] : []),
    );
    this.error.textContent = '';
    this._render();
    this.overlay.classList.remove('hidden');
    this.preview.mount(this.previewSlot);
    this._syncPreview();
    return new Promise((resolve) => {
      this._resolve = resolve;
      this.enterBtn.onclick = () => {
        if (!this.selected) return;
        this.close();
        resolve({ character: this.selected });
      };
      this.logoutBtn.onclick = () => { this.close(); resolve({ logout: true }); };
      this.editBtn.onclick = () => this._edit();
      this.deleteBtn.onclick = () => this._delete();
    });
  }

  close() {
    this.overlay.classList.add('hidden');
    this.preview.stop();
  }

  _render() {
    const cards = this.list.map((c) => {
      const card = el('button', { class: `slot${c === this.selected ? ' selected' : ''}`, attrs: { type: 'button' } }, [
        el('span', { class: 'slot-dots' }, [c.appearance.topColor, c.appearance.hairColor, c.appearance.skin].map((col) => el('i', { style: { background: col } }))),
        el('b', { text: c.nickname }),
        el('small', { text: `Lv.${c.level || 1}` }),
      ]);
      card.addEventListener('click', () => { this.selected = c; this._confirmDelete = false; this._render(); this._syncPreview(); });
      card.addEventListener('dblclick', () => this.enterBtn.click());
      return card;
    });
    for (let i = this.list.length; i < this.o.max; i++) {
      cards.push(el('button', {
        class: 'slot slot-empty', attrs: { type: 'button' }, text: '+ 새 캐릭터 만들기', on: { click: () => this._create() },
      }));
    }
    this.slots.replaceChildren(...cards);
    const has = !!this.selected;
    this.enterBtn.disabled = !has;
    this.editBtn.disabled = !has;
    this.deleteBtn.disabled = !has;
    this.deleteBtn.textContent = this._confirmDelete ? '정말 삭제?' : '삭제';
    this.nameEl.textContent = has ? this.selected.nickname : '캐릭터를 만들어 주세요';
  }

  _syncPreview() {
    this.preview.setVisible(!!this.selected);
    this.preview.setAppearance(this.selected ? this.selected.appearance : DEFAULT_APPEARANCE);
  }

  async _create() {
    this.overlay.classList.add('hidden');
    const c = await this.o.onCreate();
    this.overlay.classList.remove('hidden');
    this.preview.mount(this.previewSlot);
    if (c) {
      this.list.push(c);
      this.selected = c;
    }
    this._render();
    this._syncPreview();
  }

  async _edit() {
    if (!this.selected) return;
    this.overlay.classList.add('hidden');
    const c = await this.o.onEdit(this.selected);
    this.overlay.classList.remove('hidden');
    this.preview.mount(this.previewSlot);
    if (c) {
      Object.assign(this.selected, c);
    }
    this._render();
    this._syncPreview();
  }

  async _delete() {
    if (!this.selected) return;
    if (!this._confirmDelete) {
      this._confirmDelete = true;
      this._render();
      setTimeout(() => { if (this._confirmDelete) { this._confirmDelete = false; this._render(); } }, 3000);
      return;
    }
    this._confirmDelete = false;
    const err = await this.o.onDelete(this.selected);
    if (err) {
      this.error.textContent = err;
    } else {
      this.list = this.list.filter((c) => c !== this.selected);
      this.selected = this.list[0] || null;
    }
    this._render();
    this._syncPreview();
  }
}
