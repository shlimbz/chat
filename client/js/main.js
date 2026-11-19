// 진입점: 캐릭터 생성 → (서버 접속) → 헬스장 입장
import { CharacterCreator } from './ui/CharacterCreator.js';
import { ConnectDialog } from './ui/ConnectDialog.js';
import { Game } from './core/Game.js';
import { loadProfile, saveProfile, loadSettings, loadToken, saveToken } from './core/storage.js';
import { resolveServerUrl } from './config.js';
import { AUTH_ERRORS, AUTH_ERROR_TEXT } from './shared/protocol.js';

const NICK_ERRORS = new Set([AUTH_ERRORS.NICK_TAKEN, AUTH_ERRORS.NICK_INVALID]);

async function boot() {
  window.__ONLINE_GYM_BOOTED = true;
  document.getElementById('loading')?.remove();

  const uiRoot = document.getElementById('ui');
  const container = document.getElementById('game');
  const creator = new CharacterCreator(uiRoot);
  const dialog = new ConnectDialog(uiRoot);
  const serverUrl = resolveServerUrl();

  let profile = loadProfile();
  let error = '';
  let network = null;
  let welcome = null;

  let needCreator = true;
  for (;;) {
    if (needCreator) {
      profile = await creator.open({ mode: 'create', profile, error });
      saveProfile(profile);
      error = '';
    }
    needCreator = true;
    if (!serverUrl) break; // 서버 주소가 없으면 오프라인 모드

    dialog.showProgress('서버에 접속하는 중…', serverUrl);
    try {
      const { NetworkClient } = await import('./net/NetworkClient.js');
      const current = profile;
      network = new NetworkClient(serverUrl, () => {
        // 저장된 토큰이 이 닉네임의 것이면 재접속, 아니면 새 캐릭터로 가입
        const saved = loadToken(serverUrl);
        const token = saved && saved.nickname === current.nickname ? saved.token : undefined;
        return { token, nickname: current.nickname, appearance: current.appearance };
      });
      welcome = await network.connect();
      dialog.hide();
      // 서버가 정한 닉네임(대소문자 등) 과 새 토큰 저장
      profile = { ...profile, nickname: welcome.self.nickname };
      saveProfile(profile);
      if (welcome.self.token) saveToken(serverUrl, welcome.self.nickname, welcome.self.token);
      break;
    } catch (err) {
      network = null;
      welcome = null;
      const code = err?.code || 'NETWORK';
      if (NICK_ERRORS.has(code)) {
        dialog.hide();
        error = AUTH_ERROR_TEXT[code];
        continue; // 캐릭터 화면으로 돌아가 닉네임 다시 입력
      }
      const msg = AUTH_ERROR_TEXT[code]
        || `게임 서버(${serverUrl})에 연결할 수 없습니다. 서버가 켜져 있는지 확인하세요. 무료 호스팅은 첫 접속에 30초~1분 정도 걸릴 수 있습니다.`;
      const choice = await dialog.ask('서버 접속 실패', msg, [
        { label: '다시 시도', value: 'retry', primary: true },
        { label: '오프라인으로 플레이', value: 'offline' },
      ]);
      if (choice === 'offline') break;
      needCreator = false; // 다시 시도: 캐릭터 화면 없이 바로 재접속
    }
  }

  const game = new Game({ container, uiRoot, profile, settings: loadSettings(), creator, network, welcome });
  game.start();
  game.hud.toast(network
    ? `${profile.nickname}님, ONLINE GYM에 오신 것을 환영합니다!`
    : `${profile.nickname}님, 오프라인 모드로 입장했습니다.`);
  window.__game = game; // 디버깅용 (개발자 도구 콘솔에서 __game 으로 접근)
}

boot().catch((err) => {
  console.error(err);
  const box = document.createElement('div');
  box.className = 'fatal';
  box.textContent = `게임을 시작하지 못했습니다: ${err?.message || err}`;
  document.body.append(box);
});
