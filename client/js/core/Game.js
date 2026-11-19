// 게임 본체: 렌더러/씬/루프 + 각 모듈 연결
// Phase 2 이후 확장 지점:
//   - this.network    : 서버 연결 (위치 전송, 다른 플레이어 수신)
//   - this.remotePlayers : Map<id, RemotePlayer>
//   - this.minigames  : Map<기구 type, 미니게임 모듈>  ← Phase 4 에서 registerMinigame 으로 등록
import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { Input } from './Input.js';
import { CameraController } from './CameraController.js';
import { Gym, GYM_SIZE, SPAWN_POINT } from '../world/Gym.js';
import { CharacterModel } from '../character/CharacterModel.js';
import { PlayerController } from '../character/PlayerController.js';
import { HUD } from '../ui/HUD.js';
import { Menu } from '../ui/Menu.js';
import { saveProfile, saveSettings, QUALITY_PRESETS } from './storage.js';
import { EQUIPMENT_TYPES } from '../shared/equipmentTypes.js';

export class Game {
  /**
   * @param {{container:HTMLElement, uiRoot:HTMLElement, profile:object, settings:object, creator:import('../ui/CharacterCreator.js').CharacterCreator}} opts
   */
  constructor({ container, uiRoot, profile, settings, creator }) {
    this.container = container;
    this.profile = profile;
    this.settings = settings;
    this.creator = creator;
    this.minigames = new Map();
    this.nearby = null;
    this._running = false;

    // 렌더러
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.shadowMap.enabled = false;
    renderer.shadowMap.type = THREE.PCFShadowMap; // Soft 보다 가벼움
    renderer.domElement.id = 'game-canvas';
    container.append(renderer.domElement);
    this.renderer = renderer;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#dfe8f0');
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 120);

    // 월드
    this.gym = new Gym(this.scene);

    // 입력 / 카메라
    this.input = new Input();
    const W = GYM_SIZE.width / 2;
    const D = GYM_SIZE.depth / 2;
    this.cameraCtl = new CameraController(this.camera, renderer.domElement, {
      minX: -W, maxX: W, minZ: -D, maxZ: D, maxY: GYM_SIZE.height,
    });

    // 플레이어
    this.playerModel = new CharacterModel(profile.appearance, { nickname: profile.nickname });
    this.scene.add(this.playerModel.root);
    this.player = new PlayerController(this.playerModel, this.input, this.cameraCtl, this.gym.collision);
    this.player.teleport(SPAWN_POINT.x, SPAWN_POINT.z, SPAWN_POINT.rotY);
    this.cameraCtl.snapBehind(SPAWN_POINT.rotY);

    // UI
    this.hud = new HUD(uiRoot);
    this.hud.setPlayer(profile.nickname, 1);
    this.hud.setOnline(1, true);
    this.menu = new Menu(uiRoot, {
      onResume: () => this._setControlsEnabled(true),
      onCustomize: () => this.openCustomizer(),
      onSettingsChange: (s) => this.applySettings(s),
      getSettings: () => this.settings,
      getProfile: () => this.profile,
    });

    this.applySettings(settings);

    // 키 바인딩
    this.input.onPress('KeyE', () => this._interact());
    this.input.onPress('Escape', () => this._escape());

