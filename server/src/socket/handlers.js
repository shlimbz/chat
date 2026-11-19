// Socket.IO 이벤트 처리 — 접속 인증(세션+캐릭터), 위치 동기화, 채팅, 전투, 관리자 기능
import {
  EV, AUTH_ERRORS, PROTOCOL_VERSION, SERVER_TICK_HZ, ATTACKS,
} from '../../../client/js/shared/protocol.js';
import { sanitizeAppearance } from '../../../client/js/shared/appearance.js';
import { PlayerRegistry } from '../game/PlayerRegistry.js';
import { resolveAttack } from '../game/combat.js';
import {
  ChatService, RateLimiter, parseChatInput, HELP_TEXT, ADMIN_HELP_TEXT,
} from '../services/ChatService.js';

function authError(code) {
  const err = new Error(code);
  err.data = { code };
  return err;
}

/**
 * @param {import('socket.io').Server} io
 * @param {{config:object, accounts:import('../services/AccountService.js').AccountService,
 *          characters:import('../services/CharacterService.js').CharacterService, chat:ChatService, log?:Function}} deps
 */
export function attachGameHandlers(io, { config, accounts, characters, chat, log = console.log }) {
  const registry = new PlayerRegistry();
  const limiter = new RateLimiter(config.CHAT_RATE_MAX, config.CHAT_RATE_WINDOW_MS);
  const mutes = new Map(); // characterId → 해제 시각(ms)

  const sendSystem = (socket, text) => socket.emit(EV.CHAT, ChatService.system(text));
  const broadcastSystem = (text) => io.emit(EV.CHAT, ChatService.system(text));

  /** 플레이어 연결 강제 종료 */
  const kickPlayer = (p, reason) => {
    const s = io.sockets.sockets.get(p.socketId);
    if (!s) return;
    s.emit(EV.KICKED, { reason });
    s.disconnect(true);
  };

  // ── 접속 인증 (연결이 성립되기 전에 실행) ───────────────
  io.use(async (socket, next) => {
    try {
      const auth = socket.handshake.auth || {};
      if (auth.v !== PROTOCOL_VERSION) return next(authError(AUTH_ERRORS.BAD_VERSION));

      const account = await accounts.fromSession(auth.session);
      if (!account) return next(authError(AUTH_ERRORS.SESSION_INVALID));
      if (account.banned) return next(authError(AUTH_ERRORS.BANNED));

      const character = await characters.findOwned(account.id, Number(auth.characterId));
      if (!character) return next(authError(AUTH_ERRORS.CHARACTER_INVALID));

      const reconnecting = registry.getByUserId(character.id);
      if (!reconnecting && registry.count >= config.MAX_PLAYERS && !account.isAdmin) {
        return next(authError(AUTH_ERRORS.SERVER_FULL));
      }

      socket.data.account = account;
      socket.data.user = character;
      try {
        socket.data.history = await chat.initialHistory(character.id);
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

  // ── 관리자 기능 (채팅 명령어와 관리자 패널이 함께 사용) ──
  async function adminAction(admin, { action, target, reason, minutes, text }) {
    if (!admin.admin) return { ok: false, message: '관리자 권한이 없습니다.' };
    const online = target ? registry.getByNickname(target) : null;
    if (online?.admin && online !== admin && ['kick', 'ban', 'mute', 'delchar'].includes(action)) {
      return { ok: false, message: '다른 관리자에게는 사용할 수 없습니다.' };
    }
    const why = reason ? ` (사유: ${reason})` : '';
    switch (action) {
      case 'notice':
        if (!text) return { ok: false, message: '공지 내용이 없습니다.' };
        io.emit(EV.CHAT, ChatService.notice(admin.nickname, String(text).slice(0, 200)));
        return { ok: true, message: '공지를 보냈습니다.' };
      case 'kick':
        if (!online) return { ok: false, message: `'${target}'님은 접속 중이 아닙니다.` };
        kickPlayer(online, `관리자에 의해 추방되었습니다.${why}`);
        broadcastSystem(`${online.nickname}님이 관리자에 의해 추방되었습니다.`);
        return { ok: true, message: `${online.nickname}님을 추방했습니다.` };
      case 'ban': {
        const c = online ? { accountId: online.accountId, nickname: online.nickname } : await characters.findByNickname(target);
        if (!c?.accountId) return { ok: false, message: `'${target}' 캐릭터(또는 계정)를 찾을 수 없습니다.` };
        const acc = await accounts.findById(c.accountId);
        if (acc?.isAdmin) return { ok: false, message: '관리자 계정은 차단할 수 없습니다.' };
        await accounts.setBanned(c.accountId, true, reason);
        for (const p of registry.listByAccount(c.accountId)) kickPlayer(p, `계정 이용이 제한되었습니다.${why}`);
        broadcastSystem(`${c.nickname}님의 계정이 관리자에 의해 이용 제한되었습니다.`);
        return { ok: true, message: `${c.nickname}님의 계정(${acc?.username})을 차단했습니다. 해제: /unban ${acc?.username}` };
      }
      case 'unban': {
        const acc = await accounts.findByUsername(target);
        if (!acc) return { ok: false, message: `'${target}' 계정을 찾을 수 없습니다.` };
        await accounts.setBanned(acc.id, false);
        return { ok: true, message: `${acc.username} 계정의 이용 제한을 해제했습니다.` };
      }
      case 'mute': {
        if (!online) return { ok: false, message: `'${target}'님은 접속 중이 아닙니다.` };
        const m = Math.min(1440, Math.max(1, Number(minutes) || 10));
        mutes.set(online.id, Date.now() + m * 60000);
        io.to(online.socketId).emit(EV.CHAT, ChatService.system(`관리자에 의해 ${m}분 동안 채팅이 금지되었습니다.`));
        return { ok: true, message: `${online.nickname}님을 ${m}분 동안 채팅 금지했습니다.` };
      }
      case 'unmute': {
        const c = online || await characters.findByNickname(target);
        if (!c) return { ok: false, message: `'${target}' 캐릭터를 찾을 수 없습니다.` };
        mutes.delete(c.id);
        return { ok: true, message: `${c.nickname}님의 채팅 금지를 해제했습니다.` };
      }
      case 'delchar': {
        const c = online || await characters.findByNickname(target);
        if (!c) return { ok: false, message: `'${target}' 캐릭터를 찾을 수 없습니다.` };
        if (online) kickPlayer(online, '관리자에 의해 캐릭터가 삭제되었습니다.');
        await characters.softDelete(c.id);
        return { ok: true, message: `${c.nickname} 캐릭터를 삭제했습니다.` };
      }
      case 'deluser': {
        const acc = await accounts.findByUsername(target);
        if (!acc) return { ok: false, message: `'${target}' 계정을 찾을 수 없습니다.` };
        if (acc.isAdmin) return { ok: false, message: '관리자 계정은 삭제할 수 없습니다.' };
        for (const p of registry.listByAccount(acc.id)) kickPlayer(p, '관리자에 의해 계정이 삭제되었습니다.');
        await accounts.deleteAccount(acc.id);
        return { ok: true, message: `${acc.username} 계정과 캐릭터를 삭제했습니다.` };
      }
      default:
        return { ok: false, message: '알 수 없는 관리자 명령입니다.' };
    }
  }

  io.on('connection', (socket) => {
    const user = socket.data.user;
    const account = socket.data.account;

    // 같은 캐릭터의 이전 접속은 종료 (새로고침/다른 탭)
    const prev = registry.getByUserId(user.id);
    if (prev) {
      registry.remove(prev.socketId);
      const old = io.sockets.sockets.get(prev.socketId);
      if (old) {
        old.emit(EV.KICKED, { reason: '다른 창에서 같은 캐릭터로 접속하여 연결이 종료되었습니다.' });
        old.disconnect(true);
      }
    }

    const player = registry.add(socket.id, user, Date.now(), {
      accountId: account.id, username: account.username, admin: account.isAdmin,
    });
    log(`[join] ${user.nickname} (#${user.id}, ${account.username}${account.isAdmin ? ', 관리자' : ''}) — 현재 ${registry.count}명`);

    socket.emit(EV.WELCOME, {
      self: {
        id: user.id,
        nickname: user.nickname,
        level: user.level,
        admin: account.isAdmin,
        username: account.username,
        x: player.x, z: player.z, r: player.r,
      },
      players: registry.list().filter((p) => p !== player).map(PlayerRegistry.info),
      chat: socket.data.history,
      maxPlayers: config.MAX_PLAYERS,
      serverTime: Date.now(),
    });
    socket.data.history = null;
    socket.broadcast.emit(EV.PLAYER_JOIN, PlayerRegistry.info(player));
    if (!prev) broadcastSystem(`${user.nickname}님이 헬스장에 입장했습니다.`);

    // ── 이동 ─────────────────────────────────────────
    socket.on(EV.MOVE, (msg) => {
      const p = registry.get(socket.id);
      if (!p) return;
      const res = registry.applyMove(p, msg);
      if (res === 'corrected') socket.emit(EV.CORRECT, { x: p.x, y: p.y, z: p.z });
    });

    // ── 공격 ─────────────────────────────────────────
    socket.on(EV.ATTACK, (type) => {
      const p = registry.get(socket.id);
      if (!p || !ATTACKS[type]) return;
      const res = resolveAttack(p, registry.list(), type);
      if (!res.ok) return;
      socket.broadcast.emit(EV.ATTACK_FX, { id: p.id, type });
      for (const h of res.hits) {
        io.emit(EV.HIT, { from: p.id, to: h.target.id, type, kx: h.kx, kz: h.kz, down: h.down });
      }
    });

    // ── 외형 변경 ─────────────────────────────────────
    socket.on(EV.SET_APPEARANCE, (appearance) => {
      const p = registry.get(socket.id);
      if (!p) return;
      p.appearance = sanitizeAppearance(appearance);
      socket.broadcast.emit(EV.PLAYER_APPEARANCE, { id: p.id, appearance: p.appearance });
      characters.updateAppearance(p.id, p.appearance).catch((err) => log('[db] 외형 저장 실패', err));
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
      const mutedUntil = mutes.get(p.id) || 0;
      if (mutedUntil > Date.now() && (cmd.kind === 'global' || cmd.kind === 'whisper' || cmd.kind === 'reply')) {
        sendSystem(socket, `채팅 금지 중입니다. (${Math.ceil((mutedUntil - Date.now()) / 60000)}분 남음)`);
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
          if (p.admin) for (const line of ADMIN_HELP_TEXT) sendSystem(socket, line);
          break;
        case 'who': {
          const names = registry.list().map((x) => (x.admin ? `${x.nickname}[관리자]` : x.nickname));
          sendSystem(socket, `현재 접속자 ${names.length}명: ${names.join(', ')}`);
          break;
        }
        case 'admin': {
          const r = await adminAction(p, cmd);
          sendSystem(socket, r.message);
          if (r.ok) log(`[admin] ${p.nickname}: ${String(raw).slice(0, 100)}`);
          break;
        }
        case 'error':
        default:
          sendSystem(socket, cmd.error || '알 수 없는 입력입니다.');
      }
    };

    // 응답(ack)이 필요한 조회 요청: 오류가 나도 빈 결과로 응답
    const query = (event, fn, fallback = []) => socket.on(event, (req, ack) => {
      if (typeof ack !== 'function') return;
      fn(req).then(ack, (err) => { log(`[${event}] 오류`, err); ack(fallback); });
    });
    query(EV.CHAT_HISTORY, (req) => chat.globalHistory(Number(req?.beforeId)));
    query(EV.CHAT_PARTNERS, () => chat.whisperPartners(user.id));
    query(EV.CHAT_WHISPERS, async (req) => {
      const other = await characters.findByNickname(req?.nickname);
      return other ? chat.whispersBetween(user.id, other.id, Number(req?.beforeId)) : [];
    });
    query(EV.ADMIN_ACTION, async (req) => {
      const p = registry.get(socket.id);
      if (!p || typeof req !== 'object' || req === null) return { ok: false, message: '잘못된 요청입니다.' };
      const r = await adminAction(p, {
        action: String(req.action || ''),
        target: typeof req.target === 'string' ? req.target.slice(0, 40) : null,
        reason: typeof req.reason === 'string' ? req.reason.slice(0, 100) : null,
        minutes: req.minutes,
        text: typeof req.text === 'string' ? req.text : null,
      });
      if (r.ok) log(`[admin] ${p.nickname}: ${req.action} ${req.target || ''}`);
      return r;
    }, { ok: false, message: '처리 중 오류가 발생했습니다.' });

    // ── 퇴장 ─────────────────────────────────────────
    socket.on('disconnect', (reason) => {
      const p = registry.remove(socket.id);
      if (!p) return; // 중복 접속으로 교체된 경우
      characters.saveLastSeen(p.id, { x: p.x, z: p.z, r: p.r }).catch((err) => log('[db] 위치 저장 실패', err));
      limiter.forget(p.id);
      io.emit(EV.PLAYER_LEAVE, { id: p.id });
      broadcastSystem(`${p.nickname}님이 퇴장했습니다.`);
      log(`[leave] ${p.nickname} (${reason}) — 현재 ${registry.count}명`);
    });
  });

  // ── 위치 브로드캐스트 (변경된 플레이어만) + 서버 시각 → 클라이언트가 일정한 간격으로 보간 ──
  const tick = setInterval(() => {
    const packet = registry.takeStatePacket();
    if (packet.length) io.emit(EV.STATE, { t: Date.now(), p: packet });
  }, 1000 / SERVER_TICK_HZ);

  return {
    registry,
    /** REST API 에서 계정 차단/삭제 시 접속 중인 캐릭터를 내보내기 위해 사용 */
    kickAccount(accountId, reason) {
      for (const p of registry.listByAccount(accountId)) kickPlayer(p, reason);
    },
    kickCharacter(characterId, reason) {
      const p = registry.getByUserId(characterId);
      if (p) kickPlayer(p, reason);
    },
    async stop() {
      clearInterval(tick);
      await Promise.allSettled(registry.list().map((p) => characters.saveLastSeen(p.id, { x: p.x, z: p.z, r: p.r })));
    },
  };
}
