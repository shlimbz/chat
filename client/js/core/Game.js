// 게임 본체: 렌더러/씬/루프 + 각 모듈 연결
// 확장 지점:
//   - this.network       : 서버 연결 (없으면 오프라인 모드)
//   - this.remotePlayers : 다른 플레이어
//   - this.chat          : 채팅창
//   - this.minigames     : Map<기구 type, 미니게임 모듈>  ← Phase 4 에서 registerMinigame 으로 등록
import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { Input } from './Input.js';
import { CameraController } from './CameraController.js';
import { HitEffects, Sfx } from './Effects.js';
import { Gym, GYM_SIZE, SPAWN_POINT } from '../world/Gym.js';
import { CharacterModel } from '../character/CharacterModel.js';
import { PlayerController } from '../character/PlayerController.js';
import { HUD } from '../ui/HUD.js';
import { Menu } from '../ui/Menu.js';
import { ChatPanel } from '../ui/ChatPanel.js';
import { TouchControls, isMobile } from '../ui/mobile.js';
import { RemotePlayers } from '../net/RemotePlayers.js';
import { saveProfile, saveSettings, QUALITY_PRESETS } from './storage.js';
import { EQUIPMENT_TYPES } from '../shared/equipmentTypes.js';
import {
  EV, CLIENT_SEND_HZ, AUTH_ERROR_TEXT, ATTACKS, KNOCKDOWN,
} from '../shared/protocol.js';

