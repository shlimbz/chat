// Socket.IO 이벤트 처리 — 접속 인증, 위치 동기화, 채팅
import {
  EV, AUTH_ERRORS, PROTOCOL_VERSION, SERVER_TICK_HZ, CHAT_TYPES,
} from '../../../client/js/shared/protocol.js';
import { sanitizeAppearance } from '../../../client/js/shared/appearance.js';
import { PlayerRegistry } from '../game/PlayerRegistry.js';
import { ChatService, RateLimiter, parseChatInput, HELP_TEXT } from '../services/ChatService.js';

function authError(code) {
  const err = new Error(code);
  err.data = { code };
  return err;
}

/**
 * @param {import('socket.io').Server} io
 * @param {{config:object, users:import('../services/UserService.js').UserService, chat:ChatService, log?:Function}} deps
 */
export function attachGameHandlers(io, { config, users, chat, log = console.log }) {
  const registry = new PlayerRegistry();
  const limiter = new RateLimiter(config.CHAT_RATE_MAX, config.CHAT_RATE_WINDOW_MS);

  const sendSystem = (socket, text) => socket.emit(EV.CHAT, ChatService.system(text));
  const broadcastSystem = (text) => io.emit(EV.CHAT, ChatService.system(text));

  // ── 접속 인증 (연결이 성립되기 전에 실행) ───────────────
  io.use(async (socket, next) => {
    try {
      const auth = socket.handshake.auth || {};
      if (auth.v !== PROTOCOL_VERSION) return next(authError(AUTH_ERRORS.BAD_VERSION));

      let user = auth.token ? await users.findByToken(auth.token) : null;
      let newToken = null;
      if (!user) {
        // 토큰이 없거나 틀림 → 새 계정 등록. 기존 닉네임이면 거절 (사칭 방지)
        if (registry.count >= config.MAX_PLAYERS) return next(authError(AUTH_ERRORS.SERVER_FULL));
        const res = await users.register(auth.nickname, auth.appearance);
        if (!res.ok) return next(authError(AUTH_ERRORS[res.error]));
        user = res.user;
        newToken = res.token;
      } else if (auth.appearance) {
        user.appearance = await users.updateAppearance(user.id, auth.appearance);
      }

      const reconnecting = registry.getByUserId(user.id);
      if (!reconnecting && registry.count >= config.MAX_PLAYERS) return next(authError(AUTH_ERRORS.SERVER_FULL));

      socket.data.user = user;
      socket.data.newToken = newToken;
      // 채팅 기록은 연결 전에 미리 조회 (connection 처리를 동기적으로 유지하기 위해)
      try {
        socket.data.history = await chat.initialHistory(user.id);
      } catch (err) {
        log('[chat] 기록 조회 실패', err);
        socket.data.history = [];
      }
      return next();
    } catch (err) {
      log('[auth] error', err);
      return next(new Error('SERVER_ERROR'));
    }
  });

  io.on('connection', (socket) => {
    const user = socket.data.user;

    // 같은 계정의 이전 접속은 종료 (새로고침/다른 탭)
    const prev = registry.getByUserId(user.id);
    if (prev) {
      registry.remove(prev.socketId);
      const old = io.sockets.sockets.get(prev.socketId);
      if (old) {
        old.emit(EV.KICKED, { reason: '다른 창에서 같은 캐릭터로 접속하여 연결이 종료되었습니다.' });
        old.disconnect(true);
      }
    }

    const player = registry.add(socket.id, user);
    log(`[join] ${user.nickname} (#${user.id}) 접속 — 현재 ${registry.count}명`);

    socket.emit(EV.WELCOME, {
      self: {
        id: user.id,
        nickname: user.nickname,
        token: socket.data.newToken, // 새로 가입한 경우에만 값이 있음 → 클라이언트가 저장
        level: user.level,
        x: player.x, z: player.z, r: player.r,
      },
      players: registry.list().filter((p) => p !== player).map(PlayerRegistry.info),
      chat: socket.data.history,
      maxPlayers: config.MAX_PLAYERS,
      serverTime: Date.now(),
    });
    socket.broadcast.emit(EV.PLAYER_JOIN, PlayerRegistry.info(player));
    if (!prev) broadcastSystem(`${user.nickname}님이 헬스장에 입장했습니다.`);

    // ── 이동 ─────────────────────────────────────────
    socket.on(EV.MOVE, (msg) => {
      const p = registry.get(socket.id);
      if (!p) return;
      const res = registry.applyMove(p, msg);
      if (res === 'corrected') socket.emit(EV.CORRECT, { x: p.x, y: p.y, z: p.z });
    });

    // ── 외형 변경 ─────────────────────────────────────
    socket.on(EV.SET_APPEARANCE, (appearance) => {
      const p = registry.get(socket.id);
      if (!p) return;
      p.appearance = sanitizeAppearance(appearance);
      socket.broadcast.emit(EV.PLAYER_APPEARANCE, { id: p.id, appearance: p.appearance });
      users.updateAppearance(p.id, p.appearance).catch((err) => log('[db] 외형 저장 실패', err));
    });

    // ── 채팅 ─────────────────────────────────────────
    socket.on(EV.CHAT_SEND, (raw) => {
      handleChat(raw).catch((err) => {
        log('[chat] 오류', err);
        sendSystem(socket, '메시지를 처리하지 못했습니다. 잠시 후 다시 시도하세요.');
      });
    });

    const handleChat = async (raw) => {
      const p = registry.get(socket.id);
      if (!p) return;
      const cmd = parseChatInput(raw);
      if (cmd.kind === 'empty') return;
      if (!limiter.allow(p.id)) {
        sendSystem(socket, '메시지를 너무 빠르게 보내고 있습니다. 잠시 후 다시 시도하세요.');
        return;
      }
      switch (cmd.kind) {
        case 'global': {
          io.emit(EV.CHAT, await chat.saveGlobal(p, cmd.text));
          break;
        }
        case 'whisper':
        case 'reply': {
          const targetName = cmd.kind === 'reply' ? p.lastWhisperPartner : cmd.target;
          if (!targetName) { sendSystem(socket, '답장할 귓속말 상대가 없습니다.'); break; }
          const target = registry.getByNickname(targetName);
          if (!target) { sendSystem(socket, `'${targetName}'님은 현재 접속 중이 아닙니다.`); break; }
          if (target.id === p.id) { sendSystem(socket, '자기 자신에게는 귓속말을 보낼 수 없습니다.'); break; }
          const msg = await chat.saveWhisper(p, target, cmd.text);
          // 귓속말은 보낸 사람과 받는 사람에게만 전송 (전체 브로드캐스트 금지)
          io.to(target.socketId).emit(EV.CHAT, msg);
          socket.emit(EV.CHAT, msg);
          p.lastWhisperPartner = target.nickname;
          target.lastWhisperPartner = p.nickname;
          break;
        }
        case 'help':
          for (const line of HELP_TEXT) sendSystem(socket, line);
          break;
        case 'who': {
          const names = registry.list().map((x) => x.nickname);
          sendSystem(socket, `현재 접속자 ${names.length}명: ${names.join(', ')}`);
          break;
        }
        case 'error':
        default:
          sendSystem(socket, cmd.error || '알 수 없는 입력입니다.');
      }
    };

    // 응답(ack)이 필요한 조회 요청: 오류가 나도 빈 결과로 응답
    const query = (event, fn) => socket.on(event, (req, ack) => {
      if (typeof ack !== 'function') return;
      fn(req).then(ack, (err) => { log(`[${event}] 오류`, err); ack([]); });
    });
    query(EV.CHAT_HISTORY, (req) => chat.globalHistory(Number(req?.beforeId)));
    query(EV.CHAT_PARTNERS, () => chat.whisperPartners(user.id));
    query(EV.CHAT_WHISPERS, async (req) => {
      const other = await users.findByNickname(req?.nickname);
      return other ? chat.whispersBetween(user.id, other.id, Number(req?.beforeId)) : [];
    });

    // ── 퇴장 ─────────────────────────────────────────
    socket.on('disconnect', (reason) => {
      const p = registry.remove(socket.id);
      if (!p) return; // 중복 접속으로 교체된 경우
      users.saveLastSeen(p.id, { x: p.x, z: p.z, r: p.r }).catch((err) => log('[db] 위치 저장 실패', err));
      limiter.forget(p.id);
      io.emit(EV.PLAYER_LEAVE, { id: p.id });
      broadcastSystem(`${p.nickname}님이 퇴장했습니다.`);
      log(`[leave] ${p.nickname} (${reason}) — 현재 ${registry.count}명`);
    });
  });

  // ── 위치 브로드캐스트 (변경된 플레이어만, 초당 SERVER_TICK_HZ 회) ──
  const tick = setInterval(() => {
    const packet = registry.takeStatePacket();
    if (packet.length) io.volatile.emit(EV.STATE, packet);
  }, 1000 / SERVER_TICK_HZ);

  return {
    registry,
    async stop() {
      clearInterval(tick);
      await Promise.allSettled(registry.list().map((p) => users.saveLastSeen(p.id, { x: p.x, z: p.z, r: p.r })));
    },
  };
}

export { CHAT_TYPES };
