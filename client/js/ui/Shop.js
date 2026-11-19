// 치장 상점: 아이템 둘러보기(미리 입어보기) · 구매 · 판매 · 착용/해제
// 실제 구매/판매는 서버가 처리하고(코인 검증), 화면은 결과만 반영합니다.
import { el } from './dom.js';
import { getCharacterPreview } from './CharacterPreview.js';
import {
  ACCESSORIES, ACC_SLOTS, ACC_SLOT_LABELS, RARITY, findAccessory,
} from '../shared/appearance.js';
import { ECONOMY, sellPrice } from '../shared/economy.js';

const eulReul = (w) => {
  const code = String(w).charCodeAt(String(w).length - 1) - 0xac00;
  return code >= 0 && code <= 11171 && code % 28 ? '을' : '를';
};

const ICONS = {
  headband: '🎀', cap: '🧢', beanie: '🧶', party_hat: '🥳', cat_ears: '🐱', bunny_ears: '🐰', headphones: '🎧', cowboy: '🤠', crown: '👑', halo: '😇',
  round_glasses: '👓', sunglasses: '🕶️', heart_glasses: '💗', star_glasses: '⭐', ski_goggles: '🥽',
  bowtie: '🎀', scarf: '🧣', necklace: '📿', gold_chain: '⛓️', medal: '🥇', earrings: '💎', gold_hoops: '💍',
  neon_kicks: '👟', bunny_slippers: '🐇', gold_kicks: '✨', rocket_boots: '🚀',
  print_stripes: '〰️', print_star: '⭐', print_heart: '❤️', print_bolt: '⚡', print_flame: '🔥', print_paw: '🐾',
  backpack: '🎒', cape: '🦸', jetpack: '🚀', angel_wings: '🪽', devil_wings: '😈',
  trail_sparkle: '✨', trail_bubble: '🫧', trail_heart: '💕', trail_fire: '🔥', trail_rainbow: '🌈',
  aura_ice: '❄️', aura_love: '💖', aura_gold: '🌟',
};

export class Shop {
  /**
   * @param {HTMLElement} root
   * @param {{getWallet:()=>{coins:number,items:string[]}, getAppearance:()=>object,
   *          buy:(id:string)=>Promise<object>, sell:(id:string)=>Promise<object>,
   *          equip:(acc:object)=>void, onClose:Function, online:()=>boolean}} h
   */
  constructor(root, h) {
    this.h = h;
    this.tab = 'hat';
    this.tryOn = null; // 미리 입어보는 아이템 id
    this.busy = false;

    this.mode = 'shop'; // 'shop' | 'inventory'(가방: 가진 아이템 착용/해제만)
    this.titleEl = el('h2', { text: '🛍️ 치장 상점' });
    this.switchBtn = el('button', { class: 'btn', attrs: { type: 'button' } });
    this.switchBtn.addEventListener('click', () => this.open(null, this.mode === 'shop' ? 'inventory' : 'shop'));
    this.coinEl = el('div', { class: 'shop-coins' });
    this.previewSlot = el('div', { class: 'shop-preview' });
    this.tabsEl = el('div', { class: 'shop-tabs' });
    this.gridEl = el('div', { class: 'shop-grid' });
    this.detailEl = el('div', { class: 'shop-detail' });
    this.msgEl = el('div', { class: 'shop-msg' });

    const closeBtn = el('button', { class: 'btn', attrs: { type: 'button' }, text: '닫기 (Esc)', on: { click: () => this.close() } });
    const panel = el('div', { class: 'shop-panel' }, [
      el('div', { class: 'shop-head' }, [
        this.titleEl,
        this.coinEl,
        this.switchBtn,
        closeBtn,
      ]),
      el('div', { class: 'shop-body' }, [
        el('div', { class: 'shop-left' }, [
          this.previewSlot,
          this.detailEl,
        ]),
        el('div', { class: 'shop-right' }, [
          this.tabsEl,
          this.gridEl,
          this.earnEl = el('div', {
            class: 'shop-earn',
            text: `💪 기구 운동 ${ECONOMY.EXERCISE_SECONDS_PER_COIN}초 = 1코인 · 🥊 샌드백 명중 = ${ECONOMY.BAG_COINS}코인 (시간당 최대 ${ECONOMY.HOURLY_CAP}) · 되팔면 ${Math.round(ECONOMY.SELL_RATE * 100)}%`,
          }),
          this.msgEl,
        ]),
      ]),
    ]);
    this.overlay = el('div', { id: 'shop', class: 'overlay dim hidden' }, [panel]);
    this.overlay.addEventListener('pointerdown', (e) => { if (e.target === this.overlay) this.close(); });
    root.append(this.overlay);
    this._buildTabs();
  }

