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
console.log('');

let closing = false;
async function shutdown(signal) {
  if (closing) return;
  closing = true;
  console.log(`\n${signal} 수신 — 접속자 위치를 저장하고 종료합니다...`);
  try {
    await server.close();
  } finally {
    process.exit(0);
  }
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
