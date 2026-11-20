// 게임 화면 HUD (DOM 오버레이)
// 좌상단: 닉네임/레벨 · 우상단: 접속자 수 · 좌하단: 채팅 자리 · 하단 중앙: 상호작용 안내 · 우하단: 상태
import { el } from './dom.js';

const ACTION_LABEL = {
  idle: '대기', walk: '걷는 중', run: '달리는 중', jump: '점프!', sit: '쉬는 중',
  ex_tread: '러닝 중', ex_bench: '벤치프레스 중', ex_curl: '덤벨컬 중', ex_legpress: '레그프레스 중', ex_shoulder: '숄더프레스 중', ex_lat: '랫풀다운 중',
};

export class HUD {
  constructor(root) {
    this.root = el('div', { id: 'hud' });

    // 좌상단
    this.nameEl = el('div', { class: 'hud-name' });
    this.levelEl = el('div', { class: 'hud-level', text: 'Lv.1' });
    this.root.append(el('div', { class: 'hud-box hud-top-left' }, [this.levelEl, this.nameEl]));
    // 코인 (누르면 상점)
    this.coinVal = el('span', { text: '0' });
    this.coinBtn = el('button', { class: 'hud-coins hidden', attrs: { type: 'button', title: '치장 상점 열기' } }, [el('span', { text: '🪙' }), this.coinVal, el('span', { class: 'hud-coins-shop', text: '?' })]);
    this.coinBtn.addEventListener('click', () => this.onCoinClick?.());
    this.bagBtn = el('button', { class: 'hud-quick-btn', attrs: { type: 'button', title: '가방 (I)' }, html: '🎒 <span>가방</span><kbd>I</kbd>' });
    this.bagBtn.addEventListener('click', () => this.onBagClick?.());
    this.quick = el('div', { class: 'hud-quick hidden' }, [this.coinBtn, this.bagBtn]);
    this.coinBtn.classList.remove('hidden');
    this.root.append(this.quick);

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
      el('span', { html: '<b>클릭</b> 마우스 시점 (<b>Esc</b> 해제)' }),
      el('span', { html: '<b>휠</b> 줌' }),
      el('span', { html: '<b>E</b> 기구 이용' }),
      el('span', { html: '<b>I</b> 가방' }),
      this.attackHelp = el('span', { html: '<b>좌클릭/J</b> 주먹 <b>우클릭/K</b> 발차기' }),
      el('span', { html: '<b>Enter</b> 채팅' }),
      el('span', { html: '<b>ESC</b> 메뉴' }),
    ]);
    this.root.append(this.helpEl);

    this.fpsEl = el('div', { class: 'hud-fps hidden' });
    this.root.append(this.fpsEl);

    // 마우스 시점: 가운데 조준점 + 잠기기 전 안내
    this.crosshair = el('div', { class: 'hud-crosshair hidden' });
    this.lookHint = el('div', { class: 'hud-look-hint hidden', html: '🖱️ 화면을 <b>클릭</b>하면 마우스 시점 (좌클릭 주먹 · 우클릭 발차기) · <b>Esc</b> 로 마우스 꺼내기' });
    this.root.append(this.crosshair, this.lookHint);

    this.toastEl = el('div', { class: 'hud-toast hidden' });
    this.root.append(this.toastEl);

    // 득근 타워: 위쪽 가운데 진행 표시 + 버튼 (체크포인트로 / 헬스장으로)
    this.towerStage = el('div', { class: 'tw-stage' });
    this.towerTime = el('div', { class: 'tw-time', text: '0:00.0' });
    this.towerBest = el('div', { class: 'tw-best' });
    this.towerCpBtn = el('button', { class: 'tw-btn', attrs: { type: 'button', title: '마지막 체크포인트로 (R)' }, html: '↺ <span>체크포인트</span><kbd>R</kbd>' });
    this.towerExitBtn = el('button', { class: 'tw-btn', attrs: { type: 'button', title: '헬스장으로 돌아가기' }, html: '🏋️ <span>헬스장</span>' });
    this.towerCpBtn.addEventListener('click', () => this.onTowerRespawn?.());
    this.towerExitBtn.addEventListener('click', () => this.onTowerExit?.());
    this.towerEl = el('div', { class: 'hud-tower hidden' }, [
      el('div', { class: 'tw-info' }, [this.towerStage, this.towerTime, this.towerBest]),
      el('div', { class: 'tw-btns' }, [this.towerCpBtn, this.towerExitBtn]),
    ]);
    this.root.append(this.towerEl);

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
    // 모바일은 짧게 (채팅창과 겹치지 않게)
    if (document.body.classList.contains('mobile')) {
      this.onlineEl.textContent = label ? `👥 ${count} · ${label.replace(' 모드', '')}` : `👥 ${count}${max ? `/${max}` : ''}`;
    } else {
      this.onlineEl.textContent = label ? `접속자 ${count}명 · ${label}` : `접속자 ${count}${max ? ` / ${max}` : ''}명`;
    }
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

  setAttackKeys(punch, kick) {
    if (this.attackHelp) this.attackHelp.innerHTML = `<b>좌클릭/${escapeHtml(punch)}</b> 주먹 <b>우클릭/${escapeHtml(kick)}</b> 발차기`;
  }

  /**
   * 성능 표시: FPS 가 낮으면 그래픽(내 기기) 문제, 핑이 높으면 네트워크/서버 문제
   */
  setFps(fps, drawCalls, triangles, ping, pixelRatio) {
    if (this.fpsEl.classList.contains('hidden')) return;
    const pingText = ping === undefined ? '' : ` · 핑 ${ping == null ? '-' : `${ping}ms`}`;
    this.fpsEl.textContent = `${Math.round(fps)} FPS${pingText} · 해상도 ${Math.round(pixelRatio * 100)}% · 드로우콜 ${drawCalls} · 삼각형 ${(triangles / 1000).toFixed(1)}k`;
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

  /** 화면 가운데 위쪽에 잠깐 떠오르는 문구 (PERFECT! / MISS) */
  pop(text, color = '#ffffff') {
    const p = el('div', { class: 'hud-pop', text });
    p.style.color = color;
    this.root.append(p);
    setTimeout(() => p.remove(), 900);
  }

  /** 마우스 시점 표시: 켜져 있는데 아직 안 잠겼으면 안내, 잠겼으면 조준점 */
  setMouseLook(enabled, locked) {
    this.crosshair.classList.toggle('hidden', !(enabled && locked));
    this.lookHint.classList.toggle('hidden', !(enabled && !locked));
  }

  /** 타워 진행 표시 (null 이면 숨김) */
  setTower(info) {
    this.towerEl.classList.toggle('hidden', !info);
    document.body.classList.toggle('in-tower', !!info);
    if (!info) return;
    const t = info.done ? `🏆 정상 도착!` : `STAGE ${Math.min(info.stage + 1, info.total)}/${info.total} · ${info.name}`;
    if (this.towerStage.textContent !== t) this.towerStage.textContent = t;
    const b = info.best ? `최고 ${info.best}` : '';
    if (this.towerBest.textContent !== b) this.towerBest.textContent = b;
  }

  setTowerTime(text, done = false) {
    if (this.towerTime.textContent !== text) this.towerTime.textContent = text;
    this.towerTime.classList.toggle('done', done);
  }

  /** 화면 전체가 잠깐 번쩍 (함정에 닿음 / 포탈) */
  flash(color = 'rgba(255,60,90,0.45)') {
    const f = el('div', { class: 'hud-flash' });
    f.style.background = color;
    this.root.append(f);
    setTimeout(() => f.remove(), 450);
  }

  /** 코인 표시 (null 이면 숨김 = 오프라인) */
  setCoins(n) {
    this.quick.classList.toggle('hidden', n === null);
    if (n !== null) this.coinVal.textContent = Number(n).toLocaleString();
  }

  /** "+1" 이 코인 표시 옆에서 떠오름 */
  coinPop(n) {
    const pop = el('div', { class: 'coin-pop', text: `+${n}` });
    this.coinBtn.append(pop);
    this.coinBtn.classList.remove('bump');
    void this.coinBtn.offsetWidth;
    this.coinBtn.classList.add('bump');
    setTimeout(() => pop.remove(), 900);
  }
}

function escapeHtml(t) {
  return String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
