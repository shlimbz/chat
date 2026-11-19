// HTTP(Express) + Socket.IO 서버 생성 (테스트에서도 재사용)
import http from 'node:http';
import express from 'express';
import { Server } from 'socket.io';
import { openDatabase } from './db.js';
import { UserService } from './services/UserService.js';
import { ChatService } from './services/ChatService.js';
import { attachGameHandlers } from './socket/handlers.js';

export function createGameServer(config, { log = console.log } = {}) {
  const db = openDatabase(config.DB_PATH);
  const users = new UserService(db);
  const chat = new ChatService(db);

  const app = express();
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    // 상태 확인용 HTTP API 에 대한 CORS (게임 통신은 Socket.IO 설정을 따름)
    const origin = req.headers.origin;
    if (config.CLIENT_ORIGIN === '*' || (origin && config.CLIENT_ORIGIN.includes(origin))) {
      res.setHeader('Access-Control-Allow-Origin', origin || '*');
    }
    next();
  });
  app.get('/', (req, res) => {
    res.type('text/plain; charset=utf-8').send('ONLINE GYM game server is running. (상태: /health)');
  });

  const httpServer = http.createServer(app);
  const io = new Server(httpServer, {
    cors: { origin: config.CLIENT_ORIGIN, methods: ['GET', 'POST'] },
    maxHttpBufferSize: 16 * 1024, // 비정상적으로 큰 패킷 차단
    pingInterval: 20000,
    pingTimeout: 20000,
  });

  const game = attachGameHandlers(io, { config, users, chat, log });

  app.get('/health', (req, res) => {
    res.json({ ok: true, online: game.registry.count, maxPlayers: config.MAX_PLAYERS, time: Date.now() });
  });

  return {
    app,
    io,
    httpServer,
    db,
    game,
    listen(port = config.PORT) {
      return new Promise((resolve) => httpServer.listen(port, () => resolve(httpServer.address().port)));
    },
    async close() {
      game.stop();
      await new Promise((resolve) => io.close(() => resolve()));
      db.close();
    },
  };
}
