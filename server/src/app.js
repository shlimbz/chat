// HTTP(Express) + Socket.IO 서버 생성 (테스트에서도 재사용)
//
// REST API (로그인·캐릭터 관리) — 게임 접속 전 단계
//   POST   /api/auth/register   { username, password }        → { token, account }
//   POST   /api/auth/login      { username, password }        → { token, account }
//   POST   /api/auth/logout     (Authorization: Bearer 토큰)
//   GET    /api/me                                             → { account, characters, maxCharacters }
//   POST   /api/characters      { nickname, appearance }       → { character }
//   PUT    /api/characters/:id  { appearance }                 → { character }
//   DELETE /api/characters/:id                                 → { ok }
//   POST   /api/characters/claim { tokens: [...] }             → { claimed: [...] }  (예전 버전 캐릭터 가져오기)
import http from 'node:http';
import express from 'express';
import { Server } from 'socket.io';
import { openDatabase } from './db.js';
import { AccountService } from './services/AccountService.js';
import { CharacterService, characterSummary } from './services/CharacterService.js';
import { ChatService, RateLimiter } from './services/ChatService.js';
import { attachGameHandlers } from './socket/handlers.js';
import { MAX_CHARACTERS } from '../../client/js/shared/protocol.js';

export async function createGameServer(config, { log = console.log, libsqlClient } = {}) {
  const db = await openDatabase(config, { libsqlClient });
  const adminNames = [...config.ADMIN_USERNAMES, ...(config.ADMIN_USERNAME ? [config.ADMIN_USERNAME] : [])];
  const accounts = new AccountService(db, {
    adminUsernames: adminNames,
    reservedUsernames: config.ADMIN_USERNAME ? [config.ADMIN_USERNAME] : [],
  });
  if (config.ADMIN_USERNAME || config.ADMIN_PASSWORD) {
    const r = config.ADMIN_USERNAME && config.ADMIN_PASSWORD
      ? await accounts.ensureAdmin(config.ADMIN_USERNAME, config.ADMIN_PASSWORD)
      : { ok: false, error: 'ADMIN_USERNAME 과 ADMIN_PASSWORD 를 둘 다 설정해야 합니다.' };
    log(r.ok ? `[admin] 관리자 계정 ${r.created ? '생성' : '확인'}: ${config.ADMIN_USERNAME}` : `[admin] 관리자 계정 설정 실패 — ${r.error}`);
  }
  // 만료된 세션 정리 (시작 시 + 6시간마다)
  const cleanup = () => accounts.cleanupSessions().catch((err) => log('[db] 세션 정리 실패', err));
  cleanup();
  const cleanupTimer = setInterval(cleanup, 6 * 3600 * 1000);
  cleanupTimer.unref?.();
  const characters = new CharacterService(db);
  const chat = new ChatService(db);
  // 로그인/가입 시도 제한 (비밀번호 무차별 대입 방지): IP 당 10분에 20회
  const authLimiter = new RateLimiter(20, 10 * 60 * 1000);

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', true); // Render 등 프록시 뒤에서 실제 접속 IP 사용

  // CORS: 허용된 게임 화면 주소에서만 API 호출 가능
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    const allowed = config.CLIENT_ORIGIN === '*' || (origin && config.CLIENT_ORIGIN.includes(origin));
    if (origin && allowed) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.setHeader('Access-Control-Max-Age', '600');
    }
    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      res.end();
      return;
    }
    next();
  });
  app.use(express.json({ limit: '16kb' }));

  app.get('/', (req, res) => {
    res.type('text/plain; charset=utf-8').send('ONLINE GYM game server is running. (상태: /health)');
  });

  // async 핸들러 오류 처리
  const h = (fn) => (req, res) => {
    Promise.resolve(fn(req, res)).catch((err) => {
      log('[api] 오류', err);
      if (!res.headersSent) res.status(500).json({ error: '서버 오류가 발생했습니다. 잠시 후 다시 시도하세요.' });
    });
  };
  const bearer = (req) => {
    const v = req.headers.authorization || '';
    return v.startsWith('Bearer ') ? v.slice(7).trim() : null;
  };
  const requireAccount = async (req, res) => {
    const account = await accounts.fromSession(bearer(req));
    if (!account) {
      res.status(401).json({ error: '로그인이 필요합니다.', code: 'SESSION_INVALID' });
      return null;
    }
    if (account.banned) {
      res.status(403).json({ error: '이용이 제한된 계정입니다.', code: 'BANNED' });
      return null;
    }
    return account;
  };
  const publicAccount = (a) => ({ username: a.username, isAdmin: a.isAdmin });
  const clientIp = (req) => req.ip || req.socket?.remoteAddress || 'unknown';

  app.post('/api/auth/register', h(async (req, res) => {
    if (!authLimiter.allow(clientIp(req))) return res.status(429).json({ error: '시도가 너무 많습니다. 10분 후 다시 시도하세요.' });
    const { username, password } = req.body || {};
    const r = await accounts.register(username, password);
    if (!r.ok) return res.status(400).json({ error: r.error });
    log(`[account] 가입: ${r.account.username}`);
    return res.json({ token: r.token, account: publicAccount(r.account) });
  }));

  app.post('/api/auth/login', h(async (req, res) => {
    if (!authLimiter.allow(clientIp(req))) return res.status(429).json({ error: '시도가 너무 많습니다. 10분 후 다시 시도하세요.' });
    const { username, password } = req.body || {};
    const r = await accounts.login(username, password);
    if (!r.ok) return res.status(r.code === 'BANNED' ? 403 : 401).json({ error: r.error, code: r.code });
    return res.json({ token: r.token, account: publicAccount(r.account) });
  }));

  app.post('/api/auth/logout', h(async (req, res) => {
    await accounts.logout(bearer(req));
    res.json({ ok: true });
  }));

  app.get('/api/me', h(async (req, res) => {
    const account = await requireAccount(req, res);
    if (!account) return;
    const list = await characters.listByAccount(account.id);
    res.json({ account: publicAccount(account), characters: list.map(characterSummary), maxCharacters: MAX_CHARACTERS });
  }));

  app.post('/api/characters', h(async (req, res) => {
    const account = await requireAccount(req, res);
    if (!account) return;
    const { nickname, appearance } = req.body || {};
    const r = await characters.create(account.id, nickname, appearance);
    if (!r.ok) return res.status(400).json({ error: r.error });
    log(`[character] 생성: ${r.character.nickname} (${account.username})`);
    return res.json({ character: characterSummary(r.character) });
  }));

  app.put('/api/characters/:id', h(async (req, res) => {
    const account = await requireAccount(req, res);
    if (!account) return;
    const c = await characters.findOwned(account.id, Number(req.params.id));
    if (!c) return res.status(404).json({ error: '캐릭터를 찾을 수 없습니다.' });
    c.appearance = await characters.updateAppearance(c.id, req.body?.appearance);
    return res.json({ character: characterSummary(c) });
  }));

  app.delete('/api/characters/:id', h(async (req, res) => {
    const account = await requireAccount(req, res);
    if (!account) return;
    const c = await characters.findOwned(account.id, Number(req.params.id));
    if (!c) return res.status(404).json({ error: '캐릭터를 찾을 수 없습니다.' });
    game.kickCharacter(c.id, '캐릭터가 삭제되었습니다.');
    await characters.softDelete(c.id);
    log(`[character] 삭제: ${c.nickname} (${account.username})`);
    return res.json({ ok: true });
  }));

  app.post('/api/characters/claim', h(async (req, res) => {
    const account = await requireAccount(req, res);
    if (!account) return;
    const tokens = Array.isArray(req.body?.tokens) ? req.body.tokens.slice(0, 10) : [];
    const claimed = [];
    for (const t of tokens) {
      const c = await characters.claimLegacy(account.id, t);
      if (c) claimed.push(characterSummary(c));
    }
    return res.json({ claimed });
  }));

  const httpServer = http.createServer(app);
  const io = new Server(httpServer, {
    cors: { origin: config.CLIENT_ORIGIN, methods: ['GET', 'POST'] },
    maxHttpBufferSize: 16 * 1024, // 비정상적으로 큰 패킷 차단
    pingInterval: 20000,
    pingTimeout: 20000,
  });

  const game = attachGameHandlers(io, {
    config, accounts, characters, chat, log,
  });

  app.get('/health', (req, res) => {
    res.json({ ok: true, online: game.registry.count, maxPlayers: config.MAX_PLAYERS, db: db.kind, time: Date.now() });
  });

  return {
    app,
    io,
    httpServer,
    db,
    dbDescription: db.describe(),
    game,
    listen(port = config.PORT) {
      return new Promise((resolve) => httpServer.listen(port, () => resolve(httpServer.address().port)));
    },
    async close() {
      clearInterval(cleanupTimer);
      await game.stop();
      await new Promise((resolve) => io.close(() => resolve()));
      await db.close();
    },
  };
}
