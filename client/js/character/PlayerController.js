// 로컬 플레이어 이동 처리
// 카메라 방향 기준 WASD 이동 + 가속/감속 + 높이 있는 충돌 + 점프(Space) + 물체 위에 올라서기
// + 공격(주먹/발차기) 쿨다운 + 맞았을 때 넉백·기절
import { CONFIG } from '../config.js';
import { actionToIndex, ATTACKS } from '../shared/protocol.js';

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
    this.activity = { it, type: it.exercise };
    const sp = it.spot;
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

  /** 운동/앉기 종료: 기구 앞(상호작용 지점)으로 내려옴 */
  stopActivity() {
    const a = this.activity;
    if (!a) return;
    this.activity = null;
    this.model.setExercise(null);
    this.teleport(a.it.x, a.it.z, this.rotY + 0);
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
    const a = Math.min(1, dt * CONFIG.ACCELERATION * (this.grounded ? 1 : 0.35)); // 공중에서는 방향 전환이 느림
    this.velocity.x += (tx - this.velocity.x) * a;
    this.velocity.z += (tz - this.velocity.z) * a;
    if (len === 0 && Math.hypot(this.velocity.x, this.velocity.z) < 0.05) {
      this.velocity.x = 0;
      this.velocity.z = 0;
    }
    // 넉백 감속
    const kd = Math.exp(-dt * (this.grounded ? 7 : 2));
    this.knock.x *= kd;
    this.knock.z *= kd;

    const prevX = this.position.x;
    const prevZ = this.position.z;
    this.position.x += (this.velocity.x + this.knock.x) * dt;
    this.position.z += (this.velocity.z + this.knock.z) * dt;
    this.collision.resolveCircle(this.position, CONFIG.PLAYER_RADIUS, this.position.y);

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
    }
    if (this.grounded && this.position.y > ground + 0.02) this.grounded = false; // 가장자리에서 떨어짐
    if (this.grounded) {
      this.position.y = ground; // 낮은 턱(러닝머신 발판 등)은 걸어서 올라감
    } else {
      this.vy -= CONFIG.GRAVITY * dt;
      this.position.y += this.vy * dt;
      if (this.position.y <= ground) {
        this.position.y = ground;
        this.vy = 0;
        this.grounded = true;
      }
    }

    // 이동 방향으로 회전 (맞아서 밀려날 때는 그대로)
    if (len > 0 && !down) {
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
