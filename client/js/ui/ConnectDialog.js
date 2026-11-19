// 서버 접속 진행/실패 안내 창
import { el } from './dom.js';

export class ConnectDialog {
  constructor(root) {
    this.titleEl = el('h3', { class: 'connect-title' });
    this.msgEl = el('p', { class: 'connect-msg' });
    this.btnBox = el('div', { class: 'connect-actions' });
    this.spinner = el('div', { class: 'spinner' });
    this.overlay = el('div', { class: 'overlay dim hidden', id: 'connect' }, [
      el('div', { class: 'menu-panel connect-panel' }, [this.spinner, this.titleEl, this.msgEl, this.btnBox]),
    ]);
    root.append(this.overlay);
  }

  showProgress(title, msg = '') {
    this.titleEl.textContent = title;
    this.msgEl.textContent = msg;
    this.spinner.classList.remove('hidden');
    this.btnBox.replaceChildren();
    this.overlay.classList.remove('hidden');
  }

  /**
   * @param {string} title
   * @param {string} msg
   * @param {Array<{label:string,value:string,primary?:boolean}>} buttons
   * @returns {Promise<string>} 누른 버튼의 value
   */
  ask(title, msg, buttons) {
    this.titleEl.textContent = title;
    this.msgEl.textContent = msg;
    this.spinner.classList.add('hidden');
    this.overlay.classList.remove('hidden');
    return new Promise((resolve) => {
      this.btnBox.replaceChildren(...buttons.map((b) => el('button', {
        class: `btn${b.primary ? ' btn-primary' : ''}`,
        attrs: { type: 'button' },
        text: b.label,
        on: { click: () => { this.hide(); resolve(b.value); } },
      })));
    });
  }

  hide() {
    this.overlay.classList.add('hidden');
  }
}