    this._onResize = () => this._resize();
    window.addEventListener('resize', this._onResize);
    this._resize();
    this._fps = { frames: 0, time: 0 };
  }

  start() {
    this._running = true;
    this.clock = new THREE.Clock();
    this.renderer.setAnimationLoop(() => this._frame());
  }

  /** Phase 4: 기구 종류별 미니게임 모듈 등록 */
  registerMinigame(type, module) {
    this.minigames.set(type, module);
  }

  applySettings(s) {
    this.settings = { ...this.settings, ...s };
    saveSettings(this.settings);
    this.cameraCtl.sensitivity = CONFIG.MOUSE_SENSITIVITY * this.settings.mouseSensitivity;
    this.cameraCtl.invertY = this.settings.invertY;

    const q = QUALITY_PRESETS[this.settings.quality] || QUALITY_PRESETS.medium;
    const dpr = window.devicePixelRatio || 1;
    // 고해상도(레티나) 화면에서도 "보통" 이하는 1배 이하로 그려 픽셀 처리량을 줄임
    const pixelRatio = q.pixelRatio > 1 ? Math.min(dpr, CONFIG.MAX_PIXEL_RATIO) : Math.min(dpr, q.pixelRatio);
    this.renderer.setPixelRatio(pixelRatio);
    if (this.renderer.shadowMap.enabled !== q.shadows) {
      this.renderer.shadowMap.enabled = q.shadows;
      // 그림자 on/off 시 셰이더 재컴파일 필요
      this.scene.traverse((o) => { if (o.material && 'needsUpdate' in o.material) o.material.needsUpdate = true; });
    }
    this.gym.setQuality({ shadows: q.shadows, mirror: q.mirror });
    this.playerModel.setCastShadow(q.shadows);
    this.playerModel.setBlobShadow(!q.shadows);
    if (this.playerModel.nameTag) this.playerModel.nameTag.visible = this.settings.showNameTags;
    this.hud.setFpsVisible(this.settings.showFps);
    this._resize();
  }

  async openCustomizer() {
    this._setControlsEnabled(false);
    this.hud.setVisible(false);
    const result = await this.creator.open({ mode: 'edit', profile: this.profile });
    this.hud.setVisible(true);
    if (result) {
      this.profile = { ...this.profile, appearance: result.appearance };
      saveProfile(this.profile);
      this.playerModel.setAppearance(result.appearance);
      if (this.playerModel.nameTag) this.playerModel.nameTag.visible = this.settings.showNameTags;
      this.hud.toast('캐릭터 외형을 저장했습니다.');
    }
    this._setControlsEnabled(true);
  }

  // ── 내부 ───────────────────────────────────────────────
  _setControlsEnabled(v) {
    this.input.enabled = v;
    this.cameraCtl.enabled = v;
    if (!v) this.input.clear();
  }

  _escape() {
    if (this.creator.isOpen()) {
      if (this.creator.mode === 'edit') this.creator.close(null);
      return;
    }
    // Phase 4: 운동 중이면 여기서 운동 종료를 먼저 처리
    if (this.menu.isOpen()) {
      this.menu.back();
    } else {
      this._setControlsEnabled(false);
      this.menu.open();
    }
  }

  _interact() {
    if (!this.input.enabled || !this.nearby) return;
    const eq = this.nearby;
    const mg = this.minigames.get(eq.type);
    if (mg) {
      mg.start?.(this, eq);
      return;
    }
    const info = EQUIPMENT_TYPES[eq.type];
    const when = info.minigamePhase ? `Phase ${info.minigamePhase}에서 추가됩니다` : '이후 업데이트에서 추가될 예정입니다';
    this.hud.toast(`${eq.label} 미니게임은 아직 없습니다 — ${when}.`);
  }

  _zoneName(x, z) {
    if (z > 7.2 && x > 7) return '휴식 공간';
    if (z > 8.5 && Math.abs(x) < 3) return '입구';
    if (z < -8 && Math.abs(x) < 4.5) return '덤벨 구역 · 거울';
    if (x < -6 && z < -3) return '벤치프레스 구역';
    if (x > 5.5 && z < -6) return '유산소 구역';
    if (x < -6 && z > 1.5) return '머신 구역';
    if (x > 10.5 && z > -5 && z < 5) return '랫풀다운 구역';
    return '헬스장 중앙';
  }

  _frame() {
    const rawDt = this.clock.getDelta();
    const dt = Math.min(0.05, rawDt);

    // FPS 측정 (0.5초마다 표시 갱신)
    this._fps.frames++;
    this._fps.time += rawDt;
    if (this._fps.time >= 0.5) {
      const info = this.renderer.info.render;
      this.hud.setFps(this._fps.frames / this._fps.time, info.calls, info.triangles);
      this._fps.frames = 0;
      this._fps.time = 0;
    }

    this.player.update(dt);
    this.cameraCtl.update(dt, this.player.position);

    // 상호작용 대상 탐색
    const p = this.player.position;
    this.nearby = this.input.enabled ? this.gym.findNearestInteractable(p.x, p.z, CONFIG.INTERACT_RANGE) : null;
    this.hud.setPrompt(this.nearby ? `<kbd>E</kbd> ${this.nearby.label} 이용하기` : '');
    this.hud.setState(this.playerModel.action, this.player.speed, this._zoneName(p.x, p.z));

    this.renderer.render(this.scene, this.camera);
  }

  _resize() {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }
}
