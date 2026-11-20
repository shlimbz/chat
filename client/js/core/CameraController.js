// 3인칭 자유 시점 카메라
// - 마우스 드래그(왼쪽/오른쪽 버튼): 회전
// - 마우스 휠: 줌
// - 방 밖으로 나가지 않도록 위치를 벽 안쪽으로 제한
import * as THREE from 'three';
import { CONFIG } from '../config.js';

export class CameraController {
  /**
   * @param {THREE.PerspectiveCamera} camera
   * @param {HTMLElement} dom 마우스 이벤트를 받을 요소 (게임 캔버스)
   * @param {{minX:number,maxX:number,minZ:number,maxZ:number,maxY:number}} bounds
   */
  constructor(camera, dom, bounds) {
    this.camera = camera;
    this.dom = dom;
    this.bounds = bounds;
    this.enabled = true;

    this.yaw = 0; // 0 이면 카메라가 대상의 +z 쪽(뒤)에 위치
    this.pitch = 0.32;
    this.distance = CONFIG.CAMERA_DEFAULT_DISTANCE;
    this.targetDistance = this.distance;
    this.sensitivity = CONFIG.MOUSE_SENSITIVITY;
    this.invertY = false;

    this.target = new THREE.Vector3();
    this._smoothTarget = new THREE.Vector3();
    this._first = true;
    this._pointers = new Map(); // pointerId → {x, y}  (터치 두 손가락 = 확대/축소)
    this._pinchDist = 0;
    // 마우스 시점 (PC): 화면을 클릭하면 마우스가 고정되고, 마우스를 움직이는 대로 시점이 돌아감 (Esc 로 해제)
    this.mouseLook = false;
    this.locked = false;
    this.wantLock = false; // 사용자가 직접 Esc 로 풀기 전까지는 다시 잠금
    this.unlockedAt = 0;
    this.onLockChange = null;
    // 자동 따라가기 (모바일): 이동 중에 카메라가 천천히 캐릭터 뒤로 돌아감
    this.autoFollow = false;
    this._lastManual = 0;

    this._onLockChange = () => {
      const was = this.locked;
      this.locked = document.pointerLockElement === dom;
      if (was && !this.locked) {
        this.unlockedAt = performance.now();
        if (!this._unlocking) this.wantLock = false; // 사용자가 Esc 로 직접 풂
      }
      if (this.locked) this.wantLock = true;
      this._unlocking = false;
      this.onLockChange?.(this.locked);
    };
    this._onMouseMove = (e) => {
      if (!this.locked || !this.enabled) return;
      this.yaw -= e.movementX * this.sensitivity * 0.8;
      this.pitch += e.movementY * this.sensitivity * 0.8 * (this.invertY ? -1 : 1);
      this.pitch = Math.min(1.25, Math.max(-0.25, this.pitch));
    };
    document.addEventListener('pointerlockchange', this._onLockChange);
    document.addEventListener('mousemove', this._onMouseMove);

    this._onDown = (e) => {
      if (!this.enabled) return;
      if (this.mouseLook && e.pointerType === 'mouse') {
        if (!this.locked && e.button === 0) this.lock();
        return; // 마우스 시점에서는 끌기 대신 마우스 움직임으로 회전
      }
      this._pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      dom.setPointerCapture?.(e.pointerId);
      dom.classList.add('dragging');
      if (this._pointers.size === 2) this._pinchDist = this._pinchDistance();
    };
    this._onMove = (e) => {
      const prev = this._pointers.get(e.pointerId);
      if (!prev || !this.enabled) return;
      const dx = e.clientX - prev.x;
      const dy = e.clientY - prev.y;
      prev.x = e.clientX;
      prev.y = e.clientY;
      if (this._pointers.size >= 2) {
        // 핀치 줌
        const d = this._pinchDistance();
        if (this._pinchDist > 0 && d > 0) {
          this.targetDistance = clampDist(this.targetDistance * (this._pinchDist / d));
        }
        this._pinchDist = d;
        return;
      }
      this._lastManual = performance.now();
      const touchBoost = e.pointerType === 'touch' ? 1.5 : 1;
      this.yaw -= dx * this.sensitivity * touchBoost;
      this.pitch += dy * this.sensitivity * touchBoost * (this.invertY ? -1 : 1);
      this.pitch = Math.min(1.25, Math.max(-0.25, this.pitch));
    };
    this._onUp = (e) => {
      this._pointers.delete(e.pointerId);
      this._pinchDist = this._pointers.size === 2 ? this._pinchDistance() : 0;
      dom.releasePointerCapture?.(e.pointerId);
      if (this._pointers.size === 0) dom.classList.remove('dragging');
    };
    this._onWheel = (e) => {
      if (!this.enabled) return;
      e.preventDefault();
      const factor = Math.exp(e.deltaY * 0.0012);
      this.targetDistance = clampDist(this.targetDistance * factor);
    };
    this._onContext = (e) => e.preventDefault();

    dom.addEventListener('pointerdown', this._onDown);
    dom.addEventListener('pointermove', this._onMove);
    dom.addEventListener('pointerup', this._onUp);
    dom.addEventListener('pointercancel', this._onUp);
    dom.addEventListener('wheel', this._onWheel, { passive: false });
    dom.addEventListener('contextmenu', this._onContext);
  }

