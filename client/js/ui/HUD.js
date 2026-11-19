// 게임 화면 HUD (DOM 오버레이)
// 좌상단: 닉네임/레벨 · 우상단: 접속자 수 · 좌하단: 채팅 자리 · 하단 중앙: 상호작용 안내 · 우하단: 상태
import { el } from './dom.js';

const ACTION_LABEL = { idle: '대기', walk: '걷는 중', run: '달리는 중', jump: '점프!' };

export class HUD {
  constructor(root) {
    this.root = el('div', { id: 'hud' });

    // 좌상단
    this.nameEl = el('div', { class: 'hud-name' });
    this.levelEl = el('div', { class: 'hud-level', text: 'Lv.1' });
    this.root.append(el('div', { class: 'hud-box hud-top-left' }, [this.levelEl, this.nameEl]));

    // 우상단
    this.onlineEl = el('div', { class: 'hud-online' });
    this.root.append(el('div', { class: 'hud-box hud-top-right' }, [this.onlineEl]));

    // 좌하단: 채팅 (ChatPanel 이 이 자리를 사용)
    this.chatSlot = el('div', { class: 'hud-chat-slot' });
    this.root.append(this.chatSlot);

    // 하단 중앙: 상호작용 안내
    this.promptEl = el('div', { class: 'hud-prompt hidden' });
    this.root.append(this.promptEl);

    // 우하단: 상태
    this.stateEl = el('div', { class: 'hud-state' });
    this.zoneEl = el('div', { class: 'hud-zone' });
    this.root.append(el('div', { class: 'hud-box hud-bottom-right' }, [
      el('div', { class: 'hud-title', text: '캐릭터 상태' }),
      this.stateEl,
      this.zoneEl,
      el('div', { class: 'hud-muted', text: '운동 기록·성장: Phase 4~5 예정' }),
    ]));

    // 조작 도움말 (처음 몇 초간 표시)
    this.helpEl = el('div', { class: 'hud-help' }, [
      el('span', { html: '<b>WASD</b> 이동' }),
      el('span', { html: '<b>Shift</b> 달리기' }),
      el('span', { html: '<b>Space</b> 점프' }),
      el('span', { html: '<b>드래그</b> 카메라' }),
      el('span', { html: '<b>휠</b> 줌' }),
      el('span', { html: '<b>E</b> 기구 이용' }),
      el('span', { html: '<b>F</b> 주먹 <b>G</b> 발차기' }),
      el('span', { html: '<b>Enter</b> 채팅' }),
      el('span', { html: '<b>ESC</b> 메뉴' }),
    ]);
    this.root.append(this.helpEl);

    this.fpsEl = el('div', { class: 'hud-fps hidden' });
    this.root.append(this.fpsEl);

    this.toastEl = el('div', { class: 'hud-toast hidden' });
    this.root.append(this.toastEl);

    root.append(this.root);
    this._lastState = '';
    this._lastZone = '';
    this._toastTimer = 0;
    setTimeout(() => this.helpEl.classList.add('fade'), 12000);
  }

  setPlayer(nickname, level = 1, admin = false) {
    this.nameEl.textContent = nickname;
    this.levelEl.textContent = `Lv.${level}`;
    if (admin && !this.adminEl) {
      this.adminEl = el('span', { class: 'admin-badge', text: '관리자' });
      this.nameEl.after(this.adminEl);
    }
  }

  /** @param {{count:number, max?:number, label?:string, state:'online'|'warn'|'offline'}} o */
  setOnline({ count, max, label, state }) {
    this.onlineEl.textContent = label ? `접속자 ${count}명 · ${label}` : `접속자 ${count}${max ? ` / ${max}` : ''}명`;
    this.onlineEl.dataset.state = state;
  }

  setPrompt(text) {
    if (!text) {
      this._lastPrompt = '';
      this.promptEl.classList.add('hidden');
      return;
    }
    if (this._lastPrompt !== text) { this.promptEl.innerHTML = text; this._lastPrompt = text; }
    this.promptEl.classList.remove('hidden');
  }

  setState(action, speed, zone) {
    const s = `${ACTION_LABEL[action] || action} · ${speed.toFixed(1)} m/s`;
    if (s !== this._lastState) { this.stateEl.textContent = s; this._lastState = s; }
    const z = `위치: ${zone}`;
    if (z !== this._lastZone) { this.zoneEl.textContent = z; this._lastZone = z; }
  }

  setFpsVisible(v) {
    this.fpsEl.classList.toggle('hidden', !v);
  }

  setFps(fps, drawCalls, triangles) {
    if (this.fpsEl.classList.contains('hidden')) return;
    this.fpsEl.textContent = `${Math.round(fps)} FPS · 드로우콜 ${drawCalls} · 삼각형 ${(triangles / 1000).toFixed(1)}k`;
  }

  toast(text, ms = 2600) {
    this.toastEl.textContent = text;
    this.toastEl.classList.remove('hidden');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => this.toastEl.classList.add('hidden'), ms);
  }

  setVisible(v) {
    this.root.classList.toggle('hidden', !v);
  }
}
