// 헬스장 NPC: 서버가 직접 움직임 → 모든 사람 화면에서 같은 위치·동작으로 보임
// - 통로(npcRoutes)를 따라 걸어가서 기구 운동 / 샌드백 치기 / 벤치에 앉아 쉬기 / 라운지에서 수다
// - 사람이 쓰고 있는 기구·자리는 피함. 접속자 수·랭킹·코인에는 포함되지 않음
// - 이름 앞에 [NPC] 가 붙음 (사람 닉네임 규칙으로는 만들 수 없는 이름이라 겹치지 않음)
import { actionToIndex } from '../../../client/js/shared/protocol.js';
import { sanitizeAppearance } from '../../../client/js/shared/appearance.js';
import { NODES, npcDestinations, findPath } from '../../../client/js/shared/npcRoutes.js';

const WALK_SPEED = 2.1; // m/s (사람 걷기 3.2 보다 느긋하게)

const ROSTER = [
  { name: '민지', look: { gender: 'female', hair: 'ponytail', hairColor: '#221b17', topColor: '#f08bb4', bottomColor: '#2b2d33', outfit: 'tank_shorts', muscle: 0.35, acc: { hat: 'headband' } } },
  { name: '근육맨', look: { gender: 'male', hair: 'buzz', hairColor: '#221b17', topColor: '#e8505b', bottomColor: '#2b2d33', outfit: 'tank_shorts', muscle: 1, weight: 0.45, height: 0.7, acc: { eyes: 'sunglasses' } } },
  { name: '헬린이', look: { gender: 'male', hair: 'bowl', hairColor: '#5a3a22', topColor: '#3caea3', bottomColor: '#3d7dd8', outfit: 'tshirt_shorts', muscle: 0.1, weight: 0.5, height: 0.35 } },
  { name: '요가쌤', look: { gender: 'female', hair: 'bun', hairColor: '#9a6a3a', topColor: '#8e6bd8', bottomColor: '#8e6bd8', outfit: 'tracksuit', muscle: 0.25, weight: 0.15, height: 0.6 } },
  { name: '복싱왕', look: { gender: 'male', hair: 'spiky', hairColor: '#a8432b', topColor: '#2b2d33', bottomColor: '#e8505b', outfit: 'tank_shorts', muscle: 0.75, acc: { hat: 'headband' } } },
  { name: '러닝맘', look: { gender: 'female', hair: 'long', hairColor: '#e3c16f', topColor: '#f9a03f', bottomColor: '#2b2d33', outfit: 'hoodie_joggers', muscle: 0.3, acc: { hat: 'cap' } } },
  { name: '아저씨', look: { gender: 'male', hair: 'bald', topColor: '#f4f4f4', bottomColor: '#2b2d33', outfit: 'tracksuit', muscle: 0.4, weight: 0.8, acc: { eyes: 'round_glasses' } } },
  { name: '댄서', look: { gender: 'female', hair: 'pigtails', hairColor: '#f08bb4', topColor: '#f6d55c', bottomColor: '#3d7dd8', outfit: 'tshirt_shorts', muscle: 0.2 } },
  { name: '코치킴', look: { gender: 'male', hair: 'short', hairColor: '#221b17', topColor: '#3d7dd8', bottomColor: '#2b2d33', outfit: 'tracksuit', muscle: 0.6, acc: { hat: 'cap' } } },
  { name: '파워걸', look: { gender: 'female', hair: 'short', hairColor: '#4a7fd6', topColor: '#2b2d33', bottomColor: '#f08bb4', outfit: 'tank_shorts', muscle: 0.9 } },
];

const LINES = {
  exercise: ['오늘 하체 날!', '한 개만 더…!', '득근득근 💪', '자세가 생명이야', '3세트째…', '숨 쉬는 거 잊지 말기'],
  bag: ['원투! 원투!', '초록 불일 때 쳐야 돼', '스트레스 해소 🥊', '퍽퍽!'],
  sit: ['잠깐 쉬었다 할게요', '물 마시는 중 💧', '다음엔 뭐 하지?', '휴~'],
  hang: ['타워 가 봤어요?', '정상까지 몇 분 걸려요?', '저 상점 모자 예쁘더라', '오늘 랭킹 1등 누구지?'],
  hit: ['앗! 왜 때려요 😢', '아야!', '운동 중이에요!', '살살 해요~'],
};
const pick = (arr, rnd) => arr[Math.floor(rnd() * arr.length)];

export class NpcManager {
  /**
   * @param {{count:number, isTaken:(dest:object, self:object)=>boolean, onAttack?:Function, onSay?:Function, rnd?:()=>number}} o
   *   isTaken: 사람이 그 자리를 쓰고 있는지 (서버 handlers 가 접속자 위치·동작으로 판단)
   */
  constructor({ count, isTaken = () => false, onAttack = () => {}, onSay = () => {}, rnd = Math.random }) {
    this.isTaken = isTaken;
    this.onAttack = onAttack;
    this.onSay = onSay;
    this.rnd = rnd;
    this.dests = npcDestinations();
    const nodeNames = Object.keys(NODES);
    this.npcs = ROSTER.slice(0, count).map((r, i) => {
      const start = NODES[nodeNames[(i * 7) % nodeNames.length]];
      return {
        id: -(i + 1), // 사람 캐릭터 id(양수)와 겹치지 않게 음수
        npc: true,
        nickname: `[NPC] ${r.name}`,
        appearance: sanitizeAppearance(r.look, { ownedItems: null }),
        bodyStats: null,
        level: 1,
        admin: false,
        x: start.x, y: 0, z: start.z, r: 0, a: 0,
        node: nodeNames[(i * 7) % nodeNames.length],
        state: 'idle',
        until: 0,
        waypoints: [],
        dest: null,
        dirty: true,
        attackAt: {},
        hitLog: [],
        downUntil: 0,
        nextSay: 0,
        nextPunch: 0,
      };
    });
  }

