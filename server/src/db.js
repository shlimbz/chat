// 데이터베이스 연결 (두 가지 방식 지원, 사용하는 쪽 코드는 동일)
//  - TURSO_DATABASE_URL 이 설정되어 있으면 → Turso (무료 원격 SQLite, 서버가 재시작돼도 데이터 유지)
//  - 없으면 → 내 컴퓨터의 SQLite 파일 (Node.js 내장 node:sqlite, 설치 불필요)
//
// 모든 함수는 Promise 를 반환합니다:
//   await db.get(sql, params)  → 첫 행 또는 undefined
//   await db.all(sql, params)  → 행 배열
//   await db.run(sql, params)  → { lastInsertRowid, changes }
//   await db.exec(sql)         → 여러 문장 실행 (스키마 생성 등)
import fs from 'node:fs';
import path from 'node:path';

// 스키마 버전 목록 — 이후 Phase 에서는 배열 끝에 항목만 추가합니다. (모두 IF NOT EXISTS 로 작성)
export const MIGRATIONS = [
  // v1: Phase 2~3 — 사용자, 채팅
  `
  CREATE TABLE IF NOT EXISTS users (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    nickname     TEXT NOT NULL UNIQUE COLLATE NOCASE,
    token_hash   TEXT NOT NULL UNIQUE,
    appearance   TEXT NOT NULL,
    body_stats   TEXT,
    level        INTEGER NOT NULL DEFAULT 1,
    exp          INTEGER NOT NULL DEFAULT 0,
    last_x       REAL,
    last_z       REAL,
    last_r       REAL,
    created_at   INTEGER NOT NULL,
    last_seen_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS chat_messages (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    type        TEXT NOT NULL,
    sender_id   INTEGER NOT NULL REFERENCES users(id),
    receiver_id INTEGER REFERENCES users(id),
    message     TEXT NOT NULL,
    created_at  INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_chat_type_id ON chat_messages(type, id);
  CREATE INDEX IF NOT EXISTS idx_chat_pair ON chat_messages(sender_id, receiver_id, id);
  CREATE INDEX IF NOT EXISTS idx_chat_receiver ON chat_messages(receiver_id, sender_id, id);
  `,
  // v2: 계정(아이디/비밀번호) + 로그인 세션 + 계정당 캐릭터 (users 테이블 = 캐릭터)
  `
  CREATE TABLE IF NOT EXISTS accounts (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    role          TEXT NOT NULL DEFAULT 'user',
    banned        INTEGER NOT NULL DEFAULT 0,
    ban_reason    TEXT,
    created_at    INTEGER NOT NULL,
    last_login_at INTEGER
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token_hash  TEXT PRIMARY KEY,
    account_id  INTEGER NOT NULL REFERENCES accounts(id),
    created_at  INTEGER NOT NULL,
    expires_at  INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_sessions_account ON sessions(account_id);
  ALTER TABLE users ADD COLUMN account_id INTEGER REFERENCES accounts(id);
  ALTER TABLE users ADD COLUMN deleted_at INTEGER;
  CREATE INDEX IF NOT EXISTS idx_users_account ON users(account_id);
  `,
  // v3: 게임 재화 · 보유 아이템 (악세사리 상점용으로 미리 준비)
  `
  ALTER TABLE accounts ADD COLUMN coins INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE accounts ADD COLUMN items TEXT NOT NULL DEFAULT '[]';
  `,
  // v4: 코인 상점 오픈 — 기존 계정에 시작 코인 지급
  `
  UPDATE accounts SET coins = coins + 300;
  `,
  // v5: 오늘의 랭킹 (하루 단위 운동 시간 · 샌드백 명중 수)
  `
  CREATE TABLE IF NOT EXISTS daily_stats (
    day          TEXT NOT NULL,
    character_id INTEGER NOT NULL,
    exercise_s   INTEGER NOT NULL DEFAULT 0,
    bag_hits     INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (day, character_id)
  );
  CREATE INDEX IF NOT EXISTS idx_daily_ex ON daily_stats(day, exercise_s);
  CREATE INDEX IF NOT EXISTS idx_daily_bag ON daily_stats(day, bag_hits);
  `,
];

