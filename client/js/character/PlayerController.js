// 로컬 플레이어 이동 처리
// 카메라 방향 기준 WASD 이동 + 가속/감속 + 높이 있는 충돌 + 점프(Space) + 물체 위에 올라서기
// + 공격(주먹/발차기) 쿨다운 + 맞았을 때 넉백·기절
import { CONFIG } from '../config.js';
import { actionToIndex, ATTACKS } from '../shared/protocol.js';
import { BODY_HEIGHT } from '../world/CollisionWorld.js';

export class PlayerController {
  /**
   * @param {import('./CharacterModel.js').CharacterModel} model
   * @param {import('../core/Input.js').Input} input
   * @param {import('../core/CameraController.js').CameraController} camera
   * @param {import('../world/CollisionWorld.js').CollisionWorld} collision
   */
  constructor(model, input, camera, collision) {
    this.model = model;
    this.input = input;
    this.camera = camera;
    this.collision = collision;

    this.position = { x: 0, y: 0, z: 0 };
    this.velocity = { x: 0, z: 0 };
    this.knock = { x: 0, z: 0 }; // 맞아서 밀려나는 속도 (점점 줄어듦)
    this.rotY = 0;
    this.speed = 0;
    this.vy = 0;
    this.grounded = true;
    this._jumpQueued = 0;
    this.locked = false; // 운동 중 등 이동 불가 상태 (Phase 4)
    this.downUntil = 0; // 기절(넘어짐) 끝나는 시각
    this._attackReadyAt = { punch: 0, kick: 0 };
    this._attackBusyUntil = 0;
    this.activity = null; // 앉기·기구 운동 중이면 { it(상호작용 대상), type }
    // 매 프레임 새 객체를 만들지 않도록 재사용 (가비지 컬렉션 줄이기)
    this._zeroAxis = { x: 0, y: 0 };
    this.push = { x: 0, z: 0 }; // 바람 등 바깥에서 미는 속도 (m/s, 맵이 매 프레임 설정)
    this.faceCamera = false; // 마우스 시점 모드: 항상 카메라가 보는 쪽을 바라봄 (옆걸음 가능)

    input.onPress('Space', () => this.requestJump());
  }

  /** 점프 요청 (키보드 Space / 모바일 버튼) — 착지 직전 입력도 0.12초간 기억 */
  requestJump() {
    if (this.input.enabled && !this.locked) this._jumpQueued = 0.12;
  }

  get isDown() {
    return performance.now() < this.downUntil;
  }

  /** 기구 운동 / 벤치 앉기 시작: 정해진 자리로 이동해 자세 잡기 */
  startActivity(it) {
    let sp = it.spot;
    let exit = { x: it.x, z: it.z };
    if (it.twoSided) {
      // 벤치의 어느 쪽에 서 있는지(앞/뒤)로 앉는 방향과 일어날 위치를 정합니다.
      const fx = Math.sin(it.rotY);
      const fz = Math.cos(it.rotY);
      const side = (this.position.x - sp.x) * fx + (this.position.z - sp.z) * fz >= 0 ? 1 : -1;
      sp = {
        x: sp.x + fx * 0.03 * side, z: sp.z + fz * 0.03 * side, y: sp.y, r: it.rotY + (side > 0 ? 0 : Math.PI),
      };
      exit = { x: sp.x + fx * 0.62 * side, z: sp.z + fz * 0.62 * side };
    }
    this.activity = { it, type: it.exercise, exit };
    this.position.x = sp.x;
    this.position.z = sp.z;
    this.position.y = sp.y;
    this.rotY = sp.r;
    this.velocity.x = this.velocity.z = 0;
    this.knock.x = this.knock.z = 0;
    this.vy = 0;
    this.grounded = true;
    this.model.setExercise(it.exercise);
    this._syncModel();
  }

