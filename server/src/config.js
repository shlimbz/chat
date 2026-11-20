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
    // 관리자 계정 아이디 (쉼표로 여러 개). 예: ADMIN_USERNAMES=shlimbz,friend01
    ADMIN_USERNAMES: (env.ADMIN_USERNAMES || '').split(',').map((s) => s.trim()).filter(Boolean),
    // 서버가 시작할 때 이 아이디/비밀번호로 관리자 계정을 자동으로 만들거나 비밀번호를 맞춤
    // (비밀번호는 코드나 GitHub 에 적지 말고 호스팅 서비스의 환경 변수에만 입력하세요)
    ADMIN_USERNAME: (env.ADMIN_USERNAME || '').trim(),
    ADMIN_PASSWORD: env.ADMIN_PASSWORD || '',
    // 잠들지 않기: 이 주소/health 를 10분마다 스스로 호출 (Render 무료 서버는 15분 동안 요청이 없으면 잠듦)
    // Render 는 RENDER_EXTERNAL_URL 을 자동으로 넣어 줌. KEEP_ALIVE=0 이면 끔
    KEEP_ALIVE_URL: env.KEEP_ALIVE === '0' ? '' : (env.KEEP_ALIVE_URL || env.RENDER_EXTERNAL_URL || '').trim().replace(/\/$/, ''),
    KEEP_ALIVE_MS: Math.max(60000, Number(env.KEEP_ALIVE_MS) || 10 * 60 * 1000),
    // 헬스장을 돌아다니며 운동하는 NPC 수 (기본 3, 0 이면 없음, 안내 코치는 별도)
    NPC_COUNT: Math.max(0, Math.min(10, env.NPC_COUNT === undefined ? 3 : Number(env.NPC_COUNT) || 0)),
    // 채팅 도배 방지: WINDOW_MS 동안 최대 MAX 개
    CHAT_RATE_MAX: 5,
    CHAT_RATE_WINDOW_MS: 5000,
  };
}
