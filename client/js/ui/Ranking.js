// 오늘의 랭킹 창 (운동 시간 · 샌드백 명중) — 하루 기준은 한국 시간 자정
import { el } from './dom.js';

export function formatSeconds(s) {
  const n = Math.max(0, Math.floor(s));
  const h = Math.floor(n / 3600);
  const m = Math.floor((n % 3600) / 60);
  const sec = n % 60;
  if (h) return `${h}시간 ${m}분`;
  if (m) return `${m}분 ${sec}초`;
  return `${sec}초`;
}

export class RankingPanel {
  /**
   * @param {HTMLElement} root
   * @param {{fetch:()=>Promise<object>, selfId:()=>number|null, onClose:Function}} h
   */
  constructor(root, h) {
    this.h = h;
    this.exList = el('ol', { class: 'rank-list' });
    this.bagList = el('ol', { class: 'rank-list' });
    this.meEl = el('div', { class: 'rank-me' });
    this.dayEl = el('span', { class: 'rank-day' });
    const panel = el('div', { class: 'rank-panel' }, [
      el('div', { class: 'shop-head' }, [
        el('h2', {}, ['🏆 오늘의 랭킹 ', this.dayEl]),
        el('button', { class: 'btn', attrs: { type: 'button' }, text: '닫기 (Esc)', on: { click: () => this.close() } }),
      ]),
      el('div', { class: 'rank-cols' }, [
        el('div', { class: 'rank-col' }, [el('h3', { text: '💪 운동 시간' }), this.exList]),
        el('div', { class: 'rank-col' }, [el('h3', { text: '🥊 샌드백 명중' }), this.bagList]),
      ]),
      this.meEl,
      el('div', { class: 'shop-earn', text: '기구 운동 중인 시간과 샌드백을 정면에서 맞힌 횟수를 서버가 세어요. 매일 자정(한국 시간)에 새로 시작합니다.' }),
    ]);
    this.overlay = el('div', { id: 'ranking', class: 'overlay dim hidden' }, [panel]);
    this.overlay.addEventListener('pointerdown', (e) => { if (e.target === this.overlay) this.close(); });
    root.append(this.overlay);
  }

  isOpen() { return !this.overlay.classList.contains('hidden'); }

  async open() {
    this.overlay.classList.remove('hidden');
    await this.refresh();
    clearInterval(this._timer);
    this._timer = setInterval(() => { if (this.isOpen()) this.refresh(); }, 10000);
  }

  close() {
    if (!this.isOpen()) return;
    clearInterval(this._timer);
    this.overlay.classList.add('hidden');
    this.h.onClose?.();
  }

  async refresh() {
    let data;
    try {
      data = await this.h.fetch();
    } catch {
      this.meEl.textContent = '랭킹을 불러오지 못했어요. (오프라인이거나 서버 응답 없음)';
      return;
    }
    this.show(data);
  }

  show(data) {
    const me = this.h.selfId();
    this.dayEl.textContent = data.day ? `· ${data.day}` : '';
    const fill = (list, rows, fmt) => {
      if (!rows.length) {
        list.replaceChildren(el('li', { class: 'rank-empty', text: '아직 기록이 없어요. 1등을 노려 보세요!' }));
        return;
      }
      list.replaceChildren(...rows.map((r, i) => el('li', { class: `rank-row${r.id === me ? ' me' : ''}` }, [
        el('span', { class: 'rank-no', text: ['🥇', '🥈', '🥉'][i] || `${i + 1}` }),
        el('span', { class: 'rank-name', text: r.nickname }),
        el('span', { class: 'rank-val', text: fmt(r.value) }),
      ])));
    };
    fill(this.exList, data.exercise || [], formatSeconds);
    fill(this.bagList, data.bag || [], (v) => `${v}회`);
    const m = data.me;
    this.meEl.textContent = m ? `내 오늘 기록: 운동 ${formatSeconds(m.exercise)} · 샌드백 ${m.bag}회` : '';
  }
}
