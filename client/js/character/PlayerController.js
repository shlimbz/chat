// 로컬 플레이어 이동 처리
// 카메라 방향 기준 WASD 이동 + 가속/감속 + 충돌 + 회전 보간 + 점프(Space)
// getNetworkState() 는 Phase 2 에서 서버로 보낼 최소 상태를 반환합니다.
import { CONFIG } from '../config.js';
import { actionToIndex } from '../shared/protocol.js';

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
    this.rotY = 0;
    this.speed = 0;
    this.vy = 0;
    this.grounded = true;
    this._jumpQueued = 0;
    this.locked = false; // 운동 중 등 이동 불가 상태 (Phase 4)

    input.onPress('Space', () => {
      if (this.input.enabled && !this.locked) this._jumpQueued = 0.12; // 착지 직전 입력도 0.12초간 기억
    });
  }

  teleport(x, z, rotY = this.rotY, y = 0) {
    this.position.x = x;
    this.position.z = z;
    this.position.y = y;
    this.vy = 0;
    this.grounded = y <= 0;
    this.rotY = rotY;
    this.velocity.x = 0;
    this.velocity.z = 0;
    this.collision.resolveCircle(this.position, CONFIG.PLAYER_RADIUS);
    this._syncModel();
  }

  update(dt) {
    const axis = this.locked ? { x: 0, y: 0 } : this.input.getMoveAxis();
    const f = this.camera.getForward();
    const r = this.camera.getRight();
    let mx = f.x * axis.y + r.x * axis.x;
    let mz = f.z * axis.y + r.z * axis.x;
    const len = Math.hypot(mx, mz);
    if (len > 0) { mx /= len; mz /= len; }

    const maxSpeed = this.input.isRunning() ? CONFIG.RUN_SPEED : CONFIG.WALK_SPEED;
    const tx = mx * maxSpeed;
    const tz = mz * maxSpeed;
    const a = Math.min(1, dt * CONFIG.ACCELERATION);
    this.velocity.x += (tx - this.velocity.x) * a;
    this.velocity.z += (tz - this.velocity.z) * a;
    if (len === 0 && Math.hypot(this.velocity.x, this.velocity.z) < 0.05) {
      this.velocity.x = 0;
      this.velocity.z = 0;
    }

    const prevX = this.position.x;
    const prevZ = this.position.z;
    this.position.x += this.velocity.x * dt;
    this.position.z += this.velocity.z * dt;
    this.collision.resolveCircle(this.position, CONFIG.PLAYER_RADIUS);

    // 실제 이동한 거리 기준 속도 (벽에 막히면 걷는 모션도 줄어듦)
    const moved = Math.hypot(this.position.x - prevX, this.position.z - prevZ);
    this.speed = dt > 0 ? moved / dt : 0;
    if (Math.abs(this.velocity.x) + Math.abs(this.velocity.z) > 0.01 && this.speed < 0.05) {
      this.velocity.x *= 0.5;
      this.velocity.z *= 0.5;
    }

    // 점프 / 중력
    this._jumpQueued = Math.max(0, this._jumpQueued - dt);
    if (this._jumpQueued > 0 && this.grounded && !this.locked) {
      this.vy = CONFIG.JUMP_VELOCITY;
      this.grounded = false;
      this._jumpQueued = 0;
    }
    if (!this.grounded) {
      this.vy -= CONFIG.GRAVITY * dt;
      this.position.y += this.vy * dt;
      if (this.position.y <= 0) {
        this.position.y = 0;
        this.vy = 0;
        this.grounded = true;
      }
    }

    // 이동 방향으로 회전
    if (len > 0) {
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
