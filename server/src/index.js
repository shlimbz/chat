// ONLINE GYM 게임 서버 실행 진입점
//   npm start
import { loadConfig } from './config.js';
import { createGameServer } from './app.js';

const config = loadConfig();
const server = await createGameServer(config);
const port = await server.listen(config.PORT);

console.log('');
console.log('  ONLINE GYM 게임 서버 실행 중');
console.log(`  ▶ 주소: http://localhost:${port}   (상태 확인: /health)`);
console.log(`  ▶ DB  : ${server.dbDescription}`);
console.log(`  ▶ 허용 주소(CLIENT_ORIGIN): ${Array.isArray(config.CLIENT_ORIGIN) ? config.CLIENT_ORIGIN.join(', ') : '*'}`);
console.log(`  ▶ 최대 인원: ${config.MAX_PLAYERS}명`);
const adminList = [...(config.ADMIN_USERNAME ? [config.ADMIN_USERNAME] : []), ...config.ADMIN_USERNAMES];
console.log(`  ▶ 관리자 아이디: ${adminList.length ? adminList.join(', ') : '(없음 — ADMIN_USERNAME/ADMIN_PASSWORD 환경 변수로 지정)'}`);
console.log(`  ▶ 잠들지 않기: ${config.KEEP_ALIVE_URL ? `${config.KEEP_ALIVE_URL}/health 를 ${Math.round(config.KEEP_ALIVE_MS / 60000)}분마다 호출` : '꺼짐 (KEEP_ALIVE_URL 또는 RENDER_EXTERNAL_URL 없음)'}`);
console.log(`  ▶ NPC: ${config.NPC_COUNT}명`);
console.log('');

// ── 잠들지 않기 (Render 무료 서버): 자기 공개 주소로 주기적으로 요청 → 접속자가 없어도 깨어 있음 ──
let keepAlive = null;
if (config.KEEP_ALIVE_URL) {
  const ping = async () => {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 15000);
      const r = await fetch(`${config.KEEP_ALIVE_URL}/health?keepalive=1`, { signal: ctrl.signal });
      clearTimeout(t);
      if (!r.ok) console.log(`[keepalive] 응답 ${r.status}`);
    } catch (err) {
      console.log('[keepalive] 실패', err?.message || err);
    }
  };
  keepAlive = setInterval(ping, config.KEEP_ALIVE_MS);
  setTimeout(ping, 30000);
}

let closing = false;
async function shutdown(signal) {
  if (closing) return;
  closing = true;
  clearInterval(keepAlive);
  console.log(`\n${signal} 수신 — 접속자 위치를 저장하고 종료합니다...`);
  try {
    await server.close();
  } finally {
    process.exit(0);
  }
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