export class Game {
  /**
   * @param {{container:HTMLElement, uiRoot:HTMLElement, profile:object, settings:object,
   *          creator:import('../ui/CharacterCreator.js').CharacterCreator,
   *          network?:import('../net/NetworkClient.js').NetworkClient|null, welcome?:object|null,
   *          account?:{username:string,isAdmin:boolean}|null,
   *          onChangeCharacter?:Function, onLogout?:Function}} opts
   */
  constructor({
    container, uiRoot, profile, settings, creator, network = null, welcome = null, account = null, onChangeCharacter, onLogout,
  }) {
    this.container = container;
    this.profile = profile;
    this.settings = settings;
    this.creator = creator;
    this.network = network;
    this.account = account;
    this.selfId = welcome?.self?.id ?? null;
    this.maxPlayers = welcome?.maxPlayers ?? 20;
    this.minigames = new Map();
    this.nearby = null;
    this.mobile = isMobile();
    this.chatMode = false; // 모바일 채팅 모드 (3D 절전)
    this._sendTimer = 0;
    this._lastSent = '';
    this._frameCount = 0;

    // 렌더러
    const renderer = new THREE.WebGLRenderer({ antialias: !this.mobile, powerPreference: 'high-performance' });
    renderer.shadowMap.enabled = false;
    renderer.shadowMap.type = THREE.PCFShadowMap; // Soft 보다 가벼움
    renderer.domElement.id = 'game-canvas';
    container.append(renderer.domElement);
    this.renderer = renderer;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#dfe8f0');
    this.camera = new THREE.PerspectiveCamera(this.mobile ? 65 : 60, 1, 0.1, 120);

    // 월드
    this.gym = new Gym(this.scene);
    this.effects = new HitEffects(this.scene);
    this.sfx = new Sfx();

    // 입력 / 카메라
    this.input = new Input();
    const W = GYM_SIZE.width / 2;
    const D = GYM_SIZE.depth / 2;
    this.cameraCtl = new CameraController(this.camera, renderer.domElement, {
      minX: -W, maxX: W, minZ: -D, maxZ: D, maxY: GYM_SIZE.height,
    });

    // 플레이어 (온라인이면 서버가 알려준 마지막 위치에서 시작)
    this.playerModel = new CharacterModel(profile.appearance, { nickname: profile.nickname, admin: !!account?.isAdmin });
    this.scene.add(this.playerModel.root);
    this.player = new PlayerController(this.playerModel, this.input, this.cameraCtl, this.gym.collision);
    const start = welcome?.self ?? { x: SPAWN_POINT.x, z: SPAWN_POINT.z, r: SPAWN_POINT.rotY };
    this.player.teleport(start.x, start.z, start.r);
    this.cameraCtl.snapBehind(start.r);

    // 다른 플레이어
    this.remotePlayers = new RemotePlayers(this.scene);

    // UI
    this.hud = new HUD(uiRoot);
    this.hud.setPlayer(profile.nickname, welcome?.self?.level ?? 1, !!account?.isAdmin);
    this.chat = new ChatPanel(this.hud.chatSlot, {
      onFocusChange: (focused) => { if (focused) this.input.clear(); },
      onExpandChange: (v) => this._setChatMode(v),
      mobile: this.mobile,
    });
    this.menu = new Menu(uiRoot, {
      onResume: () => this._setControlsEnabled(true),
      onCustomize: () => this.openCustomizer(),
      onSettingsChange: (s) => this.applySettings(s),
      onWhisper: (nickname) => { this.menu.close(); this.chat.startWhisper(nickname); },
      onAdmin: (action, target, extra) => this._admin(action, target, extra),
      onChangeCharacter: onChangeCharacter || null,
      onLogout: onLogout || null,
      getSettings: () => this.settings,
      getProfile: () => ({ ...this.profile, online: !!this.network }),
      getAccount: () => this.account,
      getPlayers: () => this._playerList(),
    });

    if (this.mobile) {
      this.touch = new TouchControls(uiRoot, this.input, {
        onJump: () => this.player.requestJump(),
        onPunch: () => this.attack('punch'),
        onKick: () => this.attack('kick'),
        onInteract: () => this._interact(),
        onChat: () => this.chat.setExpanded(!this.chat.expanded),
        onMenu: () => this._escape(),
      });
    }

    this.applySettings(settings);

    // 키 바인딩
    this.input.onPress('KeyE', () => this._interact());
    this.input.onPress('KeyF', () => this.attack('punch'));
    this.input.onPress('KeyG', () => this.attack('kick'));
    this.input.onPress('Escape', () => this._escape());
    this.input.onPress('Enter', (e) => this._openChat(e, ''));
    this.input.onPress('NumpadEnter', (e) => this._openChat(e, ''));
    this.input.onPress('Slash', (e) => this._openChat(e, '/'));

    if (network && welcome) this._setupNetwork(network, welcome);
    else {
      this.chat.attach(null, profile.nickname);
      this._updateOnline();
    }

    this._onResize = () => this._resize();
    window.addEventListener('resize', this._onResize);
    this._resize();
    this._fps = { frames: 0, time: 0 };
  }

  start() {
    this.clock = new THREE.Clock();
    this.renderer.setAnimationLoop(() => this._frame());
  }

  /** Phase 4: 기구 종류별 미니게임 모듈 등록 */
  registerMinigame(type, module) {
    this.minigames.set(type, module);
  }

  /** 주먹 / 발차기 (키보드 F·G, 모바일 버튼) */
  attack(type) {
    if (!this.input.enabled || this.chat.isFocused()) return;
    if (!this.player.tryAttack(type)) return;
    this.sfx.swing();
    this.network?.sendAttack(type);
  }

  applySettings(s) {
    this.settings = { ...this.settings, ...s };
    saveSettings(this.settings);
    this.cameraCtl.sensitivity = CONFIG.MOUSE_SENSITIVITY * this.settings.mouseSensitivity;
    this.cameraCtl.invertY = this.settings.invertY;
    this.sfx.enabled = this.settings.sound !== false;

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
    this.remotePlayers.setRenderOptions({ blobShadow: !q.shadows, castShadow: q.shadows, showNameTags: this.settings.showNameTags });
    this.hud.setFpsVisible(this.settings.showFps);
    this._resize();
  }