  /** 운동/앉기 종료: 들어온 쪽(상호작용 지점)으로 내려옴 */
  stopActivity() {
    const a = this.activity;
    if (!a) return;
    this.activity = null;
    this.model.setExercise(null);
    this.teleport(a.exit.x, a.exit.z, this.rotY);
  }

  /**
   * 다른 캐릭터와의 충돌.
   * - 내가 상대 쪽으로 걸어가면 막힘(벽처럼), 상대가 나에게 들어오면 부드럽게 밀려남
   *   → 각자 자기 화면에서 이렇게 처리하므로, 서로 부딪히면 걷는 쪽이 상대를 천천히 밀고 가는 느낌
   * - 기구 운동 중이거나 앉아 있는 사람, 머리 위로 점프해 넘는 경우는 제외
   * @returns {boolean} 위치가 바뀌었는지
   */
  _separateFromPlayers(dt) {
    const PUSH_DEPTH = 0.18;
    const others = this.getOthers?.();
    if (!others || !others.length) return false;
    const minD = CONFIG.PLAYER_RADIUS * 1.8;
    let changed = false;
    for (const o of others) {
      if (o.model?.exercise || !o.visible) continue;
      const p = o.pos;
      if (Math.abs(p.y - this.position.y) > 0.9) continue;
      let dx = this.position.x - p.x;
      let dz = this.position.z - p.z;
      let d = Math.hypot(dx, dz);
      if (d >= minD) continue;
      if (d < 1e-4) { dx = Math.sin(this.rotY + 1.7); dz = Math.cos(this.rotY + 1.7); d = 1; }
      const nx = dx / d;
      const nz = dz / d;
      const overlap = minD - Math.min(d, minD);
      // 내가 상대 쪽으로 움직이는 중이면 완전히 막고, 아니면(상대가 밀고 들어옴) 조금씩 밀려남
      const towards = (this.velocity.x * -nx + this.velocity.z * -nz) > 0.2;
      // 밀고 들어갈 때는 살짝(최대 PUSH_DEPTH)만 파고들 수 있음 → 상대 화면에서는 그만큼 겹쳐 보여 상대가 밀려남
      const push = towards ? Math.max(0, overlap - PUSH_DEPTH) : overlap * Math.min(1, dt * 9);
      this.position.x += nx * push;
      this.position.z += nz * push;
      changed = true;
    }
    return changed;
  }

  teleport(x, z, rotY = this.rotY, y = 0) {
    this.position.x = x;
    this.position.z = z;
    this.vy = 0;
    this.rotY = rotY;
    this.velocity.x = 0;
    this.velocity.z = 0;
    this.knock.x = 0;
    this.knock.z = 0;
    this.collision.resolveCircle(this.position, CONFIG.PLAYER_RADIUS, y);
    const ground = this.collision.groundHeight(this.position.x, this.position.z, y);
    this.position.y = Math.max(y, ground);
    this.grounded = this.position.y <= ground + 0.001;
    this._standBox = null;
    this._syncModel();
  }

  /**
   * 공격 시도 — 쿨다운/기절 확인 후 애니메이션 시작
   * @returns {boolean} 실제로 공격했는지 (true 면 서버에 알림)
   */
  tryAttack(type) {
    const spec = ATTACKS[type];
    const now = performance.now();
    if (!spec || this.locked || this.isDown || this.activity || !this.input.enabled) return false;
    if (now < this._attackReadyAt[type] || now < this._attackBusyUntil) return false;
    this._attackReadyAt[type] = now + spec.cooldownMs;
    // 마우스 시점: 때릴 때는 바라보는(카메라) 방향으로 바로 돌아섬 → 조준한 쪽을 때림
    if (this.faceCamera && this.camera.getForward) {
      const f = this.camera.getForward();
      this.rotY = Math.atan2(f.x, f.z);
    }
    this._attackBusyUntil = now + spec.durationMs * 0.7;
    this.model.playAttack(type);
    return true;
  }