  list() {
    return this.npcs;
  }

  get(id) {
    return this.npcs.find((n) => n.id === id) || null;
  }

  /** 다른 NPC가 이미 가는 중이거나 쓰고 있는 자리 */
  _reserved(dest, self) {
    return this.npcs.some((n) => n !== self && n.dest === dest);
  }

  _choose(n) {
    const roll = this.rnd();
    const kind = roll < 0.58 ? 'exercise' : roll < 0.73 ? 'bag' : roll < 0.88 ? 'sit' : 'hang';
    const free = this.dests.filter((d) => d.kind === kind && !this._reserved(d, n) && !this.isTaken(d, n));
    const pool = free.length ? free : this.dests.filter((d) => !this._reserved(d, n) && !this.isTaken(d, n));
    return pool.length ? pool[Math.floor(this.rnd() * pool.length)] : null;
  }

  _go(n, dest, now) {
    const path = findPath(n.node, dest.node);
    if (!path) { n.until = now + 2000; return; }
    n.dest = dest;
    n.waypoints = path.slice(1).map((k) => ({ ...NODES[k], node: k }));
    n.waypoints.push({ ...dest.approach, final: true });
    n.state = 'walk';
    this._set(n, { a: actionToIndex('walk') });
  }

  _set(n, v) {
    for (const [k, val] of Object.entries(v)) {
      if (n[k] !== val) { n[k] = val; n.dirty = true; }
    }
  }

  /** 사람에게 맞음: 가끔 한마디 (운동은 계속) */
  onHit(n, now = Date.now()) {
    if (now > (n.hitSayAt || 0)) {
      n.hitSayAt = now + 5000;
      this.onSay(n, pick(LINES.hit, this.rnd));
    }
  }

  update(dt, now = Date.now()) {
    for (const n of this.npcs) {
      switch (n.state) {
        case 'idle':
          if (now < n.until) break;
          {
            const dest = this._choose(n);
            if (dest) this._go(n, dest, now);
            else n.until = now + 3000;
          }
          break;
        case 'walk': {
          let left = WALK_SPEED * dt;
          while (left > 0 && n.waypoints.length) {
            const w = n.waypoints[0];
            const dx = w.x - n.x;
            const dz = w.z - n.z;
            const d = Math.hypot(dx, dz);
            if (d > 1e-4) n.r = Math.atan2(dx, dz);
            if (d <= left) {
              n.x = w.x; n.z = w.z;
              left -= d;
              n.waypoints.shift();
              if (w.node) n.node = w.node;
            } else {
              n.x += (dx / d) * left;
              n.z += (dz / d) * left;
              left = 0;
            }
          }
          n.dirty = true;
          if (!n.waypoints.length) this._arrive(n, now);
          break;
        }
        case 'busy':
          if (n.dest.kind === 'bag' && now > n.nextPunch) {
            n.nextPunch = now + 700 + this.rnd() * 900;
            this.onAttack(n, this.rnd() < 0.7 ? 'punch' : 'kick');
          }
          if (now > n.nextSay) {
            n.nextSay = now + 45000 + this.rnd() * 60000;
            this.onSay(n, pick(LINES[n.dest.kind], this.rnd));
          }
          if (now >= n.until) this._leave(n, now);
          break;
        case 'leave': {
          // 자리에서 일어나 통로로 돌아감
          const node = n.dest.node;
          this._go(n, { approach: NODES[node], node, kind: 'back' }, now);
          n.back = true;
          break;
        }
        default:
          n.state = 'idle';
      }
    }
  }

  _arrive(n, now) {
    if (n.back || !n.dest || n.dest.kind === 'back') {
      n.back = false;
      n.dest = null;
      n.state = 'idle';
      n.until = now + 1500 + this.rnd() * 4000;
      this._set(n, { a: 0 });
      return;
    }
    const d = n.dest;
    // 그사이 사람이 먼저 쓰기 시작했으면 다른 곳으로
    if (this.isTaken(d, n)) {
      this._go(n, { approach: NODES[d.node], node: d.node, kind: 'back' }, now);
      n.back = true;
      return;
    }
    const sp = d.spot;
    this._set(n, {
      x: sp.x, y: sp.y, z: sp.z, r: Math.atan2(Math.sin(sp.r), Math.cos(sp.r)), a: actionToIndex(d.action),
    });
    n.dirty = true;
    n.state = 'busy';
    const dur = { exercise: [25, 60], bag: [15, 30], sit: [15, 40], hang: [15, 35] }[d.kind] || [15, 30];
    n.until = now + (dur[0] + this.rnd() * (dur[1] - dur[0])) * 1000;
    n.nextSay = now + 3000 + this.rnd() * 15000;
    n.nextPunch = now + 500;
  }

  _leave(n, now) {
    const d = n.dest;
    this._set(n, {
      x: d.approach.x, y: 0, z: d.approach.z, a: actionToIndex('walk'),
    });
    n.state = 'leave';
    n.until = now;
  }

  /** 지난 틱 이후 바뀐 NPC 만 [id, x, y, z, r, a] */
  takeStatePacket() {
    const out = [];
    const r2 = (v) => Math.round(v * 100) / 100;
    for (const n of this.npcs) {
      if (!n.dirty) continue;
      n.dirty = false;
      out.push([n.id, r2(n.x), r2(n.y), r2(n.z), r2(n.r), n.a]);
    }
    return out;
  }
}

