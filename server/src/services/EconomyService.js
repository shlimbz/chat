// 게임 재화(코인)와 보유 아이템 관리 — 모든 지급/차감은 서버에서만 일어납니다.
//
// - 접속 중인 계정의 지갑은 메모리에 두고(빠른 응답), 번 코인은 FLUSH_MS 마다 모아서 DB 에 저장
//   (Turso 무료 요금제의 쓰기 횟수를 아끼기 위해). 구매/판매는 즉시 DB 에 저장합니다.
// - 같은 계정의 요청은 순서대로 처리(잠금)해서 동시에 두 번 사는 문제를 막습니다.
// - 시간당 벌 수 있는 코인에 상한(HOURLY_CAP)이 있어 매크로로 무한히 벌 수 없습니다.
import { ECONOMY, sellPrice } from '../../../client/js/shared/economy.js';
import { findAccessory } from '../../../client/js/shared/appearance.js';

/** 받침 있으면 '을', 없으면 '를' */
function eulReul(word) {
  const code = String(word).charCodeAt(String(word).length - 1) - 0xac00;
  return code >= 0 && code <= 11171 && code % 28 ? '을' : '를';
}

function parseItems(s) {
  try {
    const v = JSON.parse(s || '[]');
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export class EconomyService {
  constructor(db, { now = () => Date.now() } = {}) {
    this.db = db;
    this.now = now;
    this.wallets = new Map(); // accountId → { coins, items, pending, refs }
    this.earnWindow = new Map(); // accountId → { start, earned } (재접속해도 유지)
    this.locks = new Map(); // accountId → Promise
  }

  /** 같은 계정의 작업을 순서대로 실행 */
  _locked(accountId, fn) {
    const prev = this.locks.get(accountId) || Promise.resolve();
    const run = prev.then(fn, fn);
    const tail = run.catch(() => {});
    this.locks.set(accountId, tail);
    tail.then(() => { if (this.locks.get(accountId) === tail) this.locks.delete(accountId); });
    return run;
  }

  /** 접속 시 지갑 불러오기 (같은 계정의 여러 캐릭터가 접속하면 공유) */
  async open(accountId) {
    return this._locked(accountId, async () => {
      let w = this.wallets.get(accountId);
      if (!w) {
        const row = await this.db.get('SELECT coins, items FROM accounts WHERE id = ?', [accountId]);
        w = { coins: Number(row?.coins ?? 0), items: parseItems(row?.items), pending: 0, refs: 0 };
        this.wallets.set(accountId, w);
      }
      w.refs++;
      return this.view(accountId);
    });
  }

  /** 접속 종료 시: 남은 코인 저장, 아무도 안 쓰면 메모리에서 제거 */
  async close(accountId) {
    return this._locked(accountId, async () => {
      const w = this.wallets.get(accountId);
      if (!w) return;
      await this._flush(accountId, w);
      w.refs--;
      if (w.refs <= 0) this.wallets.delete(accountId);
    });
  }

  view(accountId) {
    const w = this.wallets.get(accountId);
    return w ? { coins: w.coins, items: [...w.items] } : { coins: 0, items: [] };
  }

  items(accountId) {
    return this.wallets.get(accountId)?.items || [];
  }

  /**
   * 코인 벌기 (서버가 검증한 행동에 대해서만 호출)
   * @returns {number} 실제로 지급된 코인 (시간당 상한에 걸리면 0)
   */
  earn(accountId, amount) {
    const w = this.wallets.get(accountId);
    if (!w || !(amount > 0)) return 0;
    const now = this.now();
    let win = this.earnWindow.get(accountId);
    if (!win || now - win.start >= 3600000) {
      win = { start: now, earned: 0 };
      this.earnWindow.set(accountId, win);
    }
    const n = Math.min(Math.floor(amount), ECONOMY.HOURLY_CAP - win.earned);
    if (n <= 0) return 0;
    win.earned += n;
    w.coins += n;
    w.pending += n;
    return n;
  }

  /** 이번 시간에 더 벌 수 있는 코인 */
  remainingCap(accountId) {
    const win = this.earnWindow.get(accountId);
    if (!win || this.now() - win.start >= 3600000) return ECONOMY.HOURLY_CAP;
    return Math.max(0, ECONOMY.HOURLY_CAP - win.earned);
  }

  async _flush(accountId, w) {
    if (!w.pending) return;
    const n = w.pending;
    w.pending = 0;
    try {
      await this.db.run('UPDATE accounts SET coins = coins + ? WHERE id = ?', [n, accountId]);
    } catch (err) {
      w.pending += n; // 다음에 다시 시도
      throw err;
    }
  }

  /** 주기적으로 모든 지갑의 번 코인을 저장 */
  async flushAll() {
    await Promise.allSettled([...this.wallets.keys()].map((id) => this._locked(id, () => {
      const w = this.wallets.get(id);
      return w ? this._flush(id, w) : null;
    })));
  }

  /** @returns {Promise<{ok:boolean, message:string, coins?:number, items?:string[]}>} */
  async buy(accountId, itemId) {
    return this._locked(accountId, async () => {
      const w = this.wallets.get(accountId);
      const item = findAccessory(itemId);
      if (!w) return { ok: false, message: '접속 정보가 없습니다.' };
      if (!item) return { ok: false, message: '없는 아이템입니다.' };
      if (w.items.includes(item.id)) return { ok: false, message: '이미 가지고 있는 아이템입니다.' };
      if (w.coins < item.price) return { ok: false, message: `코인이 부족합니다. (${item.price - w.coins}코인 더 필요)` };
      const items = [...w.items, item.id];
      // pending(아직 저장 안 된 번 코인)까지 함께 반영
      const delta = w.pending - item.price;
      const r = await this.db.run(
        'UPDATE accounts SET coins = coins + ?, items = ? WHERE id = ? AND coins + ? >= 0',
        [delta, JSON.stringify(items), accountId, delta],
      );
      if (!r.changes) return { ok: false, message: '구매하지 못했습니다. 잠시 후 다시 시도하세요.' };
      w.pending = 0;
      w.coins -= item.price;
      w.items = items;
      return { ok: true, message: `${item.label}${eulReul(item.label)} 샀습니다!`, ...this.view(accountId) };
    });
  }

  async sell(accountId, itemId) {
    return this._locked(accountId, async () => {
      const w = this.wallets.get(accountId);
      const item = findAccessory(itemId);
      if (!w) return { ok: false, message: '접속 정보가 없습니다.' };
      if (!item || !w.items.includes(item.id)) return { ok: false, message: '가지고 있지 않은 아이템입니다.' };
      const price = sellPrice(item);
      const items = w.items.filter((x) => x !== item.id);
      const delta = w.pending + price;
      await this.db.run('UPDATE accounts SET coins = coins + ?, items = ? WHERE id = ?', [delta, JSON.stringify(items), accountId]);
      w.pending = 0;
      w.coins += price;
      w.items = items;
      return { ok: true, message: `${item.label}${eulReul(item.label)} ${price}코인에 팔았습니다.`, ...this.view(accountId) };
    });
  }

  /** 관리자 지급/회수 (접속 안 한 계정도 가능). 음수면 회수, 0 아래로는 안 내려감 */
  async adminGive(accountId, amount) {
    return this._locked(accountId, async () => {
      const n = Math.trunc(amount);
      const w = this.wallets.get(accountId);
      if (w) {
        const delta = w.pending + Math.max(n, -w.coins);
        await this.db.run('UPDATE accounts SET coins = MAX(0, coins + ?) WHERE id = ?', [delta, accountId]);
        w.pending = 0;
        w.coins = Math.max(0, w.coins + n);
        return w.coins;
      }
      await this.db.run('UPDATE accounts SET coins = MAX(0, coins + ?) WHERE id = ?', [n, accountId]);
      const row = await this.db.get('SELECT coins FROM accounts WHERE id = ?', [accountId]);
      return Number(row?.coins ?? 0);
    });
  }
}
