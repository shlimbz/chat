// 테스트용 가짜 Turso(@libsql/client) 클라이언트
// 실제 Turso 와 같은 응답 형식(columns, rows, rowsAffected, lastInsertRowid: bigint)을 흉내 내며,
// 내부적으로는 메모리 SQLite 를 사용합니다. → 네트워크 없이 Turso 어댑터 코드를 검증할 수 있음
import { DatabaseSync } from 'node:sqlite';

export function createFakeLibsqlClient() {
  const db = new DatabaseSync(':memory:');
  const calls = { execute: 0, executeMultiple: 0 };
  return {
    calls,
    async execute({ sql, args }) {
      calls.execute++;
      if (!Array.isArray(args)) throw new Error('args must be array');
      for (const a of args) if (a === undefined) throw new TypeError('undefined arg not supported by libsql');
      const stmt = db.prepare(sql);
      const isQuery = /^\s*(SELECT|PRAGMA|WITH)/i.test(sql) || /\bRETURNING\b/i.test(sql);
      if (isQuery) {
        const objs = stmt.all(...args);
        const columns = objs.length ? Object.keys(objs[0]) : stmt.columns().map((c) => c.name);
        // libsql Row: 숫자 인덱스 + 열 이름 둘 다로 접근 가능
        const rows = objs.map((o) => {
          const r = columns.map((c) => o[c]);
          columns.forEach((c) => { Object.defineProperty(r, c, { value: o[c], enumerable: false }); });
          return r;
        });
        return { columns, rows, rowsAffected: /\bRETURNING\b/i.test(sql) ? rows.length : 0, lastInsertRowid: undefined };
      }
      const res = stmt.run(...args);
      return { columns: [], rows: [], rowsAffected: Number(res.changes), lastInsertRowid: BigInt(res.lastInsertRowid) };
    },
    async executeMultiple(sql) {
      calls.executeMultiple++;
      db.exec(sql);
    },
    close() { db.close(); },
  };
}