/**
 * @param {{DB_PATH:string, TURSO_DATABASE_URL?:string, TURSO_AUTH_TOKEN?:string}} config
 * @param {{libsqlClient?:object}} [opts] 테스트용: Turso 클라이언트를 직접 주입
 */
export async function openDatabase(config, opts = {}) {
  const db = config.TURSO_DATABASE_URL || opts.libsqlClient
    ? await openTurso(config, opts.libsqlClient)
    : await openLocal(config.DB_PATH);
  await migrate(db);
  return db;
}

// ── 로컬 SQLite (node:sqlite) ──────────────────────────────
async function openLocal(dbPath) {
  const { DatabaseSync } = await import('node:sqlite');
  if (dbPath !== ':memory:') fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const raw = new DatabaseSync(dbPath);
  raw.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 3000;');
  const cache = new Map();
  const stmt = (sql) => {
    let s = cache.get(sql);
    if (!s) { s = raw.prepare(sql); cache.set(sql, s); }
    return s;
  };
  return {
    kind: 'local',
    describe: () => `SQLite 파일 (${dbPath})`,
    async get(sql, params = []) { return stmt(sql).get(...params); },
    async all(sql, params = []) { return stmt(sql).all(...params); },
    async run(sql, params = []) {
      const r = stmt(sql).run(...params);
      return { lastInsertRowid: Number(r.lastInsertRowid), changes: Number(r.changes) };
    },
    async exec(sql) { raw.exec(sql); },
    async close() { raw.close(); },
  };
}

// ── Turso (원격 libSQL) ───────────────────────────────────
async function openTurso(config, injected) {
  let client = injected;
  let url = config.TURSO_DATABASE_URL || '(테스트 클라이언트)';
  if (!client) {
    // 순수 JS(HTTP) 클라이언트 — 네이티브 빌드가 필요 없어 무료 호스팅에서도 설치가 잘 됨
    const { createClient } = await import('@libsql/client/web');
    url = config.TURSO_DATABASE_URL.trim().replace(/^libsql:\/\//, 'https://');
    if (!config.TURSO_AUTH_TOKEN) {
      throw new Error('TURSO_AUTH_TOKEN 환경 변수가 비어 있습니다. Turso 에서 만든 토큰을 입력하세요.');
    }
    client = createClient({ url, authToken: config.TURSO_AUTH_TOKEN.trim() });
  }
  const toArgs = (params) => params.map((v) => (v === undefined ? null : v));
  const plain = (row, columns) => {
    // libSQL Row → 일반 객체 (열 이름으로 접근)
    const o = {};
    columns.forEach((c, i) => { o[c] = row[c] !== undefined ? row[c] : row[i]; });
    return o;
  };
  const query = async (sql, params) => {
    try {
      return await client.execute({ sql, args: toArgs(params) });
    } catch (err) {
      err.message = `[Turso] ${err.message}`;
      throw err;
    }
  };
  return {
    kind: 'turso',
    describe: () => `Turso (${url.replace(/^https:\/\//, '')})`,
    async get(sql, params = []) {
      const rs = await query(sql, params);
      return rs.rows.length ? plain(rs.rows[0], rs.columns) : undefined;
    },
    async all(sql, params = []) {
      const rs = await query(sql, params);
      return rs.rows.map((r) => plain(r, rs.columns));
    },
    async run(sql, params = []) {
      const rs = await query(sql, params);
      return {
        lastInsertRowid: rs.lastInsertRowid == null ? null : Number(rs.lastInsertRowid),
        changes: Number(rs.rowsAffected || 0),
      };
    },
    async exec(sql) { await client.executeMultiple(sql); },
    async close() { client.close?.(); },
  };
}

// ── 스키마 버전 관리 (_meta 테이블) ─────────────────────────
async function migrate(db) {
  await db.exec('CREATE TABLE IF NOT EXISTS _meta (key TEXT PRIMARY KEY, value INTEGER NOT NULL);');
  const row = await db.get("SELECT value FROM _meta WHERE key = 'schema_version'");
  const current = row ? Number(row.value) : 0;
  for (let v = current; v < MIGRATIONS.length; v++) {
    await db.exec(MIGRATIONS[v]);
    await db.run(
      "INSERT INTO _meta (key, value) VALUES ('schema_version', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      [v + 1],
    );
  }
}
