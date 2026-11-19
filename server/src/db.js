// SQLite 데이터베이스 (Node.js 내장 node:sqlite 사용 → 별도 설치·컴파일 불필요)
// 스키마 버전을 PRAGMA user_version 으로 관리하며, 이후 Phase 에서 MIGRATIONS 에 항목만 추가합니다.
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const MIGRATIONS = [
  // v1: Phase 2~3 — 사용자, 채팅
  `
  CREATE TABLE users (
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
  CREATE TABLE chat_messages (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    type        TEXT NOT NULL,              -- global | whisper
    sender_id   INTEGER NOT NULL REFERENCES users(id),
    receiver_id INTEGER REFERENCES users(id), -- 귓속말 수신자 (전체 채팅은 NULL)
    message     TEXT NOT NULL,
    created_at  INTEGER NOT NULL
  );
  CREATE INDEX idx_chat_type_id ON chat_messages(type, id);
  CREATE INDEX idx_chat_pair ON chat_messages(sender_id, receiver_id, id);
  CREATE INDEX idx_chat_receiver ON chat_messages(receiver_id, sender_id, id);
  `,
];

export function openDatabase(dbPath) {
  if (dbPath !== ':memory:') fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 3000;');
  migrate(db);
  return db;
}

function migrate(db) {
  const current = db.prepare('PRAGMA user_version').get().user_version;
  for (let v = current; v < MIGRATIONS.length; v++) {
    db.exec('BEGIN');
    try {
      db.exec(MIGRATIONS[v]);
      db.exec(`PRAGMA user_version = ${v + 1}`);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }
}