  isOpen() { return !this.overlay.classList.contains('hidden'); }

  open(tab, mode = 'shop') {
    this.mode = mode;
    const inv = mode === 'inventory';
    this.titleEl.textContent = inv ? '🎒 내 가방' : '🛍️ 치장 상점';
    this.switchBtn.textContent = inv ? '🛍️ 상점 가기' : '🎒 가방 (I)';
    this.earnEl.classList.toggle('hidden', inv);
    if (inv) this.tab = 'all';
    if (tab) this.tab = tab;
    this.tryOn = null;
    this._lastLook = null;
    this.msgEl.textContent = this.h.online() ? '' : '오프라인 모드에서는 상점을 이용할 수 없어요. (둘러보기만 가능)';
    this.overlay.classList.remove('hidden');
    this.preview = getCharacterPreview();
    this.preview.mount(this.previewSlot);
    this.refresh();
  }

  close() {
    if (!this.isOpen()) return;
    this.overlay.classList.add('hidden');
    this.preview?.stop();
    this.h.onClose?.();
  }

  /** 지갑/외형이 바뀌면 다시 그림 */
  refresh() {
    if (!this.isOpen()) return;
    const w = this.h.getWallet();
    this.coinEl.textContent = `🪙 ${w.coins.toLocaleString()}`;
    for (const b of this.tabsEl.children) {
      b.classList.toggle('active', b.dataset.tab === this.tab);
      b.classList.toggle('hidden', this.mode === 'inventory' && b.dataset.tab === 'owned');
    }
    this._renderGrid();
    this._renderDetail();
    this._updatePreview();
  }

  _buildTabs() {
    const tabs = [['all', '전체'], ...ACC_SLOTS.map((s) => [s, ACC_SLOT_LABELS[s]]), ['owned', '내 아이템']];
    for (const [id, label] of tabs) {
      const b = el('button', { class: 'shop-tab', attrs: { type: 'button' }, text: label });
      b.dataset.tab = id;
      if (id === 'owned') b.classList.add('shop-only');
      b.addEventListener('click', () => { this.tab = id; this.tryOn = null; this.refresh(); });
      this.tabsEl.append(b);
    }
  }

  _items() {
    const owned = this.h.getWallet().items;
    const inSlot = (a) => this.tab === 'all' || this.tab === 'owned' || a.slot === this.tab;
    if (this.mode === 'inventory' || this.tab === 'owned') return ACCESSORIES.filter((a) => owned.includes(a.id) && inSlot(a));
    return ACCESSORIES.filter(inSlot);
  }

  _renderGrid() {
    const { coins, items: owned } = this.h.getWallet();
    const acc = this.h.getAppearance().acc || {};
    const list = this._items();
    if (!list.length) {
      this.gridEl.replaceChildren(el('div', {
        class: 'shop-empty',
        text: this.mode === 'inventory' ? '이 칸에 가진 아이템이 없어요. 상점에서 사 보세요!' : '아직 가진 아이템이 없어요. 운동해서 코인을 모아 보세요!',
      }));
      return;
    }
    this.gridEl.replaceChildren(...list.map((item) => {
      const has = owned.includes(item.id);
      const worn = acc[item.slot] === item.id;
      const r = RARITY[item.rarity] || RARITY.common;
      const card = el('button', { class: 'shop-card', attrs: { type: 'button' } }, [
        el('div', { class: 'shop-icon', text: ICONS[item.id] || '🎁' }),
        el('div', { class: 'shop-name', text: item.label }),
        el('div', { class: 'shop-rarity', text: r.label }),
        el('div', {
          class: 'shop-price',
          text: worn ? '착용 중' : has ? '보유' : `🪙 ${item.price.toLocaleString()}`,
        }),
      ]);
      card.style.setProperty('--rarity', r.color);
      card.classList.toggle('owned', has);
      card.classList.toggle('worn', worn);
      card.classList.toggle('selected', this.tryOn === item.id);
      card.classList.toggle('cant', !has && coins < item.price);
      card.addEventListener('click', () => { this.tryOn = item.id; this.msgEl.textContent = ''; this.refresh(); });
      return card;
    }));
  }

