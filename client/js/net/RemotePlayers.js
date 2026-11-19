// 다른 플레이어 표시 + 보간
// 서버는 초당 10회만 위치를 보내므로, 받은 위치들을 버퍼에 쌓고
// "현재 시각 - INTERPOLATION_DELAY" 시점의 위치를 두 샘플 사이에서 보간해 부드럽게 그립니다.
import { CharacterModel } from '../character/CharacterModel.js';
import { CONFIG } from '../config.js';
import { lerpAngle } from '../character/PlayerController.js';

const MAX_BUFFER = 30;

class RemotePlayer {
  constructor(info, opts) {
    this.id = info.id;
    this.nickname = info.nickname;
    this.model = new CharacterModel(info.appearance, { nickname: info.nickname, blobShadow: opts.blobShadow });
    if (info.bodyStats) this.model.setBodyStats(info.bodyStats);
    this.model.setCastShadow(opts.castShadow);
    if (this.model.nameTag) this.model.nameTag.visible = opts.showNameTags;
    this.buffer = [];
    this.pos = { x: info.x, y: info.y || 0, z: info.z };
    this.rot = info.r || 0;
    this.speed = 0;
    this.push(info.x, info.y || 0, info.z, info.r || 0, performance.now() - CONFIG.INTERPOLATION_DELAY_MS);
    this._apply();
  }

  push(x, y, z, r, t = performance.now()) {
    this.buffer.push({ t, x, y, z, r });
    if (this.buffer.length > MAX_BUFFER) this.buffer.shift();
  }

  update(dt, now) {
    const renderT = now - CONFIG.INTERPOLATION_DELAY_MS;
    const b = this.buffer;
    // renderT 이전의 가장 최근 샘플 하나만 남기고 정리
    while (b.length >= 2 && b[1].t <= renderT) b.shift();

    const prevX = this.pos.x;
    const prevZ = this.pos.z;
    if (b.length >= 2 && b[0].t <= renderT) {
      const a = b[0];
      const c = b[1];
      const k = Math.min(1, (renderT - a.t) / Math.max(1, c.t - a.t));
      this.pos.x = a.x + (c.x - a.x) * k;
      this.pos.y = a.y + (c.y - a.y) * k;
      this.pos.z = a.z + (c.z - a.z) * k;
      this.rot = lerpAngle(a.r, c.r, k);
    } else if (b.length) {
      const last = b[b.length - 1];
      // 새 데이터가 없으면 마지막 위치로 부드럽게 수렴
      const f = Math.min(1, dt * 12);
      this.pos.x += (last.x - this.pos.x) * f;
      this.pos.y += (last.y - this.pos.y) * f;
      this.pos.z += (last.z - this.pos.z) * f;
      this.rot = lerpAngle(this.rot, last.r, f);
    }
    const moved = Math.hypot(this.pos.x - prevX, this.pos.z - prevZ);
    const instSpeed = dt > 0 ? moved / dt : 0;
    this.speed += (instSpeed - this.speed) * Math.min(1, dt * 10);
    this._apply();
    this.model.update(dt, this.speed < 0.08 ? 0 : this.speed, this.pos.y > 0.03);
  }

  _apply() {
    this.model.root.position.set(this.pos.x, this.pos.y, this.pos.z);
    this.model.root.rotation.y = this.rot;
  }

  dispose() {
    this.model.dispose();
  }
}

export class RemotePlayers {
  constructor(scene) {
    this.scene = scene;
    this.map = new Map();
    this.opts = { blobShadow: true, castShadow: false, showNameTags: true };
  }

  get count() {
    return this.map.size;
  }

  list() {
    return [...this.map.values()];
  }

  /** 전체 목록으로 교체 (접속/재접속 직후) */
  reset(players) {
    for (const p of this.map.values()) p.dispose();
    this.map.clear();
    for (const info of players) this.add(info);
  }

  add(info) {
    const existing = this.map.get(info.id);
    if (existing) existing.dispose();
    const p = new RemotePlayer(info, this.opts);
    this.map.set(info.id, p);
    this.scene.add(p.model.root);
    return p;
  }

  remove(id) {
    const p = this.map.get(id);
    if (!p) return;
    p.dispose(); // 장면에서 제거 + 지오메트리 해제
    this.map.delete(id);
  }

  setAppearance(id, appearance) {
    this.map.get(id)?.model.setAppearance(appearance);
  }

  /** 서버 STATE 패킷: [[id, x, y, z, r, a], ...] */
  applyState(packet, selfId) {
    if (!Array.isArray(packet)) return;
    const now = performance.now();
    for (const row of packet) {
      if (!Array.isArray(row) || row[0] === selfId) continue;
      const p = this.map.get(row[0]);
      if (p) p.push(row[1], row[2], row[3], row[4], now);
    }
  }

  setRenderOptions(opts) {
    Object.assign(this.opts, opts);
    for (const p of this.map.values()) {
      p.model.setBlobShadow(this.opts.blobShadow);
      p.model.setCastShadow(this.opts.castShadow);
      if (p.model.nameTag) p.model.nameTag.visible = this.opts.showNameTags;
    }
  }

  update(dt) {
    const now = performance.now();
    for (const p of this.map.values()) p.update(dt, now);
  }

  findByNickname(name) {
    const n = String(name).toLowerCase();
    return this.list().find((p) => p.nickname.toLowerCase() === n) || null;
  }
}
