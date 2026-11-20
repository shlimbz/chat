// Socket.IO 이벤트 처리 — 접속 인증(세션+캐릭터), 위치 동기화, 채팅, 전투, 관리자 기능
import {
  EV, AUTH_ERRORS, PROTOCOL_VERSION, SERVER_TICK_HZ, ATTACKS, ACTIONS, CHAT_TYPES,
} from '../../../client/js/shared/protocol.js';
import { sanitizeAppearance } from '../../../client/js/shared/appearance.js';
import { ECONOMY } from '../../../client/js/shared/economy.js';
import {
  exerciseSpots, PUNCHING_BAGS, shopPoint, SHOP_RANGE,
} from '../../../client/js/shared/gymLayout.js';
import { findPunchingBagTarget } from '../../../client/js/world/bagCollision.js';
import { bagInZone } from '../../../client/js/shared/bagMotion.js';
import {
  MAPS, GYM_PORTAL, GYM_RETURN, PORTAL_RANGE, TOWER_SPAWN, TOWER_CHECKPOINTS, MIN_CLEAR_MS, CLEAR_REWARD, standingOn,
} from '../../../client/js/shared/towerLayout.js';
import { PlayerRegistry } from '../game/PlayerRegistry.js';
import { NpcManager } from '../game/NpcManager.js';
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
export function attachGameHandlers(io, {
  config, accounts, characters, chat, economy, stats, log = console.log,
}) {
  const registry = new PlayerRegistry();
  const limiter = new RateLimiter(config.CHAT_RATE_MAX, config.CHAT_RATE_WINDOW_MS);
  const mutes = new Map(); // characterId → 해제 시각(ms)

  const sendSystem = (socket, text) => socket.emit(EV.CHAT, ChatService.system(text));
  const SPOTS = exerciseSpots();
  const BAGS = PUNCHING_BAGS.map((b, idx) => ({ worldX: b.x, worldZ: b.z, idx }));

  /** 같은 계정으로 접속한 모든 창에 지갑 상태 전송 */
  const sendWallet = (accountId, extra = {}) => {
    const view = economy.view(accountId);
    for (const p of registry.listByAccount(accountId)) io.to(p.socketId).emit(EV.WALLET, { ...view, ...extra });
  };

  /** 코인 지급 (검증된 행동만) → 받은 사람에게 알림 */
  const reward = (p, amount, reason) => {
    const got = economy.earn(p.accountId, amount);
    if (got > 0) { p.capNotified = false; sendWallet(p.accountId, { gained: got, reason }); }
    else if (!p.capNotified) {
      p.capNotified = true;
      const s = io.sockets.sockets.get(p.socketId);
      if (s) sendSystem(s, `이번 시간에 벌 수 있는 코인(${ECONOMY.HOURLY_CAP})을 모두 벌었어요. 잠시 쉬었다 오세요!`);
    }
  };

  /** 보유하지 않게 된 아이템은 착용 해제 (판매 후) */
  const refreshOwnedAppearance = (accountId) => {
    const owned = economy.items(accountId);
    for (const p of registry.listByAccount(accountId)) {
      const clean = sanitizeAppearance(p.appearance, { ownedItems: owned });
      if (JSON.stringify(clean.acc) === JSON.stringify(p.appearance.acc)) continue;
      p.appearance = clean;
      io.emit(EV.PLAYER_APPEARANCE, { id: p.id, appearance: clean });
      characters.updateAppearance(p.id, clean, owned).catch((err) => log('[db] 외형 저장 실패', err));
    }
  };
  const broadcastSystem = (text) => io.emit(EV.CHAT, ChatService.system(text));

  // ── NPC (헬스장을 돌아다니며 운동) ──
  const npcs = new NpcManager({
    count: config.NPC_COUNT ?? 6,
    // 사람이 그 자리를 쓰고 있거나 바로 앞에 서 있으면 NPC 는 다른 곳으로
    isTaken: (dest) => registry.list().some((p) => {
      if (p.map !== MAPS.GYM) return false;
      const near = dest.kind === 'bag' || dest.kind === 'hang' ? 0.9 : 0.6;
      return Math.hypot(p.x - dest.spot.x, p.z - dest.spot.z) < near || Math.hypot(p.x - dest.approach.x, p.z - dest.approach.z) < 0.5;
    }),
    onAttack: (n, type) => io.emit(EV.ATTACK_FX, { id: n.id, type }),
    onSay: (n, text) => io.emit(EV.NPC_SAY, { id: n.id, text }),
  });

  // ── 득근 타워 ──
  const fmtClear = (ms) => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}.${Math.floor((ms % 1000) / 100)}`;
  /** 다음 접속 위치: 타워에 있었으면 헬스장 포탈 앞 */
  const lastSeenOf = (p) => (p.map === MAPS.TOWER ? { x: GYM_RETURN.x, z: GYM_RETURN.z, r: GYM_RETURN.r } : { x: p.x, z: p.z, r: p.r });
  const startTowerRun = (p, now = Date.now()) => {
    p.tcp = 0;
    p.tStart = now;
    p.tCleared = false;
  };
  const towerState = (p, extra = {}) => {
    io.to(p.socketId).emit(EV.TOWER_STATE, { cp: p.tcp, startedAt: p.tStart, ...extra });
  };
  /** 이동이 반영된 뒤: 다음 체크포인트(이후 아무 체크포인트) 위에 서 있으면 통과 */
  const towerProgress = (p, now = Date.now()) => {
    for (let i = TOWER_CHECKPOINTS.length - 1; i > p.tcp; i--) {
      const cp = TOWER_CHECKPOINTS[i];
      if (!standingOn(cp, p.x, p.y, p.z)) continue;
      p.tcp = i;
      if (!cp.goal) { towerState(p); return; }
      if (p.tCleared) { towerState(p); return; }
      p.tCleared = true;
      const ms = now - p.tStart;
      if (ms < MIN_CLEAR_MS) {
        towerState(p, { clearMs: ms, coins: 0, tooFast: true });
        log(`[tower] ${p.nickname} 비정상적으로 빠른 클리어 (${ms}ms) — 보상 없음`);
        return;
      }
      const got = economy.earn(p.accountId, CLEAR_REWARD);
      if (got > 0) sendWallet(p.accountId, { gained: got, reason: 'tower' });
      towerState(p, { clearMs: ms, coins: got });
      broadcastSystem(`🏆 ${p.nickname}님이 득근 타워 정상에 올랐습니다! (${fmtClear(ms)})`);
      return;
    }
  };

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
      socket.data.wallet = await economy.open(account.id);
      socket.data.walletOpen = true;
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
  async function adminAction(admin, {
    action, target, reason, minutes, text, amount,
  }) {
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
      case 'give': {
        const c = online ? { accountId: online.accountId, nickname: online.nickname } : await characters.findByNickname(target);
        if (!c?.accountId) return { ok: false, message: `'${target}' 캐릭터(또는 계정)를 찾을 수 없습니다.` };
        const n = Math.max(-1e6, Math.min(1e6, Math.trunc(Number(amount) || 0)));
        if (!n) return { ok: false, message: '지급할 코인 수를 입력하세요.' };
        const coins = await economy.adminGive(c.accountId, n);
        sendWallet(c.accountId, n > 0 ? { gained: n, reason: 'admin' } : {});
        return { ok: true, message: `${c.nickname}님에게 ${n > 0 ? `${n}코인 지급` : `${-n}코인 회수`} (현재 ${coins}코인)` };
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

    const wallet = socket.data.wallet;
    // 저장된 외형 중 보유하지 않은 아이템은 벗김
    const startUser = { ...user, appearance: sanitizeAppearance(user.appearance, { ownedItems: wallet.items }) };
    const player = registry.add(socket.id, startUser, Date.now(), {
      accountId: account.id, username: account.username, admin: account.isAdmin,
    });
    player.exAcc = 0;
    stats.setName(user.id, user.nickname);
    player.bagCoinAt = 0;
    log(`[join] ${user.nickname} (#${user.id}, ${account.username}${account.isAdmin ? ', 관리자' : ''}) — 현재 ${registry.count}명`);

    socket.emit(EV.WELCOME, {
      self: {
        id: user.id,
        nickname: user.nickname,
        level: user.level,
        admin: account.isAdmin,
        username: account.username,
        x: player.x, z: player.z, r: player.r,
        appearance: player.appearance,
        wallet,
      },
      players: [...registry.list().filter((p) => p !== player), ...npcs.list()].map(PlayerRegistry.info),
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
      else if (res === 'ok' && p.map === MAPS.TOWER) towerProgress(p);
    });

    // ── 맵 이동 (포탈): 서버가 아는 위치로 포탈 근처인지 확인 ──
    socket.on(EV.MAP_TRAVEL, (req, ack) => {
      if (typeof ack !== 'function') return;
      const p = registry.get(socket.id);
      if (!p) { ack({ ok: false, message: '잘못된 요청입니다.' }); return; }
      const to = req?.to;
      if (to === MAPS.TOWER && p.map === MAPS.GYM) {
        if (Math.hypot(p.x - GYM_PORTAL.x, p.z - GYM_PORTAL.z) > PORTAL_RANGE) {
          ack({ ok: false, message: '포탈 가까이에서만 이동할 수 있어요.' });
          return;
        }
        registry.place(p, TOWER_SPAWN, MAPS.TOWER);
        startTowerRun(p);
      } else if (to === MAPS.GYM && p.map === MAPS.TOWER) {
        // 타워 어디서든 헬스장으로 돌아갈 수 있음 (포탈 앞에 도착)
        registry.place(p, GYM_RETURN, MAPS.GYM);
      } else {
        ack({ ok: false, message: '지금은 이동할 수 없어요.' });
        return;
      }
      ack({
        ok: true, map: p.map, x: p.x, y: p.y, z: p.z, r: p.r, cp: p.tcp ?? 0, startedAt: p.tStart ?? Date.now(),
      });
    });

    // ── 타워: 체크포인트로 되돌리기 / 처음부터 ──
    socket.on(EV.TOWER_RESPAWN, (req, ack) => {
      if (typeof ack !== 'function') return;
      const p = registry.get(socket.id);
      if (!p || p.map !== MAPS.TOWER) { ack({ ok: false }); return; }
      if (req?.restart) startTowerRun(p);
      const cp = TOWER_CHECKPOINTS[p.tcp] || TOWER_CHECKPOINTS[0];
      registry.place(p, { x: cp.x, y: cp.top, z: cp.z }, MAPS.TOWER);
      ack({
        ok: true, x: p.x, y: p.y, z: p.z, r: p.r, cp: p.tcp, startedAt: p.tStart,
      });
    });

    // ── 핑 측정 ──────────────────────────────────────
    socket.on(EV.PING, (t, ack) => { if (typeof ack === 'function') ack(t); });

    // ── 공격 ─────────────────────────────────────────
    socket.on(EV.ATTACK, (msg) => {
      const p = registry.get(socket.id);
      const type = typeof msg === 'string' ? msg : msg?.type;
      if (!p || !ATTACKS[type]) return;
      const res = resolveAttack(p, [...registry.list(), ...npcs.list()], type);
      if (!res.ok) return;
      socket.broadcast.emit(EV.ATTACK_FX, { id: p.id, type });
      for (const h of res.hits) {
        io.emit(EV.HIT, { from: p.id, to: h.target.id, type, kx: h.kx, kz: h.kz, down: h.down });
        if (h.target.npc) npcs.onHit(h.target);
      }
      // ── 샌드백: 서버가 아는 위치·방향으로 다시 판정 + "가운데(초록 불)" 타이밍 판정 ──
      const reach = type === 'kick' ? 1.05 : 0.9;
      const bagIdx = findPunchingBagTarget(BAGS, {
        hitX: p.x + Math.sin(p.r) * reach, hitZ: p.z + Math.cos(p.r) * reach, fromX: p.x, fromZ: p.z, rotY: p.r,
      })?.idx;
      if (bagIdx === undefined) return;
      const now = Date.now();
      // 친 사람 화면의 서버 시각 (네트워크 지연만큼 과거) — 너무 옛날/미래 값은 믿지 않음
      const ct = Number(msg?.t);
      const t = Number.isFinite(ct) && ct <= now + 50 && ct >= now - 450 ? ct : now - 120;
      const perfect = bagInZone(bagIdx, t + ATTACKS[type].windupMs); // 팔/다리가 닿는 순간 기준
      let coins = 0;
      if (perfect) {
        stats.addBagHit(p.id);
        if (now - p.bagCoinAt >= ECONOMY.BAG_COIN_COOLDOWN_MS) {
          p.bagCoinAt = now;
          coins = economy.earn(p.accountId, type === 'kick' ? ECONOMY.BAG_PERFECT_KICK : ECONOMY.BAG_PERFECT_PUNCH);
          if (coins > 0) sendWallet(p.accountId, { gained: coins, reason: 'bag' });
        }
      }
      socket.emit(EV.BAG_RESULT, { bag: bagIdx, perfect, coins, type });
    });

    // ── 외형 변경 ─────────────────────────────────────
    socket.on(EV.SET_APPEARANCE, (appearance) => {
      const p = registry.get(socket.id);
      if (!p) return;
      const owned = economy.items(account.id);
      p.appearance = sanitizeAppearance(appearance, { ownedItems: owned });
      socket.broadcast.emit(EV.PLAYER_APPEARANCE, { id: p.id, appearance: p.appearance });
      characters.updateAppearance(p.id, p.appearance, owned).catch((err) => log('[db] 외형 저장 실패', err));
    });

    // ── 상점 (구매/판매) ──────────────────────────────
    const SHOP_AT = shopPoint();
    const shop = (event, fn) => socket.on(event, (itemId, ack) => {
      if (typeof ack !== 'function') return;
      if (typeof itemId !== 'string' || itemId.length > 40) { ack({ ok: false, message: '잘못된 요청입니다.' }); return; }
      // 상점 가판대 앞에서만 사고팔 수 있음 (서버가 아는 위치로 확인)
      const me = registry.get(socket.id);
      if (!me || Math.hypot(me.x - SHOP_AT.x, me.z - SHOP_AT.z) > SHOP_RANGE) {
        ack({ ok: false, message: '상점 가판대 앞에서만 사고팔 수 있어요.' });
        return;
      }
      fn(itemId).then((r) => {
        ack(r);
        if (r.ok) {
          sendWallet(account.id);
          if (event === EV.SHOP_SELL) refreshOwnedAppearance(account.id);
          log(`[shop] ${account.username} ${event === EV.SHOP_BUY ? '구매' : '판매'} ${itemId} → ${r.coins}코인`);
        }
      }, (err) => {
        log(`[shop] 오류`, err);
        ack({ ok: false, message: '처리 중 오류가 발생했습니다.' });
      });
    });
    shop(EV.SHOP_BUY, (id) => economy.buy(account.id, id));
    shop(EV.SHOP_SELL, (id) => economy.sell(account.id, id));

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
          // 먼저 모두에게 보내고, DB 저장은 뒤에서 (DB 왕복 시간만큼 채팅이 밀리지 않게)
          const { msg, saved } = chat.post(CHAT_TYPES.GLOBAL, p, null, cmd.text);
          io.emit(EV.CHAT, msg);
          saved.catch((err) => log('[chat] 저장 실패', err));
          break;
        }
        case 'whisper':
        case 'reply': {
          const targetName = cmd.kind === 'reply' ? p.lastWhisperPartner : cmd.target;
          if (!targetName) { sendSystem(socket, '답장할 귓속말 상대가 없습니다.'); break; }
          const target = registry.getByNickname(targetName);
          if (!target) { sendSystem(socket, `'${targetName}'님은 현재 접속 중이 아닙니다.`); break; }
          if (target.id === p.id) { sendSystem(socket, '자기 자신에게는 귓속말을 보낼 수 없습니다.'); break; }
          const { msg, saved } = chat.post(CHAT_TYPES.WHISPER, p, target, cmd.text);
          saved.catch((err) => log('[chat] 저장 실패', err));
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
    query(EV.RANKING, async () => ({ ...(await stats.ranking(10)), me: { id: user.id, ...(await stats.mine(user.id)) } }), { day: '', exercise: [], bag: [] });
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
        amount: req.amount,
      });
      if (r.ok) log(`[admin] ${p.nickname}: ${req.action} ${req.target || ''}`);
      return r;
    }, { ok: false, message: '처리 중 오류가 발생했습니다.' });

    // ── 퇴장 ─────────────────────────────────────────
    socket.on('disconnect', (reason) => {
      if (socket.data.walletOpen) {
        socket.data.walletOpen = false;
        economy.close(account.id).catch((err) => log('[db] 코인 저장 실패', err));
      }
      const p = registry.remove(socket.id);
      if (!p) return; // 중복 접속으로 교체된 경우
      characters.saveLastSeen(p.id, lastSeenOf(p)).catch((err) => log('[db] 위치 저장 실패', err));
      limiter.forget(p.id);
      io.emit(EV.PLAYER_LEAVE, { id: p.id });
      broadcastSystem(`${p.nickname}님이 퇴장했습니다.`);
      log(`[leave] ${p.nickname} (${reason}) — 현재 ${registry.count}명`);
    });
  });

  // ── 위치 브로드캐스트 (변경된 플레이어만) + 서버 시각 → 클라이언트가 일정한 간격으로 보간 ──
  let lastTick = Date.now();
  const tick = setInterval(() => {
    const now = Date.now();
    // 보는 사람이 있을 때만 NPC 를 움직임 (아무도 없으면 계산 안 함)
    if (registry.count) npcs.update(Math.min(0.5, (now - lastTick) / 1000), now);
    lastTick = now;
    const packet = registry.takeStatePacket().concat(npcs.takeStatePacket());
    if (packet.length) io.emit(EV.STATE, { t: Date.now(), p: packet });
  }, 1000 / SERVER_TICK_HZ);

  // ── 운동 코인: 1초마다 "기구 자리에서 그 기구 운동 중" 인 사람만 적립 ──
  const exerciseTick = setInterval(() => {
    for (const p of registry.list()) {
      const action = ACTIONS[p.a] || 'idle';
      const ok = action.startsWith('ex_') && SPOTS.some((s) => s.exercise === action
        && Math.hypot(s.x - p.x, s.z - p.z) <= ECONOMY.SPOT_TOLERANCE);
      if (!ok) { p.exAcc = 0; continue; }
      stats.addExercise(p.id, 1);
      p.exAcc += 1;
      if (p.exAcc >= ECONOMY.EXERCISE_SECONDS_PER_COIN) {
        p.exAcc = 0;
        reward(p, 1, 'exercise');
      }
    }
  }, 1000);
  // ── 실시간 랭킹: 5초마다 계산해서 바뀌었을 때만 모두에게 전송 ──
  let lastRanking = '';
  const rankingTimer = setInterval(() => {
    if (!registry.count) return;
    stats.ranking(10).then((r) => {
      const key = JSON.stringify(r);
      if (key === lastRanking) return;
      lastRanking = key;
      io.emit(EV.RANKING_LIVE, r);
    }, (err) => log('[ranking] 오류', err));
  }, 5000);
  const flushTimer = setInterval(() => {
    economy.flushAll();
    stats.flush().catch((err) => log('[db] 랭킹 저장 실패', err));
  }, ECONOMY.FLUSH_MS);

  return {
    registry,
    npcs,
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
      clearInterval(exerciseTick);
      clearInterval(flushTimer);
      clearInterval(rankingTimer);
      await economy.flushAll();
      await stats.flush().catch(() => {});
      await Promise.allSettled(registry.list().map((p) => characters.saveLastSeen(p.id, lastSeenOf(p))));
    },
  };
}
