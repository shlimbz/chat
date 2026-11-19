// 오늘의 랭킹: 캐릭터별 하루 운동 시간(초) · 샌드백 명중 수
// - 서버가 검증한 행동만 기록 (운동 자리 판정 / 샌드백 판정은 코인과 같은 기준)
// - 메모리에 모았다가 주기적으로 DB 에 더함 (쓰기 횟수 절약)
// - 하루 기준은 한국 시간 자정
export function kstDay(now = Date.now()) {
  return new Date(now + 9 * 3600000).toISOString().slice(0, 10);
}

export class StatsService {
  constructor(db, { now = () => Date.now(), cacheMs = 30000 } = {}) {
    this.db = db;
    this.now = now;
    this.cacheMs = cacheMs;
    this.pending = new Map(); // `${day}|${id}` → { day, id, ex, bag }
    this.names = new Map();
    this.dbTop = null;
  }

  _slot(id) {
    const day = kstDay(this.now());
    const key = `${day}|${id}`;
    let s = this.pending.get(key);
    if (!s) {
      s = { day, id, ex: 0, bag: 0 };
      this.pending.set(key, s);
    }
    return s;
  }

  addExercise(characterId, seconds = 1) { this._slot(characterId).ex += seconds; }

  addBagHit(characterId, n = 1) { this._slot(characterId).bag += n; }

  async flush() {
    const list = [...this.pending.values()].filter((s) => s.ex || s.bag);
    this.pending.clear();
    this.dbTop = null; // 저장했으니 다음 순위 계산 때 DB 에서 다시 읽음
    for (const s of list) {
      try {
        await this.db.run(
          `INSERT INTO daily_stats (day, character_id, exercise_s, bag_hits) VALUES (?, ?, ?, ?)
           ON CONFLICT(day, character_id) DO UPDATE SET
             exercise_s = exercise_s + excluded.exercise_s, bag_hits = bag_hits + excluded.bag_hits`,
          [s.day, s.id, s.ex, s.bag],
        );
      } catch (err) {
        // 실패하면 다음 저장 때 다시 시도
        const back = this._slot(s.id);
        back.ex += s.ex;
        back.bag += s.bag;
        throw err;
      }
    }
  }

  /**
   * 오늘의 순위 (DB 상위 기록 + 아직 저장 안 된 기록을 합쳐 계산 → DB 를 매번 쓰지 않음)
   * @returns {Promise<{day:string, exercise:{id:number,nickname:string,value:number}[], bag:{...}[]}>}
   */
  async ranking(limit = 10) {
    const now = this.now();
    const day = kstDay(now);
    if (!this.dbTop || this.dbTop.day !== day || now - this.dbTop.at >= this.cacheMs) {
      const q = (col) => this.db.all(
        `SELECT d.character_id AS id, u.nickname AS nickname, d.${col} AS value
         FROM daily_stats d JOIN users u ON u.id = d.character_id
         WHERE d.day = ? AND d.${col} > 0 AND u.deleted_at IS NULL
         ORDER BY d.${col} DESC, d.character_id ASC LIMIT ?`,
        [day, limit * 3],
      );
      const norm = (rows) => rows.map((r) => ({ id: Number(r.id), nickname: r.nickname, value: Number(r.value) }));
      this.dbTop = { day, at: now, exercise: norm(await q('exercise_s')), bag: norm(await q('bag_hits')) };
    }
    const merge = (base, key) => {
      const m = new Map(base.map((r) => [r.id, { ...r }]));
      for (const p of this.pending.values()) {
        if (p.day !== day || !p[key]) continue;
        const cur = m.get(p.id);
        if (cur) cur.value += p[key];
        else m.set(p.id, { id: p.id, nickname: this.names.get(p.id) || '?', value: p[key] });
      }
      return [...m.values()].sort((x, y) => y.value - x.value || x.id - y.id).slice(0, limit);
    };
    return { day, exercise: merge(this.dbTop.exercise, 'ex'), bag: merge(this.dbTop.bag, 'bag') };
  }

  /** 접속 중인 캐릭터 이름 (저장 전 기록을 순위에 보여줄 때 사용) */
  setName(id, nickname) { this.names.set(id, nickname); }

  /** 내 오늘 기록 (저장 안 된 것 포함) */
  async mine(characterId) {
    const day = kstDay(this.now());
    const row = await this.db.get('SELECT exercise_s, bag_hits FROM daily_stats WHERE day = ? AND character_id = ?', [day, characterId]);
    const p = this.pending.get(`${day}|${characterId}`);
    return { exercise: Number(row?.exercise_s ?? 0) + (p?.ex || 0), bag: Number(row?.bag_hits ?? 0) + (p?.bag || 0) };
  }
}
