// 진입점: 캐릭터 생성 → 헬스장 입장
import { CharacterCreator } from './ui/CharacterCreator.js';
import { Game } from './core/Game.js';
import { loadProfile, saveProfile, loadSettings } from './core/storage.js';

async function boot() {
  window.__ONLINE_GYM_BOOTED = true;
  document.getElementById('loading')?.remove();

  const uiRoot = document.getElementById('ui');
  const container = document.getElementById('game');

  const creator = new CharacterCreator(uiRoot);
  const saved = loadProfile();
  const profile = await creator.open({ mode: 'create', profile: saved });
  saveProfile(profile);

  const game = new Game({ container, uiRoot, profile, settings: loadSettings(), creator });
  game.start();
  game.hud.toast(`${profile.nickname}님, ONLINE GYM에 오신 것을 환영합니다!`);
  window.__game = game; // 디버깅용 (개발자 도구 콘솔에서 __game 으로 접근)
}

boot().catch((err) => {
  console.error(err);
  const box = document.createElement('div');
  box.className = 'fatal';
  box.textContent = `게임을 시작하지 못했습니다: ${err?.message || err}`;
  document.body.append(box);
});
