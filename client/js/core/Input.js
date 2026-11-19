// 키보드 입력 관리
// - 채팅 입력창 등 텍스트 입력 중에는 게임 키를 무시 (Phase 3 채팅 대비)
// - enabled=false 이면 이동 키가 모두 해제된 것으로 처리 (메뉴/커스터마이징 화면)

export class Input {
  constructor() {
    this.keys = new Set();
    this.enabled = true;
    this._listeners = new Map(); // code → Set<fn>  (눌린 순간 1회 호출)

    this._onKeyDown = (e) => {
      // 텍스트 입력 중에는 게임 키 무시 (ESC 는 메뉴/창 닫기를 위해 허용)
      if (isTyping(e.target) && e.code !== 'Escape') return;
      if (!this.keys.has(e.code)) {
        const fns = this._listeners.get(e.code);
        if (fns) for (const fn of fns) fn(e);
      }
      this.keys.add(e.code);
      if (this.enabled && GAME_KEYS.has(e.code)) e.preventDefault();
    };
    this._onKeyUp = (e) => this.keys.delete(e.code);
    this._onBlur = () => this.keys.clear();

    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('blur', this._onBlur);
  }

  /** 키가 처음 눌렸을 때 호출될 함수 등록. 해제 함수를 반환 */
  onPress(code, fn) {
    if (!this._listeners.has(code)) this._listeners.set(code, new Set());
    this._listeners.get(code).add(fn);
    return () => this._listeners.get(code).delete(fn);
  }

  isDown(code) {
    return this.enabled && this.keys.has(code);
  }

  /** WASD/방향키 → {x: 좌우(-1~1), y: 앞뒤(-1~1)} */
  getMoveAxis() {
    if (!this.enabled) return { x: 0, y: 0 };
    const k = this.keys;
    const x = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    const y = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    return { x, y };
  }

  isRunning() {
    return this.isDown('ShiftLeft') || this.isDown('ShiftRight');
  }

  clear() {
    this.keys.clear();
  }

  dispose() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    window.removeEventListener('blur', this._onBlur);
  }
}

const GAME_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space']);

export function isTyping(el) {
  if (!el || !el.tagName) return false;
  const tag = el.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || el.isContentEditable;
}