  /** 마우스 고정 (클릭·키 입력 직후에만 브라우저가 허락) */
  lock() {
    if (!this.mouseLook || this.locked || !this.dom.requestPointerLock) return;
    try {
      const r = this.dom.requestPointerLock();
      if (r && r.catch) r.catch(() => {});
    } catch { /* 허락되지 않음 → 다음 클릭 때 */ }
  }

  /** 메뉴·채팅 등을 열 때 마우스 풀기 (다시 닫으면 relock 으로 복귀) */
  unlock() {
    if (!this.locked) return;
    this._unlocking = true;
    document.exitPointerLock?.();
  }

  /** 창을 닫은 뒤: 전에 마우스 시점을 쓰고 있었으면 다시 고정 */
  relock() {
    if (this.mouseLook && this.wantLock && !this.locked) this.lock();
  }

  /**
   * 자동 따라가기: 앞으로 가는 동안 카메라가 천천히 캐릭터 뒤로 (직접 돌린 뒤 1.5초 동안은 가만히)
   * @param {number} rotY 캐릭터 방향
   * @param {boolean} moving
   */
  followBehind(dt, rotY, moving) {
    if (!this.autoFollow || !moving || this.locked) return;
    if (performance.now() - this._lastManual < 1500 || this._pointers.size) return;
    let d = (rotY + Math.PI - this.yaw) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    if (Math.abs(d) > 2.7) return; // 카메라 쪽으로 걸어오는 중이면 돌리지 않음
    // 옆으로 갈 때는 천천히, 앞으로 갈 때는 조금 빠르게
    const rate = 1.6 * (1 - Math.abs(d) / Math.PI);
    this.yaw += d * Math.min(1, dt * rate);
  }

  _pinchDistance() {
    const [a, b] = [...this._pointers.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  }

  /** 카메라가 바라보는 수평 전방 벡터 (이동 방향 계산용) */
  getForward() {
    const f = this._fwd || (this._fwd = { x: 0, z: 0 });
    f.x = -Math.sin(this.yaw);
    f.z = -Math.cos(this.yaw);
    return f;
  }

  getRight() {
    const r = this._right || (this._right = { x: 0, z: 0 });
    r.x = Math.cos(this.yaw);
    r.z = -Math.sin(this.yaw);
    return r;
  }

  /** 대상 뒤로 카메라를 즉시 정렬 */
  snapBehind(rotY) {
    // 캐릭터 정면은 (sin rotY, cos rotY). 카메라는 그 반대편에 위치
    this.yaw = rotY + Math.PI;
    this._first = true;
  }

  /**
   * @param {number} dt
   * @param {{x:number,y:number,z:number}} focus 캐릭터 발 위치
   */
  update(dt, focus) {
    this.target.set(focus.x, focus.y + CONFIG.CAMERA_TARGET_HEIGHT, focus.z);
    if (this._first) {
      this._smoothTarget.copy(this.target);
      this._first = false;
    } else {
      this._smoothTarget.lerp(this.target, Math.min(1, dt * 12));
    }
    this.distance += (this.targetDistance - this.distance) * Math.min(1, dt * 10);

    const cp = Math.cos(this.pitch);
    let x = this._smoothTarget.x + Math.sin(this.yaw) * cp * this.distance;
    let y = this._smoothTarget.y + Math.sin(this.pitch) * this.distance;
    let z = this._smoothTarget.z + Math.cos(this.yaw) * cp * this.distance;

    // 벽 밖으로 나가지 않도록 제한
    const B = this.bounds;
    const pad = 0.25;
    x = Math.min(B.maxX - pad, Math.max(B.minX + pad, x));
    z = Math.min(B.maxZ - pad, Math.max(B.minZ + pad, z));
    y = Math.min(B.maxY - pad, Math.max(0.35, y));

    this.camera.position.set(x, y, z);
    this.camera.lookAt(this._smoothTarget);
  }

  dispose() {
    const dom = this.dom;
    dom.removeEventListener('pointerdown', this._onDown);
    dom.removeEventListener('pointermove', this._onMove);
    dom.removeEventListener('pointerup', this._onUp);
    dom.removeEventListener('pointercancel', this._onUp);
    dom.removeEventListener('wheel', this._onWheel);
    dom.removeEventListener('contextmenu', this._onContext);
    document.removeEventListener('pointerlockchange', this._onLockChange);
    document.removeEventListener('mousemove', this._onMouseMove);
  }
}

const clampDist = (d) => Math.min(CONFIG.CAMERA_MAX_DISTANCE, Math.max(CONFIG.CAMERA_MIN_DISTANCE, d));
