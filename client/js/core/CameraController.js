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
    this._dragging = false;
    this._last = { x: 0, y: 0 };

    this._onDown = (e) => {
      if (!this.enabled) return;
      this._dragging = true;
      this._last.x = e.clientX;
      this._last.y = e.clientY;
      dom.setPointerCapture?.(e.pointerId);
      dom.classList.add('dragging');
    };
    this._onMove = (e) => {
      if (!this._dragging || !this.enabled) return;
      const dx = e.clientX - this._last.x;
      const dy = e.clientY - this._last.y;
      this._last.x = e.clientX;
      this._last.y = e.clientY;
      this.yaw -= dx * this.sensitivity;
      this.pitch += dy * this.sensitivity * (this.invertY ? -1 : 1);
      this.pitch = Math.min(1.25, Math.max(-0.25, this.pitch));
    };
    this._onUp = (e) => {
      this._dragging = false;
      dom.releasePointerCapture?.(e.pointerId);
      dom.classList.remove('dragging');
    };
    this._onWheel = (e) => {
      if (!this.enabled) return;
      e.preventDefault();
      const factor = Math.exp(e.deltaY * 0.0012);
      this.targetDistance = Math.min(CONFIG.CAMERA_MAX_DISTANCE, Math.max(CONFIG.CAMERA_MIN_DISTANCE, this.targetDistance * factor));
    };
    this._onContext = (e) => e.preventDefault();

    dom.addEventListener('pointerdown', this._onDown);
    dom.addEventListener('pointermove', this._onMove);
    dom.addEventListener('pointerup', this._onUp);
    dom.addEventListener('pointercancel', this._onUp);
    dom.addEventListener('wheel', this._onWheel, { passive: false });
    dom.addEventListener('contextmenu', this._onContext);
  }

  /** 카메라가 바라보는 수평 전방 벡터 (이동 방향 계산용) */
  getForward() {
    return { x: -Math.sin(this.yaw), z: -Math.cos(this.yaw) };
  }

  getRight() {
    return { x: Math.cos(this.yaw), z: -Math.sin(this.yaw) };
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
  }
}
