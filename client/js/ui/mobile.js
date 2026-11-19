// 모바일(터치) 지원
// - 화면 왼쪽 아래: 가상 조이스틱 (끝까지 밀면 달리기)
// - 화면 오른쪽 아래: 점프 / 주먹 / 발차기 / 이용(E) 버튼
// - 화면 빈 곳 드래그: 카메라 회전, 두 손가락: 확대/축소 (CameraController)
// - 💬 버튼: 채팅 모드 (채팅창을 크게, 3D 는 절전)
import { el } from './dom.js';

export function isMobile() {
  return window.matchMedia('(pointer: coarse)').matches || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

/** 첫 실행 시 모바일이면 그래픽 품질을 "낮음" 으로 */
export function setupMobileDefaults(loadSettings, saveSettings) {
  if (!isMobile()) return;
  document.body.classList.add('mobile');
  try {
    if (!window.localStorage.getItem('onlinegym.settings.v1')) {
      saveSettings({ ...loadSettings(), quality: 'low', showFps: false });
    }
  } catch { /* 저장소 사용 불가 */ }
  // 키보드가 올라오면 보이는 영역 높이를 CSS 변수로 (채팅창이 키보드에 가리지 않게)
  const vv = window.visualViewport;
  if (vv) {
    const update = () => {
      document.documentElement.style.setProperty('--vvh', `${vv.height}px`);
      document.documentElement.style.setProperty('--vv-top', `${vv.offsetTop}px`);
    };
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    update();
  }
}

export class TouchControls {
  /**
   * @param {HTMLElement} root
   * @param {import('../core/Input.js').Input} input
   * @param {{onJump:Function, onPunch:Function, onKick:Function, onInteract:Function, onChat:Function, onMenu:Function}} h
   */
  constructor(root, input, h) {
    this.input = input;
    this.knob = el('div', { class: 'joy-knob' });
    this.base = el('div', { class: 'joy-base' }, [this.knob]);
    this.joy = el('div', { class: 'joy-zone' }, [this.base]);

    const btn = (cls, label, fn) => {
      const b = el('button', { class: `tbtn ${cls}`, attrs: { type: 'button' }, text: label });
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); fn(); b.classList.add('down'); });
      const up = () => b.classList.remove('down');
      b.addEventListener('pointerup', up);
      b.addEventListener('pointercancel', up);
      b.addEventListener('pointerleave', up);
      return b;
    };
    this.useBtn = btn('tbtn-use hidden', '이용', h.onInteract);
    this.buttons = el('div', { class: 'tbtns' }, [
      btn('tbtn-kick', '🦵', h.onKick),
      btn('tbtn-punch', '👊', h.onPunch),
      btn('tbtn-jump', '점프', h.onJump),
      this.useBtn,
    ]);
    this.topBtns = el('div', { class: 'ttop' }, [
      btn('tbtn-small', '💬', h.onChat),
      btn('tbtn-small', '☰', h.onMenu),
    ]);
    this.root = el('div', { class: 'touch-ui' }, [this.joy, this.buttons, this.topBtns]);
    root.append(this.root);
    this._bindJoystick();
  }

  setVisible(v) {
    this.root.classList.toggle('hidden', !v);
    if (!v) this._release();
  }

  setUseVisible(v, label = '이용') {
    // 매 프레임 호출되므로 바뀔 때만 DOM 수정 (불필요한 화면 재계산 방지)
    const key = v ? label : '';
    if (key === this._useKey) return;
    this._useKey = key;
    this.useBtn.classList.toggle('hidden', !v);
    if (v) this.useBtn.textContent = label;
  }

  _bindJoystick() {
    let id = null;
    let cx = 0;
    let cy = 0;
    const R = 50;
    const move = (e) => {
      if (e.pointerId !== id) return;
      let dx = e.clientX - cx;
      let dy = e.clientY - cy;
      const d = Math.hypot(dx, dy);
      if (d > R) { dx = (dx / d) * R; dy = (dy / d) * R; }
      this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
      const k = Math.min(1, d / R);
      const nx = d > 6 ? dx / R : 0;
      const ny = d > 6 ? -dy / R : 0;
      this.input.virtual.x = nx;
      this.input.virtual.y = ny;
      this.input.virtual.run = k > 0.92;
    };
    this.joy.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      id = e.pointerId;
      this.joy.setPointerCapture(id);
      // 누른 자리에 조이스틱이 나타남
      const rect = this.joy.getBoundingClientRect();
      cx = e.clientX;
      cy = e.clientY;
      this.base.style.left = `${cx - rect.left}px`;
      this.base.style.top = `${cy - rect.top}px`;
      this.base.classList.add('active');
      move(e);
    });
    this.joy.addEventListener('pointermove', move);
    const end = (e) => {
      if (e.pointerId !== id) return;
      this._release();
    };
    this.joy.addEventListener('pointerup', end);
    this.joy.addEventListener('pointercancel', end);
    this._release = () => {
      id = null;
      this.knob.style.transform = '';
      this.base.classList.remove('active');
      this.base.style.left = '';
      this.base.style.top = '';
      this.input.virtual.x = 0;
      this.input.virtual.y = 0;
      this.input.virtual.run = false;
    };
  }
}
