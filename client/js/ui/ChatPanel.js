// 마인크래프트 스타일 채팅창 (좌측 하단)
// - Enter: 입력창 열기 / 보내기,  /: 명령어 입력 시작,  ESC: 닫기
// - 닉네임 클릭 → 귓속말 시작 (/w 닉네임 )
// - [전체] 탭: 전체 채팅 + 내 귓속말 + 시스템 메시지, 위로 "이전 기록 불러오기"
// - [귓속말] 탭: 대화 상대별 귓속말 기록 조회
// - 모든 메시지는 textContent 로만 표시 (HTML 삽입 없음 → XSS 안전)
import { el } from './dom.js';
import { EV, CHAT_MAX_LENGTH, CHAT_TYPES } from '../shared/protocol.js';

const MAX_DOM_MESSAGES = 300;

function fmtTime(ms) {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export class ChatPanel {
  /**
   * @param {HTMLElement} slot HUD 의 채팅 자리
   * @param {{onFocusChange:(focused:boolean)=>void}} handlers
   */
  constructor(slot, handlers = {}) {
    this.h = handlers;
    this.expanded = false;
    this.net = null;
    this.selfName = '';
    this.seenIds = new Set();
    this.seenKeys = new Set(); // id 가 없는(바로 전송된) 메시지와 나중에 불러온 기록의 중복 방지
    this.pendingMine = []; // 보내자마자 내 화면에 먼저 보여준 메시지 (서버 응답이 오면 교체)
    this.oldestGlobalId = null;
    this.collapsed = false;
    this.unread = 0;
    this.tab = 'all';
    this.partner = null;
    this._idleTimer = 0;

    // 머리줄
    this.tabAll = el('button', { class: 'chat-tab selected', attrs: { type: 'button' }, text: '전체', on: { click: () => this.setTab('all') } });
    this.tabWhisper = el('button', { class: 'chat-tab', attrs: { type: 'button' }, text: '귓속말', on: { click: () => this.setTab('whisper') } });
    this.unreadEl = el('span', { class: 'chat-unread hidden' });
    this.toggleBtn = el('button', { class: 'chat-toggle', attrs: { type: 'button', title: '채팅창 접기/펼치기' }, text: '▾', on: { click: () => this.setCollapsed(!this.collapsed) } });
    // 모바일: 채팅 모드(크게 보기) 전환 버튼
    this.expandBtn = el('button', { class: `chat-toggle chat-expand${handlers.mobile ? '' : ' hidden'}`, attrs: { type: 'button', title: '채팅 모드' }, text: '⤢', on: { click: () => this.setExpanded(!this.expanded) } });
    const head = el('div', { class: 'chat-head' }, [this.tabAll, this.tabWhisper, this.unreadEl, el('span', { class: 'chat-spacer' }), this.expandBtn, this.toggleBtn]);

    // 전체 로그
    this.moreBtn = el('button', { class: 'chat-more', attrs: { type: 'button' }, text: '↑ 이전 기록 불러오기', on: { click: () => this.loadOlder() } });
    this.logAll = el('div', { class: 'chat-log' }, [this.moreBtn]);

    // 귓속말 로그
    this.partnersEl = el('div', { class: 'chat-partners' });
    this.whisperMoreBtn = el('button', { class: 'chat-more hidden', attrs: { type: 'button' }, text: '↑ 이전 귓속말', on: { click: () => this.loadWhispers(true) } });
    this.whisperLog = el('div', { class: 'chat-log-inner' }, [this.whisperMoreBtn]);
    this.logWhisper = el('div', { class: 'chat-log hidden' }, [this.partnersEl, this.whisperLog]);

    // 입력
    this.input = el('input', {
      class: 'chat-input',
      attrs: { type: 'text', maxlength: String(CHAT_MAX_LENGTH), placeholder: 'Enter 로 채팅 · /help 명령어', autocomplete: 'off', spellcheck: 'false' },
    });
    this.input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        e.preventDefault();
        this.submit();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        this.input.value = '';
        this.blur();
      }
    });
    // 보내기 버튼 (모바일 키보드에서 엔터가 불편할 때). 누를 때 입력창 포커스가 풀리지 않게 함
    this.sendBtn = el('button', { class: 'chat-send', attrs: { type: 'button', 'aria-label': '보내기' }, text: '전송' });
    this.sendBtn.addEventListener('pointerdown', (e) => e.preventDefault());
    this.sendBtn.addEventListener('click', () => this.submit());
    this.input.addEventListener('focus', () => { this.root.classList.add('active'); this.h.onFocusChange?.(true); this._wake(); });
    this.input.addEventListener('blur', () => { this.root.classList.remove('active'); this.h.onFocusChange?.(false); this._wake(); });

    this.body = el('div', { class: 'chat-body' }, [this.logAll, this.logWhisper]);
    this.inputRow = el('div', { class: 'chat-input-row' }, [this.input, this.sendBtn]);
    this.root = el('div', { class: 'chat' }, [head, this.body, this.inputRow]);
    // 채팅 내용을 누르면: 모바일은 채팅 열기 + 바로 입력, PC 는 바로 입력
    this.body.addEventListener('click', (e) => {
      if (e.target.closest('button, .chat-name')) return;
      if (this.h.mobile && !this.expanded) this.setExpanded(true);
      else if (!this.isFocused() && !this.input.disabled) this.focus();
    });
    this.root.addEventListener('pointerenter', () => this._wake());
    slot.replaceChildren(this.root);
    this._wake();
  }

  // ── 연결 ───────────────────────────────────────────────
  /** @param {import('../net/NetworkClient.js').NetworkClient|null} net */
  attach(net, selfName) {
    this.net = net;
    this.selfName = selfName;
    this.setEnabled(!!net);
  }

  setEnabled(enabled, reason = '') {
    this.input.disabled = !enabled;
    this.input.placeholder = enabled ? 'Enter 로 채팅 · /help 명령어' : (reason || '오프라인 모드 — 채팅을 사용할 수 없습니다');
    this.moreBtn.classList.toggle('hidden', !enabled);
  }

  /** 접속/재접속 직후 받은 기록 반영 (중복 제거) */
  loadInitial(messages) {
    for (const m of messages) this.addMessage(m, { silent: true });
    if (this.oldestGlobalId === null) this.moreBtn.classList.add('hidden');
    this._scrollBottom(this.logAll);
  }

  // ── 표시 ───────────────────────────────────────────────
  addMessage(m, { silent = false, prepend = false } = {}) {
    if (m.type === CHAT_TYPES.GLOBAL || m.type === CHAT_TYPES.WHISPER) {
      const key = `${m.type}|${m.time}|${m.from}|${m.text}`;
      if (this.seenKeys.has(key)) return;
      this.seenKeys.add(key);
      if (this.seenKeys.size > 2000) this.seenKeys.clear();
      // 내가 보낸 메시지가 서버를 거쳐 돌아오면, 먼저 보여준 임시 줄을 지움
      if (m.from === this.selfName && m.type === CHAT_TYPES.GLOBAL) {
        const i = this.pendingMine.findIndex((pm) => pm.text === m.text);
        if (i >= 0) { this.pendingMine[i].el.remove(); this.pendingMine.splice(i, 1); }
      }
    }
    if (m.id != null) {
      if (this.seenIds.has(m.id)) return;
      this.seenIds.add(m.id);
      if (m.type === CHAT_TYPES.GLOBAL && (this.oldestGlobalId === null || m.id < this.oldestGlobalId)) this.oldestGlobalId = m.id;
    }
    const line = this._renderLine(m);
    const nearBottom = this._isNearBottom(this.logAll);
    if (prepend) this.moreBtn.after(line);
    else this.logAll.append(line);

    // DOM 개수 제한
    while (this.logAll.childElementCount > MAX_DOM_MESSAGES + 1) {
      const victim = prepend ? this.logAll.lastElementChild : this.moreBtn.nextElementSibling;
      victim.remove();
    }
    if (!prepend && (nearBottom || m.from === this.selfName)) this._scrollBottom(this.logAll);

    if (!silent && !prepend) {
      if (this.collapsed || this.tab !== 'all') {
        this.unread++;
        this.unreadEl.textContent = String(this.unread);
        this.unreadEl.classList.remove('hidden');
      }
      // 현재 보고 있는 귓속말 상대와의 대화면 귓속말 탭에도 추가
      if (m.type === CHAT_TYPES.WHISPER && this.partner && (m.from === this.partner || m.to === this.partner)) {
        this.whisperLog.append(this._renderLine(m));
        this._scrollBottom(this.logWhisper);
      }
      this._wake();
    }
  }

  _renderLine(m) {
    const line = el('div', { class: `chat-line chat-${m.type}` });
    line.append(el('span', { class: 'chat-time', text: fmtTime(m.time) }));
    if (m.type === CHAT_TYPES.SYSTEM) {
      line.append(el('span', { class: 'chat-text', text: m.text }));
      return line;
    }
    if (m.type === CHAT_TYPES.NOTICE) {
      line.append(el('span', { class: 'chat-badge chat-badge-notice', text: '공지' }), el('span', { class: 'chat-text', text: m.text }));
      return line;
    }
    if (m.type === CHAT_TYPES.WHISPER) {
      line.append(el('span', { class: 'chat-badge', text: '귓속말' }));
      line.append(this._nameEl(m.from), el('span', { class: 'chat-arrow', text: '→' }), this._nameEl(m.to));
    } else {
      if (m.admin) line.append(el('span', { class: 'chat-badge chat-badge-admin', text: '관리자' }));
      line.append(this._nameEl(m.from));
    }
    line.append(el('span', { class: 'chat-sep', text: ':' }), el('span', { class: 'chat-text', text: m.text }));
    return line;
  }

  _nameEl(name) {
    const self = name === this.selfName;
    if (!name || name.startsWith('(')) return el('span', { class: 'chat-name deleted', text: name || '?' });
    const n = el('span', { class: `chat-name${self ? ' self' : ''}`, text: self ? `${name}(나)` : name });
    if (!self) {
      n.title = `${name}님에게 귓속말`;
      n.addEventListener('click', () => this.startWhisper(name));
    }
    return n;
  }

  system(text) {
    this.addMessage({ id: null, type: CHAT_TYPES.SYSTEM, text, time: Date.now() });
  }

  // ── 입력 ───────────────────────────────────────────────
  focus(prefill = null) {
    if (this.input.disabled) return;
    if (this.collapsed) this.setCollapsed(false);
    if (prefill !== null) this.input.value = prefill;
    this.input.focus();
    const len = this.input.value.length;
    this.input.setSelectionRange(len, len);
  }

  blur() {
    this.input.blur();
  }

  isFocused() {
    return document.activeElement === this.input;
  }

  startWhisper(nickname) {
    this.focus(`/w ${nickname} `);
  }

  submit() {
    const text = this.input.value.trim();
    if (text && this.net) {
      if (!this.net.sendChat(text)) this.system('서버와 연결되어 있지 않아 메시지를 보내지 못했습니다.');
      else if (!text.startsWith('/')) this._echoMine(text);
    }
    // 마인크래프트처럼 보내고 나면 입력창을 닫아 바로 이동할 수 있게 함 (답장은 /r 메시지)
    this.input.value = '';
    // 모바일 채팅 화면에서는 계속 대화하도록 키보드 유지, PC 는 마인크래프트처럼 바로 이동할 수 있게 닫음
    if (this.expanded && this.h.mobile) this.input.focus();
    else this.blur();
  }

  /** 보내자마자 내 화면에 먼저 표시 (서버 확인 전이라 살짝 흐리게) */
  _echoMine(text) {
    const line = this._renderLine({ type: CHAT_TYPES.GLOBAL, from: this.selfName, text, time: Date.now() });
    line.classList.add('pending');
    this.logAll.append(line);
    this._scrollBottom(this.logAll);
    const entry = { text, el: line };
    this.pendingMine.push(entry);
    // 서버에서 거절(도배·채팅 금지 등)되면 응답이 안 오므로 잠시 뒤 지움
    setTimeout(() => {
      const i = this.pendingMine.indexOf(entry);
      if (i >= 0) { entry.el.remove(); this.pendingMine.splice(i, 1); }
    }, 6000);
  }

  // ── 이전 기록 ─────────────────────────────────────────
  async loadOlder() {
    if (!this.net || this.oldestGlobalId === null) return;
    this.moreBtn.disabled = true;
    try {
      const list = await this.net.request(EV.CHAT_HISTORY, { beforeId: this.oldestGlobalId });
      const prevHeight = this.logAll.scrollHeight;
      for (let i = list.length - 1; i >= 0; i--) this.addMessage(list[i], { silent: true, prepend: true });
      this.logAll.scrollTop += this.logAll.scrollHeight - prevHeight; // 읽던 위치 유지
      if (list.length === 0) {
        this.moreBtn.textContent = '더 이전 기록이 없습니다';
        return;
      }
    } catch {
      this.system('이전 기록을 불러오지 못했습니다.');
    } finally {
      this.moreBtn.disabled = this.moreBtn.textContent.startsWith('더 이전');
    }
  }

  // ── 탭 / 귓속말 기록 ──────────────────────────────────
  setTab(tab) {
    this.tab = tab;
    this.tabAll.classList.toggle('selected', tab === 'all');
    this.tabWhisper.classList.toggle('selected', tab === 'whisper');
    this.logAll.classList.toggle('hidden', tab !== 'all');
    this.logWhisper.classList.toggle('hidden', tab !== 'whisper');
    if (this.collapsed) this.setCollapsed(false);
    if (tab === 'all') {
      this._clearUnread();
      this._scrollBottom(this.logAll);
    } else {
      this.loadPartners();
    }
  }

  async loadPartners() {
    this.partnersEl.replaceChildren(el('span', { class: 'chat-hint', text: '불러오는 중…' }));
    if (!this.net) {
      this.partnersEl.replaceChildren(el('span', { class: 'chat-hint', text: '오프라인 모드' }));
      return;
    }
    try {
      const partners = await this.net.request(EV.CHAT_PARTNERS, {});
      if (!partners.length) {
        this.partnersEl.replaceChildren(el('span', { class: 'chat-hint', text: '귓속말 기록이 없습니다. 닉네임을 클릭하거나 /w 닉네임 메시지 로 보내보세요.' }));
        return;
      }
      this.partnersEl.replaceChildren(...partners.map((p) => {
        const b = el('button', { class: `chat-partner${p.nickname === this.partner ? ' selected' : ''}`, attrs: { type: 'button' }, text: p.nickname });
        b.addEventListener('click', () => { this.partner = p.nickname; this.loadPartners(); this.loadWhispers(false); });
        return b;
      }));
    } catch {
      this.partnersEl.replaceChildren(el('span', { class: 'chat-hint', text: '목록을 불러오지 못했습니다.' }));
    }
  }

  async loadWhispers(older) {
    if (!this.net || !this.partner) return;
    const beforeId = older ? this._oldestWhisperId : undefined;
    try {
      const list = await this.net.request(EV.CHAT_WHISPERS, { nickname: this.partner, beforeId });
      if (!older) {
        this.whisperLog.replaceChildren(this.whisperMoreBtn);
        this._oldestWhisperId = undefined;
      }
      const lines = list.map((m) => this._renderLine(m));
      this.whisperMoreBtn.after(...lines);
      if (list.length) this._oldestWhisperId = list[0].id;
      this.whisperMoreBtn.classList.toggle('hidden', list.length < 50);
      if (!older) this._scrollBottom(this.logWhisper);
      if (!older && !list.length) this.whisperLog.append(el('div', { class: 'chat-hint', text: '아직 나눈 귓속말이 없습니다.' }));
    } catch {
      this.whisperLog.append(el('div', { class: 'chat-hint', text: '기록을 불러오지 못했습니다.' }));
    }
  }

  /** 모바일 채팅 모드: 채팅창을 화면 대부분으로 크게 */
  setExpanded(v) {
    if (this.expanded === v) return;
    this.expanded = v;
    this.root.classList.toggle('expanded', v);
    this.expandBtn.textContent = v ? '✕' : '⤢';
    if (v && this.collapsed) this.setCollapsed(false);
    if (!v) this.blur();
    this._scrollBottom(this.tab === 'all' ? this.logAll : this.logWhisper);
    this.h.onExpandChange?.(v);
    // 모바일: 채팅을 열면 바로 입력 (터치 이벤트 안에서 호출되므로 키보드가 올라옴)
    if (v && this.h.mobile && !this.input.disabled) this.focus();
  }

  // ── 접기 / 흐리게 ─────────────────────────────────────
  setCollapsed(v) {
    this.collapsed = v;
    this.root.classList.toggle('collapsed', v);
    this.toggleBtn.textContent = v ? '▴' : '▾';
    if (!v && this.tab === 'all') {
      this._clearUnread();
      this._scrollBottom(this.logAll);
    }
  }

  _clearUnread() {
    this.unread = 0;
    this.unreadEl.classList.add('hidden');
  }

  /** 한동안 아무 일이 없으면 채팅창을 반투명하게 (게임 화면을 덜 가리도록) */
  _wake() {
    this.root.classList.remove('idle');
    clearTimeout(this._idleTimer);
    this._idleTimer = setTimeout(() => {
      if (!this.isFocused()) this.root.classList.add('idle');
    }, 8000);
  }

  _isNearBottom(box) {
    return box.scrollHeight - box.scrollTop - box.clientHeight < 40;
  }

  _scrollBottom(box) {
    box.scrollTop = box.scrollHeight;
  }
}
