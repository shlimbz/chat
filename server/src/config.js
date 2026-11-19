// 서버 설정 — 환경 변수로 덮어쓸 수 있습니다 (.env.example 참고)
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function parseOrigins(v) {
  if (!v || v.trim() === '*') return '*';
  return v.split(',').map((s) => s.trim().replace(/\/$/, '')).filter(Boolean);
}

export function loadConfig(env = process.env) {
  return {
    PORT: Number(env.PORT) || 3000,
    DB_PATH: env.DB_PATH || path.resolve(__dirname, '..', 'data', 'online-gym.sqlite'),
    // Turso 를 쓰려면 아래 두 값을 설정 (설정하면 DB_PATH 는 무시됨)
    TURSO_DATABASE_URL: (env.TURSO_DATABASE_URL || '').trim(),
    TURSO_AUTH_TOKEN: (env.TURSO_AUTH_TOKEN || '').trim(),
    CLIENT_ORIGIN: parseOrigins(env.CLIENT_ORIGIN),
    MAX_PLAYERS: Math.max(1, Number(env.MAX_PLAYERS) || 20),
    // 채팅 도배 방지: WINDOW_MS 동안 최대 MAX 개
    CHAT_RATE_MAX: 5,
    CHAT_RATE_WINDOW_MS: 5000,
  };
}
