// 진입점
//  온라인: 서버 깨우기 → 로그인(자동 로그인) → 캐릭터 선택/생성 → 서버 접속 → 헬스장
//  오프라인: 캐릭터 만들기 → 헬스장 (서버 주소가 없거나 "오프라인으로 둘러보기" 선택 시)
import { CharacterCreator } from './ui/CharacterCreator.js';
import { ConnectDialog } from './ui/ConnectDialog.js';
import { LoginScreen, CharacterSelect } from './ui/AccountScreens.js';
import { Game } from './core/Game.js';
import { ApiClient } from './net/ApiClient.js';
import {
  loadProfile, saveProfile, loadSettings, saveSettings, loadToken, clearTokens, loadSession, saveSession, clearSession,
} from './core/storage.js';
import { resolveServerUrl } from './config.js';
import { AUTH_ERRORS, AUTH_ERROR_TEXT } from './shared/protocol.js';
import { setupMobileDefaults } from './ui/mobile.js';

async function boot() {
  window.__ONLINE_GYM_BOOTED = true;
  document.getElementById('loading')?.remove();
  setupMobileDefaults(loadSettings, saveSettings);

  const uiRoot = document.getElementById('ui');
  const container = document.getElementById('game');
  const creator = new CharacterCreator(uiRoot);
  const dialog = new ConnectDialog(uiRoot);
  const serverUrl = resolveServerUrl();

  const startGame = (opts) => {
    const game = new Game({ container, uiRoot, settings: loadSettings(), creator, ...opts });
    game.start();
    window.__game = game; // 디버깅용 (개발자 도구 콘솔에서 __game 으로 접근)
    return game;
  };

  // ── 오프라인 모드 ──
  const playOffline = async () => {
    const profile = await creator.open({ mode: 'create', profile: loadProfile(), submitLabel: '오프라인으로 입장' });
    saveProfile(profile);
    const game = startGame({ profile });
    game.hud.toast(`${profile.nickname}님, 오프라인 모드로 입장했습니다.`);
  };

  if (!serverUrl) {
    await playOffline();
    return;
  }

  const login = new LoginScreen(uiRoot);
  const select = new CharacterSelect(uiRoot);
  const session = loadSession(serverUrl);
  const api = new ApiClient(serverUrl, session?.token || null);
  let loginError = '';

  // ── 서버 깨우기 (무료 서버는 잠들어 있으면 1분 정도 걸림) ──
  for (;;) {
    dialog.showProgress('서버에 연결하는 중…', '무료 서버는 처음 깨어날 때 최대 1분 정도 걸릴 수 있어요.');
    if (await api.wake()) break;
    const choice = await dialog.ask('서버 접속 실패', `게임 서버(${serverUrl})에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.`, [
      { label: '다시 시도', value: 'retry', primary: true },
      { label: '오프라인으로 둘러보기', value: 'offline' },
    ]);
    if (choice === 'offline') { await playOffline(); return; }
  }
  dialog.hide();

  for (;;) {
    // ── 1) 로그인 ──
    if (!api.token) {
      const onAuth = (kind) => async (username, password) => {
        try {
          const r = kind === 'login' ? await api.login(username, password) : await api.register(username, password);
          api.token = r.token;
          saveSession(serverUrl, { token: r.token, username: r.account.username });
          return null;
        } catch (e) {
          return e.code === 'NETWORK' ? '서버에 연결할 수 없습니다.' : e.message;
        }
      };
      const res = await login.open({ onLogin: onAuth('login'), onRegister: onAuth('register'), error: loginError });
      loginError = '';
      if (res === 'offline') { await playOffline(); return; }
    }

    // ── 2) 내 정보 + 캐릭터 목록 ──
    let me;
    try {
      // 예전 버전에서 만든 캐릭터가 이 브라우저에 있으면 계정으로 가져오기 (한 번만)
      const legacy = loadToken(serverUrl);
      if (legacy) {
        await api.claim([legacy.token]).catch(() => {});
        clearTokens(serverUrl);
      }
      me = await api.me();
    } catch (e) {
      if (e.status === 401 || e.status === 403) {
        clearSession(serverUrl);
        api.token = null;
        loginError = e.code === 'BANNED' ? AUTH_ERROR_TEXT.BANNED : '';
        continue;
      }
      await dialog.ask('오류', e.message === 'NETWORK' ? '서버에 연결할 수 없습니다.' : e.message, [{ label: '다시 시도', value: 'retry', primary: true }]);
      continue;
    }

    // 마지막으로 플레이한 캐릭터를 맨 앞에
    const lastId = loadSession(serverUrl)?.lastCharacterId;
    me.characters.sort((a, b) => (b.id === lastId) - (a.id === lastId));

    // ── 3) 캐릭터 선택 ──
    const choice = await select.open({
      account: me.account,
      characters: me.characters,
      max: me.maxCharacters,
      onCreate: () => creator.open({
        mode: 'create',
        submitLabel: '만들기',
        cancelable: true,
        onSubmit: async ({ nickname, appearance }) => {
          try {
            const r = await api.createCharacter(nickname, appearance);
            creator._created = r.character;
            return null;
          } catch (e) { return e.message; }
        },
      }).then((res) => (res ? creator._created : null)),
      onEdit: (c) => creator.open({
        mode: 'edit',
        profile: c,
        onSubmit: async ({ appearance }) => {
          try { await api.updateCharacter(c.id, appearance); return null; } catch (e) { return e.message; }
        },
      }).then((res) => (res ? { appearance: res.appearance } : null)),
      onDelete: async (c) => {
        try { await api.deleteCharacter(c.id); return null; } catch (e) { return e.message; }
      },
    });
    if (choice.logout) {
      await api.logout();
      clearSession(serverUrl);
      api.token = null;
      continue;
    }
    const character = choice.character;
    saveSession(serverUrl, { lastCharacterId: character.id });

    // ── 4) 게임 서버 접속 ──
    dialog.showProgress('헬스장에 입장하는 중…', character.nickname);
    const { NetworkClient } = await import('./net/NetworkClient.js');
    const network = new NetworkClient(serverUrl, () => ({ session: api.token, characterId: character.id }));
    let welcome;
    try {
      welcome = await network.connect();
    } catch (err) {
      const code = err?.code || 'NETWORK';
      dialog.hide();
      if (code === AUTH_ERRORS.SESSION_INVALID || code === AUTH_ERRORS.BANNED) {
        clearSession(serverUrl);
        api.token = null;
        loginError = AUTH_ERROR_TEXT[code];
        continue;
      }
      await dialog.ask('입장 실패', AUTH_ERROR_TEXT[code] || '게임 서버에 접속하지 못했습니다. 잠시 후 다시 시도해 주세요.', [
        { label: '확인', value: 'ok', primary: true },
      ]);
      continue;
    }
    dialog.hide();

    const game = startGame({
      profile: { nickname: welcome.self.nickname, appearance: character.appearance },
      network,
      welcome,
      account: { username: me.account.username, isAdmin: !!welcome.self.admin },
      onChangeCharacter: () => { network.disconnect(); window.location.reload(); },
      onLogout: async () => {
        network.disconnect();
        await api.logout();
        clearSession(serverUrl);
        window.location.reload();
      },
    });
    game.hud.toast(`${welcome.self.nickname}님, ONLINE GYM에 오신 것을 환영합니다!`);
    return;
  }
}

boot().catch((err) => {
  console.error(err);
  const box = document.createElement('div');
  box.className = 'fatal';
  box.textContent = `게임을 시작하지 못했습니다: ${err?.message || err}`;
  document.body.append(box);
});