  _renderDetail() {
    const item = findAccessory(this.tryOn);
    if (!item) {
      this.detailEl.replaceChildren(el('div', { class: 'shop-hint', text: '아이템을 누르면 미리 입어볼 수 있어요.' }));
      return;
    }
    const { coins, items: owned } = this.h.getWallet();
    const acc = this.h.getAppearance().acc || {};
    const has = owned.includes(item.id);
    const worn = acc[item.slot] === item.id;
    const online = this.h.online();
    const r = RARITY[item.rarity] || RARITY.common;
    const buttons = [];
    if (!has && this.mode === 'inventory') {
      buttons.push(el('div', { class: 'shop-hint', text: '가지고 있지 않은 아이템이에요.' }));
    } else if (!has) {
      const b = el('button', { class: 'btn btn-primary', attrs: { type: 'button' }, text: `구매 🪙 ${item.price.toLocaleString()}` });
      b.disabled = !online || coins < item.price || this.busy;
      if (online && coins < item.price) b.textContent = `코인 부족 (${(item.price - coins).toLocaleString()} 더 필요)`;
      b.addEventListener('click', () => this._act(() => this.h.buy(item.id), () => {
        // 사자마자 착용
        this.h.equip({ ...(this.h.getAppearance().acc || {}), [item.slot]: item.id });
      }));
      buttons.push(b);
    } else {
      const eq = el('button', { class: 'btn btn-primary', attrs: { type: 'button' }, text: worn ? '벗기' : '착용하기' });
      eq.disabled = !online;
      eq.addEventListener('click', () => {
        const next = { ...(this.h.getAppearance().acc || {}) };
        if (worn) delete next[item.slot];
        else next[item.slot] = item.id;
        this.h.equip(next);
        this.msgEl.textContent = `${item.label}${eulReul(item.label)} ${worn ? '벗었어요.' : '착용했어요!'}`;
        this.refresh();
      });
      const sell = el('button', { class: 'btn', attrs: { type: 'button' }, text: `팔기 (+${sellPrice(item)})` });
      sell.disabled = !online || this.busy;
      sell.addEventListener('click', () => {
        if (sell.dataset.confirm !== '1') {
          sell.dataset.confirm = '1';
          sell.textContent = `정말 팔까요? (+${sellPrice(item)})`;
          setTimeout(() => { if (sell.isConnected) { sell.dataset.confirm = ''; sell.textContent = `팔기 (+${sellPrice(item)})`; } }, 3000);
          return;
        }
        this._act(() => this.h.sell(item.id));
      });
      if (this.mode === 'inventory') buttons.push(eq);
      else buttons.push(eq, sell);
    }
    this.detailEl.replaceChildren(
      el('div', { class: 'shop-detail-title' }, [
        el('span', { class: 'shop-icon small', text: ICONS[item.id] || '🎁' }),
        el('b', { text: item.label }),
        el('span', { class: 'shop-badge', text: `${ACC_SLOT_LABELS[item.slot]} · ${r.label}` }),
      ]),
      el('div', { class: 'shop-actions' }, buttons),
    );
    this.detailEl.querySelector('.shop-badge').style.background = r.color;
  }

  async _act(fn, after) {
    if (this.busy) return;
    this.busy = true;
    this.msgEl.textContent = '처리 중…';
    this.refresh();
    try {
      const r = await fn();
      this.msgEl.textContent = r?.message || (r?.ok ? '완료!' : '실패했습니다.');
      if (r?.ok) after?.();
    } catch {
      this.msgEl.textContent = '서버 응답이 없습니다. 잠시 후 다시 시도하세요.';
    } finally {
      this.busy = false;
      this.refresh();
    }
  }

  /** 미리보기: 지금 외형 + 고른 아이템 입혀보기 */
  _updatePreview() {
    const base = this.h.getAppearance();
    const item = findAccessory(this.tryOn);
    const acc = { ...(base.acc || {}) };
    if (item) acc[item.slot] = item.id;
    const look = { ...base, acc };
    const key = JSON.stringify(look);
    if (key === this._lastLook) return;
    this._lastLook = key;
    this.preview.setAppearance(look);
  }
}
