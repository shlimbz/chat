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
import { Shop } from '../ui/Shop.js';
import { RankingPanel } from '../ui/Ranking.js';
import { ChatPanel } from '../ui/ChatPanel.js';
import { TouchControls, isMobile } from '../ui/mobile.js';
import { keyLabel } from '../ui/dom.js';
import { RemotePlayers } from '../net/RemotePlayers.js';
import { saveProfile, saveSettings, QUALITY_PRESETS, DEFAULT_SETTINGS } from './storage.js';
import { EQUIPMENT_TYPES } from '../shared/equipmentTypes.js';
import {
  EV, CLIENT_SEND_HZ, AUTH_ERROR_TEXT, ATTACKS, KNOCKDOWN, CHAT_TYPES,
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
    // 서버가 보유 아이템 기준으로 확인한 외형을 우선 사용
    this.profile = welcome?.self?.appearance ? { ...profile, appearance: welcome.self.appearance } : profile;
    profile = this.profile;
    this.wallet = welcome?.self?.wallet || { coins: 0, items: [] };
    // 서버 시각 첫 추정 (이후 위치 패킷으로 더 정확해짐)
    this._bootClockOffset = welcome?.serverTime ? performance.now() - welcome.serverTime : 0;
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
    this._attackKeyOff = [];
    this._animatedEquip = new Set(); // 지금 움직이고 있는 기구 부품
    this.ping = null;
    this._autoRes = { frames: 0, time: 0, good: 0, pr: 1, max: 1 };

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

    // 다른 플레이어 (서로 겹치지 않게 충돌)
    this.remotePlayers = new RemotePlayers(this.scene);
    this.player.getOthers = () => this.remotePlayers.list();

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
      onShop: () => this.openShop(),
      onBag: () => this.openShop(null, 'inventory'),
      onRanking: () => this.openRanking(),
      onSettingsChange: (s) => this.applySettings(s),
      onWhisper: (nickname) => { this.menu.close(); this.chat.startWhisper(nickname); },
      onAdmin: (action, target, extra) => this._admin(action, target, extra),
      onChangeCharacter: onChangeCharacter || null,
      onLogout: onLogout || null,
      getSettings: () => this.settings,
      getProfile: () => ({ ...this.profile, online: !!this.network }),
      getAccount: () => this.account,
      getPlayers: () => this._playerList(),
      isMobile: this.mobile,
      getWallet: () => this.wallet,
    });

    this.shop = new Shop(uiRoot, {
      getWallet: () => this.wallet,
      getAppearance: () => this.profile.appearance,
      buy: (id) => this.network.buy(id),
      sell: (id) => this.network.sell(id),
      equip: (acc) => this._equip(acc),
      online: () => !!this.network?.connected,
      onClose: () => {
        this.hud.setVisible(true);
        this.touch?.setVisible(true);
        this._setControlsEnabled(true);
      },
    });
    this.hud.onCoinClick = () => this.hud.toast('🛍️ 치장 상점은 서쪽 벽(레그프레스 옆)에 있어요. 가판대 앞에서 E!', 3200);
    this.hud.onBagClick = () => this.openShop(null, 'inventory');
    this.ranking = new RankingPanel(uiRoot, {
      fetch: () => this.network.request(EV.RANKING, null),
      selfId: () => this.selfId,
      onClose: () => {
        this.touch?.setVisible(true);
        this._setControlsEnabled(true);
      },
    });
    this.hud.setCoins(this.network ? this.wallet.coins : null);

    if (this.mobile) {
      this.touch = new TouchControls(uiRoot, this.input, {
        onJump: () => this.player.requestJump(),
        onPunch: () => this.attack('punch'),
        onKick: () => this.attack('kick'),
        onInteract: () => this._interact(),
        onChat: () => this.chat.setExpanded(!this.chat.expanded),
        onBag: () => this.openShop(null, 'inventory'),
        onMenu: () => this._escape(),
      });
    }

    this.applySettings(settings);

    // 키 바인딩 (공격 키는 설정에서 바꿀 수 있음 → applySettings 에서 등록)
    this.input.onPress('KeyE', () => this._interact());
    this.input.onPress('KeyI', () => {
      if (this.chat.isFocused()) return;
      if (this.shop.isOpen()) { if (this.shop.mode === 'inventory') this.shop.close(); return; }
      if (this.input.enabled) this.openShop(null, 'inventory');
    });
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

  /** 주먹 / 발차기 (키보드 J·K 기본, 모바일 버튼) */
  attack(type) {
    if (!this.input.enabled || this.chat.isFocused()) return;
    if (!this.player.tryAttack(type)) return;
    this.sfx.swing();
    this.network?.sendAttack(type, Math.round(this.serverNow()));
    this._bagCheck(this.player.position, this.player.rotY, type, true);
  }

  /** 서버 시각 추정 (다른 사람 위치 패킷 기준) — 샌드백 흔들림을 모든 화면에서 같게 */
  serverNow() {
    const off = this.remotePlayers?.clockOffset ?? this._bootClockOffset ?? 0;
    return performance.now() - off;
  }

  /** 정면에서 사정거리 안의 샌드백을 실제 타격합니다. */
  _bagCheck(pos, rotY, type = 'punch', own = false) {
    const reach = type === 'kick' ? 1.05 : 0.9;
    const hx = pos.x + Math.sin(rotY) * reach;
    const hz = pos.z + Math.cos(rotY) * reach;
    // 판정 시점 = 누른 순간 + 팔/다리가 뻗는 시간 (서버도 같은 기준)
    const at = this.serverNow() + ATTACKS[type].windupMs;
    const hit = this.gym.hitBag(hx, hz, pos.x, pos.z, rotY, type === 'kick' ? 1.45 : 1, at);
    if (!hit) return;
    if (!hit.inZone) {
      if (own && !this._bagHinted) {
        this._bagHinted = true;
        this.hud.toast('바닥 불이 초록색일 때(샌드백이 가운데 올 때) 치면 PERFECT! 🥊', 3500);
      }
      return; // 헛방 (결과 문구는 서버 판정이 오면 표시)
    }
    this.effects.spawn(hit.x, hit.y, hit.z, type === 'kick');
    // 다른 사람이 친 샌드백은 가까울 때만 소리
    if (own || this._near(pos, 10)) this.sfx.hit(type === 'kick');
  }

  _bindAttackKeys() {
    for (const off of this._attackKeyOff) off();
    const keys = { ...DEFAULT_SETTINGS.keys, ...(this.settings.keys || {}) };
    this._attackKeyOff = [
      this.input.onPress(keys.punch, () => this.attack('punch')),
      this.input.onPress(keys.kick, () => this.attack('kick')),
    ];
    this.input.extraGameKeys = new Set([keys.punch, keys.kick]);
    this.hud.setAttackKeys(keyLabel(keys.punch), keyLabel(keys.kick));
  }

  applySettings(s) {
    this.settings = { ...this.settings, ...s };
    saveSettings(this.settings);
    this.cameraCtl.sensitivity = CONFIG.MOUSE_SENSITIVITY * this.settings.mouseSensitivity;
    this.cameraCtl.invertY = this.settings.invertY;
    this.sfx.enabled = this.settings.sound !== false;

    this._bindAttackKeys();

    const q = QUALITY_PRESETS[this.settings.quality] || QUALITY_PRESETS.medium;
    const dpr = window.devicePixelRatio || 1;
    // 고해상도(레티나) 화면에서도 "보통" 이하는 1배 이하로 그려 픽셀 처리량을 줄임
    const pixelRatio = q.pixelRatio > 1 ? Math.min(dpr, CONFIG.MAX_PIXEL_RATIO) : Math.min(dpr, q.pixelRatio);
    this._autoRes.max = pixelRatio;
    this._autoRes.pr = pixelRatio;
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
    this.remotePlayers.setRenderOptions({
      blobShadow: !q.shadows, castShadow: q.shadows, showNameTags: this.settings.showNameTags, othersFx: this.settings.othersFx !== false,
    });
    this._capFps = this.settings.fpsCap ?? this.mobile; // 30fps 제한 (모바일 기본 켬)
    this.hud.setFpsVisible(this.settings.showFps);
    this._resize();
  }

  openShop(tab, mode = 'shop') {
    if (this.shop.isOpen() || this.creator.isOpen() || this.ranking.isOpen()) return;
    this.menu.close();
    this._setControlsEnabled(false);
    this.touch?.setVisible(false);
    this.shop.open(tab, mode);
  }

  openRanking() {
    if (!this.network || this.shop.isOpen() || this.creator.isOpen() || this.ranking.isOpen()) {
      if (!this.network) this.hud.toast('랭킹은 서버에 접속했을 때 볼 수 있어요.');
      return;
    }
    this.menu.close();
    this._setControlsEnabled(false);
    this.touch?.setVisible(false);
    this.ranking.open().then(() => this._refreshBoard());
  }

  /** 라운지 벽 전광판 갱신 (30초마다) */
  async _refreshBoard() {
    if (!this.network?.connected) return;
    try {
      const data = await this.network.request(EV.RANKING, null);
      this.gym.setRankingBoard(data);
    } catch { /* 다음 주기에 다시 */ }
  }

  /** 치장 아이템 착용/해제 → 내 캐릭터 갱신 + 서버 저장 */
  _equip(acc) {
    const appearance = { ...this.profile.appearance, acc };
    this.profile = { ...this.profile, appearance };
    this.playerModel.setAppearance(appearance);
    if (this.playerModel.nameTag) this.playerModel.nameTag.visible = this.settings.showNameTags;
    this.network?.setAppearance(appearance);
  }

  _setWallet(w) {
    if (!w) return;
    this.wallet = { coins: Number(w.coins) || 0, items: Array.isArray(w.items) ? w.items : [] };
    this.hud.setCoins(this.wallet.coins);
    this.shop?.refresh();
  }

  async openCustomizer() {
    this._setControlsEnabled(false);
    this.hud.setVisible(false);
    this.touch?.setVisible(false);
    const result = await this.creator.open({ mode: 'edit', profile: this.profile });
    this.hud.setVisible(true);
    this.touch?.setVisible(true);
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
    net.on(EV.PLAYER_APPEARANCE, ({ id, appearance }) => {
      if (id === this.selfId) {
        // 서버가 내 외형을 바꿈 (예: 판매한 아이템 자동 해제)
        this.profile = { ...this.profile, appearance };
        this.playerModel.setAppearance(appearance);
        if (this.playerModel.nameTag) this.playerModel.nameTag.visible = this.settings.showNameTags;
        this.shop.refresh();
        return;
      }
      this.remotePlayers.setAppearance(id, appearance);
    });
    net.on(EV.BAG_RESULT, ({ perfect, coins, type }) => {
      if (perfect) this.hud.pop(coins > 0 ? `PERFECT! +${coins}🪙` : 'PERFECT!', type === 'kick' ? '#ffb347' : '#5dff9a');
      else this.hud.pop('MISS', '#ff8a8a');
    });
    net.on(EV.WALLET, (w) => {
      this._setWallet(w);
      if (w.gained > 0) {
        this.hud.coinPop(w.gained);
        if (w.reason === 'admin') this.hud.toast(`관리자에게서 ${w.gained}코인을 받았어요! 🪙`);
      }
    });
    net.on(EV.CORRECT, ({ x, y, z }) => this.player.teleport(x, z, this.player.rotY, y));
    net.on(EV.CHAT, (msg) => {
      this.chat.addMessage(msg);
      // 전체 채팅은 말한 캐릭터 머리 위에 말풍선 (귓속말은 표시 안 함)
      if (msg.type === CHAT_TYPES.GLOBAL && msg.from) {
        const model = msg.from === this.profile.nickname ? this.playerModel : this.remotePlayers.findByNickname(msg.from)?.model;
        model?.say(msg.text);
      }
    });
    net.on(EV.ATTACK_FX, ({ id, type }) => {
      const p = this.remotePlayers.get(id);
      if (!p) return;
      p.model.playAttack(type);
      if (this._near(p.pos, 10)) this.sfx.swing();
      this._bagCheck(p.pos, p.rot, type);
    });
    // 핑(왕복 지연) 측정 — 설정의 "FPS 표시"에 함께 표시
    clearInterval(this._pingTimer);
    this._pingTimer = setInterval(async () => {
      if (!net.connected || !this.settings.showFps) return;
      try { this.ping = await net.ping(); } catch { this.ping = null; }
    }, 3000);
    net.on(EV.HIT, (h) => this._onHit(h));

    // 재접속 성공 → 전체 상태 다시 맞추기
    // 랭킹 전광판: 서버가 바뀔 때마다 보내줌 (실시간)
    net.on(EV.RANKING_LIVE, (data) => {
      this.gym.setRankingBoard(data);
      if (this.ranking.isOpen()) this.ranking.refresh();
    });
    setTimeout(() => this._refreshBoard(), 1500);
    net.on('resync', (w) => {
      this.remotePlayers.reset(w.players);
      this._setWallet(w.self?.wallet);
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
  /** 모바일 채팅 화면: 반투명이라 뒤의 게임이 그대로 보이고 계속 그려짐. 💬(🎮) 버튼으로 돌아감 */
  _setChatMode(v) {
    this.chatMode = v;
    document.body.classList.toggle('chat-mode', v);
    this.touch?.setChatMode(v);
    if (v) this.input.clear();
  }

  _openChat(e, prefill) {
    if (!this.input.enabled || this.chat.isFocused()) return;
    e.preventDefault();
    this.chat.focus(prefill);
  }

  _escape() {
    if (this.ranking.isOpen()) {
      this.ranking.close();
      return;
    }
    if (this.shop.isOpen()) {
      this.shop.close();
      return;
    }
    if (this.creator.isOpen()) {
      if (this.creator.mode === 'edit') this.creator.close(null);
      return;
    }
    if (this.chatMode) {
      this.chat.setExpanded(false);
      return;
    }
    if (this.player.activity) {
      this.player.stopActivity();
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

  /** E: 기구 운동 / 벤치 앉기 시작 — 다시 누르면 그만하기 */
  _interact() {
    if (!this.input.enabled || this.chat.isFocused()) return;
    if (this.player.activity) {
      this.player.stopActivity();
      return;
    }
    const eq = this.nearby;
    if (!eq || this.player.isDown || !this.player.grounded) return;
    // 운동이 아닌 상호작용: 상점 / 랭킹 전광판
    if (eq.type === 'shop') { this.openShop(); return; }
    if (eq.type === 'rankboard') { this.openRanking(); return; }
    if (this._occupant(eq)) {
      this.hud.toast(`다른 사람이 ${eq.type === 'seat' ? '앉아 있어요' : '사용 중이에요'}.`);
      return;
    }
    this.player.startActivity(eq);
    // Phase 4: 미니게임이 등록된 기구면 함께 시작
    this.minigames.get(eq.type)?.start?.(this, eq);
  }

  /** 그 자리에서 운동/앉기 중인 다른 사람 */
  _occupant(it) {
    for (const p of this.remotePlayers.list()) {
      if (p.model.exercise && Math.hypot(p.pos.x - it.spot.x, p.pos.z - it.spot.z) < 0.45) return p;
    }
    return null;
  }

  /** 운동하는 사람(나 + 다른 사람)에 맞춰 바벨·랫풀다운 바 움직이기 */
  _animateEquipment() {
    const active = new Set();
    const apply = (it, k) => { this.gym.animateEquipment(it, k); active.add(it); };
    const mine = this.player.activity?.it;
    if (mine) apply(mine, this.playerModel.exerciseK);
    for (const p of this.remotePlayers.list()) {
      if (!p.model.exercise || p.model.exercise === 'sit') continue;
      const it = this._spotAt(p.pos);
      if (it) apply(it, p.model.exerciseK);
    }
    for (const it of this._animatedEquip) if (!active.has(it)) this.gym.resetEquipment(it);
    this._animatedEquip = active;
  }

  _spotAt(pos) {
    for (const it of this.gym.interactables) {
      if (it.exercise && it.type !== 'seat' && Math.hypot(pos.x - it.spot.x, pos.z - it.spot.z) < 0.4) return it;
    }
    return null;
  }

  /** 프레임이 계속 낮으면 해상도를 조금씩 낮추고, 여유가 생기면 다시 올림 */
  _autoResolution(rawDt) {
    const a = this._autoRes;
    if (this.settings.autoRes === false || this.chatMode) return;
    a.frames++;
    a.time += rawDt;
    if (a.time < 2) return;
    const fps = a.frames / a.time;
    a.frames = 0;
    a.time = 0;
    const target = this._capFps ? 30 : 60; // 30fps 제한 중이면 30 기준으로 판단
    if (fps < target * 0.7 && a.pr > 0.55) {
      a.pr = Math.max(0.55, a.pr - 0.1);
      a.good = 0;
      this.renderer.setPixelRatio(a.pr);
    } else if (fps > target * 0.95 && a.pr < a.max) {
      a.good++;
      if (a.good >= 3) {
        a.pr = Math.min(a.max, a.pr + 0.1);
        a.good = 0;
        this.renderer.setPixelRatio(a.pr);
      }
    } else {
      a.good = 0;
    }
  }

  _zoneName(x, z) {
    if (z > 4.5 && x > 8) return '라운지';
    if (z > 10.8 && Math.abs(x) < 7) return '입구';
    if (x < -5 && z < -7) return '벤치프레스 구역';
    if (x < -5 && z < 1) return '프리웨이트 구역';
    if (x < -3 && z > 2) return '머신 구역';
    if (x > 7 && z < -6) return '유산소 구역';
    if (x > 14 && z > -5 && z < 7) return '랫풀다운 구역';
    if (Math.abs(x) < 5 && z > -3 && z < 7) return '샌드백 · 스트레칭';
    return '헬스장 중앙';
  }

  _frame() {
    // 30fps 제한: 화면 주사율(60/120Hz)과 관계없이 약 33ms 마다 한 번만 계산·그리기
    if (this._capFps) {
      const now = performance.now();
      if (now - (this._lastFrameAt || 0) < 1000 / 30 - 4) return;
      this._lastFrameAt = now;
    }
    const rawDt = this.clock.getDelta();
    const dt = Math.min(0.05, rawDt);

    // FPS 측정 (0.5초마다 표시 갱신)
    this._fps.frames++;
    this._fps.time += rawDt;
    if (this._fps.time >= 0.5) {
      const info = this.renderer.info.render;
      this.hud.setFps(this._fps.frames / this._fps.time, info.calls, info.triangles, this.network ? this.ping : undefined, this._autoRes.pr);
      this._fps.frames = 0;
      this._fps.time = 0;
    }

    this._autoResolution(rawDt);
    this.player.update(dt);
    this.remotePlayers.update(dt);
    this.effects.update(dt);
    this.gym.update(dt, this.serverNow());
    this._animateEquipment();
    this.cameraCtl.update(dt, this.player.position);
    this._sendState(dt);

    // 상호작용 대상 탐색
    const p = this.player.position;
    const act = this.player.activity;
    this.nearby = this.input.enabled && !act && !this.chat.isFocused() ? this.gym.findNearestInteractable(p.x, p.z, CONFIG.INTERACT_RANGE) : null;
    let prompt = '';
    if (act) prompt = act.it.type === 'seat' ? '일어나기' : `${act.it.label} 그만하기`;
    else if (this.nearby) {
      prompt = {
        seat: '앉기', shop: '🛍️ 상점 열기', rankboard: '🏆 랭킹 자세히',
      }[this.nearby.type] || `${this.nearby.label} 운동하기`;
    }
    this.hud.setPrompt(prompt && !this.mobile ? `<kbd>E</kbd> ${prompt}` : '');
    this.touch?.setUseVisible(!!prompt, prompt);
    this.hud.setState(this.playerModel.action, this.player.speed, this._zoneName(p.x, p.z));

    this._frameCount++;
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
