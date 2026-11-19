// 다른 플레이어 표시 + 보간
//
// [버벅임 개선]
// 이전 방식은 "패킷을 받은 시각" 기준으로 보간했기 때문에, 무료 서버/와이파이에서 패킷이
// 몰려서 오거나 늦게 오면(지터) 다른 캐릭터가 멈췄다 튀었다 했습니다.
// 이제는 서버가 패킷에 찍어 보내는 "서버 시각"을 기준으로 일정한 간격의 타임라인을 만들고,
// 그 타임라인보다 INTERPOLATION_DELAY 만큼 과거를 부드럽게 보간합니다.
// 데이터가 잠깐 끊기면 마지막 속도로 짧게 예측(외삽)해서 멈칫하지 않게 합니다.
import { CharacterModel } from '../character/CharacterModel.js';
import { CONFIG } from '../config.js';
import { lerpAngle } from '../character/PlayerController.js';

const MAX_BUFFER = 40;
const MAX_EXTRAPOLATE_MS = 150;

class RemotePlayer {
  constructor(info, opts) {
    this.id = info.id;
    this.nickname = info.nickname;
    this.admin = !!info.admin;
    this.model = new CharacterModel(info.appearance, { nickname: info.nickname, blobShadow: opts.blobShadow, admin: this.admin });
    if (info.bodyStats) this.model.setBodyStats(info.bodyStats);
    this.model.setCastShadow(opts.castShadow);
    if (this.model.nameTag) this.model.nameTag.visible = opts.showNameTags;
    this.buffer = [];
    this.pos = { x: info.x, y: info.y || 0, z: info.z };
    this.rot = info.r || 0;
    this.speed = 0;
    this.visible = true;
    this._apply();
  }

  /** t: 로컬 시계로 환산된 서버 시각 */
  push(x, y, z, r, t) {
    const last = this.buffer[this.buffer.length - 1];
    if (last && t <= last.t) return; // 순서가 뒤바뀐 패킷 무시
    this.buffer.push({ t, x, y, z, r });
    if (this.buffer.length > MAX_BUFFER) this.buffer.shift();
  }

  update(dt, renderT) {
    const b = this.buffer;
    while (b.length >= 3 && b[1].t <= renderT) b.shift();

    const prevX = this.pos.x;
    const prevZ = this.pos.z;
    if (b.length >= 2 && b[0].t <= renderT && renderT <= b[1].t) {
      // 두 샘플 사이 보간
      const a = b[0];
      const c = b[1];
      const k = (renderT - a.t) / Math.max(1, c.t - a.t);
      this.pos.x = a.x + (c.x - a.x) * k;
      this.pos.y = a.y + (c.y - a.y) * k;
      this.pos.z = a.z + (c.z - a.z) * k;
      this.rot = lerpAngle(a.r, c.r, k);
    } else if (b.length >= 2 && renderT > b[b.length - 1].t) {
      // 최신 데이터보다 앞 → 마지막 속도로 짧게 예측 (그 이후는 멈춤)
      const c = b[b.length - 1];
      const a = b[b.length - 2];
      const span = Math.max(1, c.t - a.t);
      const ahead = Math.min(MAX_EXTRAPOLATE_MS, renderT - c.t);
      const moving = Math.hypot(c.x - a.x, c.z - a.z) > 0.001 && span < 400;
      const k = moving ? ahead / span : 0;
      const tx = c.x + (c.x - a.x) * k;
      const tz = c.z + (c.z - a.z) * k;
      const f = Math.min(1, dt * 15);
      this.pos.x += (tx - this.pos.x) * f;
      this.pos.z += (tz - this.pos.z) * f;
      this.pos.y += (c.y - this.pos.y) * f;
      this.rot = lerpAngle(this.rot, c.r, f);
    } else if (b.length) {
      const last = b[b.length - 1];
      const f = Math.min(1, dt * 12);
      this.pos.x += (last.x - this.pos.x) * f;
      this.pos.y += (last.y - this.pos.y) * f;
      this.pos.z += (last.z - this.pos.z) * f;
      this.rot = lerpAngle(this.rot, last.r, f);
    }
    const moved = Math.hypot(this.pos.x - prevX, this.pos.z - prevZ);
    const instSpeed = dt > 0 ? moved / dt : 0;
    this.speed += (instSpeed - this.speed) * Math.min(1, dt * 8);
    this._apply();
    if (this.visible) this.model.update(dt, this.speed < 0.15 ? 0 : this.speed, this.pos.y > 0.05 && this._airborne());
  }

  _airborne() {
    // 물체 위에 서 있는 것과 점프를 구분: 높이가 변하는 중이면 공중
    const b = this.buffer;
    if (b.length < 2) return this.pos.y > 0.05;
    const c = b[b.length - 1];
    const a = b[b.length - 2];
    return Math.abs(c.y - a.y) > 0.01 || this.model.airBlend > 0.5;
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
    this.clockOffset = null; // 로컬시계 - 서버시계 (가장 빨리 도착한 패킷 기준)
  }

  get count() {
    return this.map.size;
  }

  list() {
    return [...this.map.values()];
  }

  get(id) {
    return this.map.get(id) || null;
  }

  /** 전체 목록으로 교체 (접속/재접속 직후) */
  reset(players) {
    for (const p of this.map.values()) p.dispose();
    this.map.clear();
    this.clockOffset = null;
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

  /** 서버 STATE 패킷: { t: 서버시각, p: [[id, x, y, z, r, a], ...] } */
  applyState(packet, selfId) {
    if (!packet || !Array.isArray(packet.p)) return;
    const now = performance.now();
    const sample = now - Number(packet.t);
    // 지연이 가장 적었던 패킷 기준으로 시계를 맞춤 (천천히 따라가 시계 오차도 보정)
    if (this.clockOffset === null || sample < this.clockOffset) this.clockOffset = sample;
    else this.clockOffset += Math.min(sample - this.clockOffset, 0.5);
    const t = Number(packet.t) + this.clockOffset;
    for (const row of packet.p) {
      if (!Array.isArray(row) || row[0] === selfId) continue;
      const p = this.map.get(row[0]);
      if (p) p.push(row[1], row[2], row[3], row[4], t);
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

  /**
   * @param {number} dt
   * @param {{x:number,z:number}} [viewer] 내 위치 — 멀리 있는 캐릭터는 애니메이션 계산을 줄임
   */
  update(dt, viewer) {
    const renderT = performance.now() - CONFIG.INTERPOLATION_DELAY_MS;
    for (const p of this.map.values()) p.update(dt, renderT);
  }

  findByNickname(name) {
    const n = String(name).toLowerCase();
    return this.list().find((p) => p.nickname.toLowerCase() === n) || null;
  }
}