  async openCustomizer() {
    this._setControlsEnabled(false);
    this.hud.setVisible(false);
    this.touch?.setVisible(false);
    const result = await this.creator.open({ mode: 'edit', profile: this.profile });
    this.hud.setVisible(true);
    this.touch?.setVisible(!this.chatMode);
    if (result) {
      this.profile = { ...this.profile, appearance: result.appearance };
      if (!this.network) saveProfile(this.profile);
      this.playerModel.setAppearance(result.appearance);
      if (this.playerModel.nameTag) this.playerModel.nameTag.visible = this.settings.showNameTags;
      this.network?.setAppearance(result.appearance);
      this.hud.toast('캐릭터 외형을 저장했습니다.');
    }
    this._setControlsEnabled(true);
  }

  // ── 네트워크 ───────────────────────────────────────────
  _setupNetwork(net, welcome) {
    this.chat.attach(net, this.profile.nickname);
    this.remotePlayers.reset(welcome.players);
    this.chat.loadInitial(welcome.chat || []);

    net.on(EV.STATE, (packet) => this.remotePlayers.applyState(packet, this.selfId));
    net.on(EV.PLAYER_JOIN, (info) => {
      if (info.id === this.selfId) return;
      this.remotePlayers.add(info);
      this._updateOnline();
    });
    net.on(EV.PLAYER_LEAVE, ({ id }) => {
      this.remotePlayers.remove(id);
      this._updateOnline();
    });
    net.on(EV.PLAYER_APPEARANCE, ({ id, appearance }) => this.remotePlayers.setAppearance(id, appearance));
    net.on(EV.CORRECT, ({ x, y, z }) => this.player.teleport(x, z, this.player.rotY, y));
    net.on(EV.CHAT, (msg) => this.chat.addMessage(msg));
    net.on(EV.ATTACK_FX, ({ id, type }) => {
      const p = this.remotePlayers.get(id);
      if (!p) return;
      p.model.playAttack(type);
      if (this._near(p.pos, 10)) this.sfx.swing();
    });
    net.on(EV.HIT, (h) => this._onHit(h));

    // 재접속 성공 → 전체 상태 다시 맞추기
    net.on('resync', (w) => {
      this.remotePlayers.reset(w.players);
      this.chat.loadInitial(w.chat || []);
      const s = w.self;
      if (Math.hypot(s.x - this.player.position.x, s.z - this.player.position.z) > 2) this.player.teleport(s.x, s.z, s.r);
      this._lastSent = '';
      this.chat.setEnabled(true);
      this.hud.toast('서버에 다시 연결되었습니다.');
      this._updateOnline();
    });

    net.on('status', ({ status, detail }) => {
      if (status === 'reconnecting') {
        this.chat.setEnabled(false, '연결이 끊겼습니다 — 재연결 중…');
        this.hud.toast('서버 연결이 끊겼습니다. 자동으로 다시 연결하는 중입니다…', 4000);
      } else if (status === 'kicked') {
        this.chat.setEnabled(false, '연결 종료됨');
        this.chat.system(detail || '서버와의 연결이 종료되었습니다.');
        this.remotePlayers.reset([]);
        this.hud.toast(detail || '연결이 종료되었습니다.', 8000);
      } else if (status === 'offline') {
        this.chat.setEnabled(false, '서버와 연결되어 있지 않습니다');
        if (detail && AUTH_ERROR_TEXT[detail]) this.hud.toast(AUTH_ERROR_TEXT[detail], 6000);
        this.remotePlayers.reset([]);
      }
      this._updateOnline();
    });
    this._updateOnline();
  }

  _onHit({ from, to, type, kx, kz, down }) {
    const spec = ATTACKS[type];
    if (!spec) return;
    const self = to === this.selfId;
    const target = self ? null : this.remotePlayers.get(to);
    const pos = self ? this.player.position : target?.pos;
    if (!pos) return;
    if (self) {
      this.player.applyHit(kx, kz, spec.lift, down, KNOCKDOWN.durationMs);
      if (down) this.hud.toast('으악! 넘어졌습니다… 잠시 후 일어나요', 2200);
    } else {
      target.model.flinch();
      if (down) target.model.knockDown(KNOCKDOWN.durationMs);
    }
    this.effects.spawn(pos.x, pos.y + 1.05, pos.z, type === 'kick' || down);
    if (self || from === this.selfId || this._near(pos, 12)) {
      this.sfx.hit(type === 'kick');
      if (down) this.sfx.knockdown();
    }
    if (down && from === this.selfId && target) this.hud.toast(`${target.nickname}님을 넘어뜨렸습니다! 💫`, 1800);
  }