  /** 서버가 "맞았다" 고 알려줬을 때 */
  applyHit(kx, kz, lift, down, downMs) {
    if (this.activity) this.stopActivity(); // 맞으면 운동하다가도 튕겨 나옴
    this.knock.x = kx;
    this.knock.z = kz;
    this.vy = Math.max(this.vy, lift);
    this.grounded = false;
    this.model.flinch();
    if (down) {
      this.downUntil = performance.now() + downMs;
      this.model.knockDown(downMs);
    }
  }

  update(dt) {
    if (this.activity) {
      // 운동/앉기 중에는 제자리 (물리 계산 생략)
      this.speed = 0;
      this._syncModel();
      this.model.update(dt, 0, false);
      return;
    }
    const down = this.isDown;
    const axis = this.locked || down ? this._zeroAxis : this.input.getMoveAxis();
    const f = this.camera.getForward();
    const r = this.camera.getRight();
    let mx = f.x * axis.y + r.x * axis.x;
    let mz = f.z * axis.y + r.z * axis.x;
    const len = Math.hypot(mx, mz);
    if (len > 0) { mx /= len; mz /= len; }
    const strength = Math.min(1, len); // 조이스틱은 살짝 밀면 천천히

    const maxSpeed = this.input.isRunning() ? CONFIG.RUN_SPEED : CONFIG.WALK_SPEED;
    const tx = mx * maxSpeed * (len > 0 ? Math.max(0.35, strength) : 0);
    const tz = mz * maxSpeed * (len > 0 ? Math.max(0.35, strength) : 0);
    // 공중에서는 방향 전환이 느림, 미끄러운 바닥(땀)에서는 훨씬 더 느림
    const slip = this.grounded && this._standBox?.slip;
    const a = Math.min(1, dt * CONFIG.ACCELERATION * (this.grounded ? (slip ? 0.13 : 1) : 0.35));
    this.velocity.x += (tx - this.velocity.x) * a;
    this.velocity.z += (tz - this.velocity.z) * a;
    if (len === 0 && !slip && Math.hypot(this.velocity.x, this.velocity.z) < 0.05) {
      this.velocity.x = 0;
      this.velocity.z = 0;
    }
    // 넉백 감속
    const kd = Math.exp(-dt * (this.grounded ? 7 : 2));
    this.knock.x *= kd;
    this.knock.z *= kd;

    // 움직이는 발판 위에 서 있으면 발판과 함께 이동
    const stand = this._standBox;
    if (this.grounded && stand && !stand.off) {
      if (stand.dx || stand.dz) {
        this.position.x += stand.dx;
        this.position.z += stand.dz;
      }
      // 러닝머신 벨트: 뒤로 밀어냄
      if (stand.conveyor) {
        this.position.x += stand.conveyor.vx * dt;
        this.position.z += stand.conveyor.vz * dt;
      }
      // 회전 원판: 판과 함께 돎
      if (stand.turnD) {
        const c = Math.cos(stand.turnD);
        const sn = Math.sin(stand.turnD);
        const rx = this.position.x - stand.cx;
        const rz = this.position.z - stand.cz;
        this.position.x = stand.cx + rx * c + rz * sn;
        this.position.z = stand.cz - rx * sn + rz * c;
        if (!this.faceCamera) this.rotY += stand.turnD;
      }
    }
    if (this.push.x || this.push.z) {
      this.position.x += this.push.x * dt;
      this.position.z += this.push.z * dt;
    }
    const prevX = this.position.x;
    const prevZ = this.position.z;
    this.position.x += (this.velocity.x + this.knock.x) * dt;
    this.position.z += (this.velocity.z + this.knock.z) * dt;
    this.collision.resolveCircle(this.position, CONFIG.PLAYER_RADIUS, this.position.y);
    // 다른 사람과 겹치지 않게 (밀기/밀리기). 그 뒤 벽·기구 충돌을 한 번 더 확인
    if (this._separateFromPlayers(dt)) this.collision.resolveCircle(this.position, CONFIG.PLAYER_RADIUS, this.position.y);

    // 실제 이동한 거리 기준 속도 (벽에 막히면 걷는 모션도 줄어듦)
    const moved = Math.hypot(this.position.x - prevX, this.position.z - prevZ);
    this.speed = dt > 0 ? moved / dt : 0;
    if (Math.abs(this.velocity.x) + Math.abs(this.velocity.z) > 0.01 && this.speed < 0.05) {
      this.velocity.x *= 0.5;
      this.velocity.z *= 0.5;
    }

    // ── 높이: 점프 / 중력 / 물체 위에 서기 ──
    const ground = this.collision.groundHeight(this.position.x, this.position.z, this.position.y);
    this._jumpQueued = Math.max(0, this._jumpQueued - dt);
    if (this._jumpQueued > 0 && this.grounded && !this.locked && !down) {
      this.vy = CONFIG.JUMP_VELOCITY;
      this.grounded = false;
      this._jumpQueued = 0;
      this.onJump?.();
    }
    if (this.grounded && this.position.y > ground + 0.02) this.grounded = false; // 가장자리에서 떨어짐
    if (this.grounded) {
      this.position.y = ground; // 낮은 턱(러닝머신 발판 등)은 걸어서 올라감
    } else {
      this.vy -= CONFIG.GRAVITY * dt;
      let ny = this.position.y + this.vy * dt;
      // 머리 위 발판에 부딪히면 더 못 올라감
      if (this.vy > 0) {
        const ceil = this.collision.ceilingAbove(this.position.x, this.position.z, this.position.y, ny);
        if (ceil < Infinity) { ny = Math.min(ny, ceil - BODY_HEIGHT); this.vy = 0; }
      }
      this.position.y = ny;
      if (this.position.y <= ground) {
        this.position.y = ground;
        this.vy = 0;
        this.grounded = true;
      }
    }
    this._standBox = this.grounded ? this.collision.groundBox : null;
    // 점프대: 밟는 순간 높이 튀어 오름
    if (this.grounded && this._standBox?.pad && !down) {
      this.vy = this._standBox.pad;
      this.grounded = false;
      this._standBox = null;
      this.onPad?.();
    }

    // 마우스 시점: 움직일 때만 카메라가 보는 쪽으로 부드럽게 돌아섬 (서 있을 때는 카메라만 돌아감 → 캐릭터 얼굴도 볼 수 있음)
    //   한 번에 너무 빨리 돌지 않도록 초당 최대 회전량 제한 → 뒤로 확 돌 때도 자연스럽게 몸을 돌림
    if (this.faceCamera && !down) {
      if (len > 0) {
        const targetRot = Math.atan2(f.x, f.z);
        let d = (targetRot - this.rotY) % (Math.PI * 2);
        if (d > Math.PI) d -= Math.PI * 2;
        if (d < -Math.PI) d += Math.PI * 2;
        const step = Math.sign(d) * Math.min(Math.abs(d) * Math.min(1, dt * 12), 11 * dt);
        this.rotY += step;
      }
    } else if (len > 0 && !down) {
      const targetRot = Math.atan2(mx, mz);
      this.rotY = lerpAngle(this.rotY, targetRot, Math.min(1, dt * CONFIG.TURN_SPEED));
    }

    this._syncModel();
    this.model.update(dt, this.speed, !this.grounded);
  }

  /** 서버 전송용 상태 [x, y, z, 회전, 동작번호] (소수점 2자리로 축약해 전송량 절감) */
  getNetworkState() {
    const r = Math.atan2(Math.sin(this.rotY), Math.cos(this.rotY));
    return [round2(this.position.x), round2(this.position.y), round2(this.position.z), round2(r), actionToIndex(this.model.action)];
  }

  _syncModel() {
    this.model.root.position.set(this.position.x, this.position.y, this.position.z);
    this.model.root.rotation.y = this.rotY;
  }
}

export function lerpAngle(a, b, t) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

const round2 = (n) => Math.round(n * 100) / 100;