  _near(pos, dist) {
    const p = this.player.position;
    return Math.hypot(pos.x - p.x, pos.z - p.z) < dist;
  }

  async _admin(action, target, extra = {}) {
    if (!this.network) return { ok: false, message: '오프라인 모드입니다.' };
    try {
      return await this.network.admin(action, target, extra);
    } catch {
      return { ok: false, message: '서버 응답이 없습니다.' };
    }
  }

  _updateOnline() {
    const net = this.network;
    if (!net) {
      this.hud.setOnline({ count: 1, label: '오프라인 모드', state: 'offline' });
      return;
    }
    const count = this.remotePlayers.count + 1;
    if (net.status === 'online') this.hud.setOnline({ count, max: this.maxPlayers, state: 'online' });
    else if (net.status === 'reconnecting') this.hud.setOnline({ count, label: '재연결 중…', state: 'warn' });
    else this.hud.setOnline({ count: 1, label: '연결 끊김', state: 'offline' });
  }

  _sendState(dt) {
    if (!this.network?.connected) return;
    this._sendTimer += dt;
    if (this._sendTimer < 1 / CLIENT_SEND_HZ) return;
    this._sendTimer = 0;
    const state = this.player.getNetworkState();
    const key = state.join(',');
    if (key === this._lastSent) return; // 변화 없으면 보내지 않음
    this._lastSent = key;
    this.network.sendMove(state);
  }

  _playerList() {
    const me = { nickname: this.profile.nickname, self: true, admin: !!this.account?.isAdmin };
    return [me, ...this.remotePlayers.list().map((p) => ({ nickname: p.nickname, self: false, admin: p.admin }))];
  }

  // ── 입력 처리 ─────────────────────────────────────────
  _setControlsEnabled(v) {
    this.input.enabled = v;
    this.cameraCtl.enabled = v;
    if (!v) this.input.clear();
  }

  /** 모바일 채팅 모드: 채팅창을 크게, 조작 버튼 숨김, 3D 는 저속 렌더링(배터리 절약) */
  _setChatMode(v) {
    this.chatMode = v;
    document.body.classList.toggle('chat-mode', v);
    this.touch?.setVisible(!v);
    if (v) this.input.clear();
    this._resize();
  }

  _openChat(e, prefill) {
    if (!this.input.enabled || this.chat.isFocused()) return;
    e.preventDefault();
    this.chat.focus(prefill);
  }

  _escape() {
    if (this.creator.isOpen()) {
      if (this.creator.mode === 'edit') this.creator.close(null);
      return;
    }
    if (this.chatMode) {
      this.chat.setExpanded(false);
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
    this.remotePlayers.update(dt);
    this.effects.update(dt);
    this.cameraCtl.update(dt, this.player.position);
    this._sendState(dt);

    // 상호작용 대상 탐색
    const p = this.player.position;
    this.nearby = this.input.enabled && !this.chat.isFocused() ? this.gym.findNearestInteractable(p.x, p.z, CONFIG.INTERACT_RANGE) : null;
    this.hud.setPrompt(this.nearby && !this.mobile ? `<kbd>E</kbd> ${this.nearby.label} 이용하기` : '');
    this.touch?.setUseVisible(!!this.nearby, this.nearby ? this.nearby.label : '');
    this.hud.setState(this.playerModel.action, this.player.speed, this._zoneName(p.x, p.z));

    // 채팅 모드에서는 4프레임에 1번만 그림 (배터리 절약, 네트워크/채팅은 그대로 동작)
    this._frameCount++;
    if (this.chatMode && this._frameCount % 4 !== 0) return;
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
