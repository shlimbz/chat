// NPC 대화창 (화면 아래쪽 말풍선 상자)
// - 다음: 클릭 / E / Space / Enter,  이전: ◀ 버튼,  닫기: ESC / ✕
import { el } from './dom.js';

export class NpcDialog {
  /**
   * @param {HTMLElement} root
   * @param {{onClose?:Function, onFlip?:Function}} h
   */
  constructor(root, h = {}) {
    this.h = h;
    this.nameEl = el('div', { class: 'npc-name' });
    this.textEl = el('div', { class: 'npc-text' });
    this.dotsEl = el('div', { class: 'npc-dots' });
    this.prevBtn = el('button', { class: 'npc-btn', text: '◀ 이전', attrs: { type: 'button' } });
    this.nextBtn = el('button', { class: 'npc-btn npc-next', text: '다음 ▶', attrs: { type: 'button' } });
    this.closeBtn = el('button', { class: 'npc-close', text: '✕', attrs: { type: 'button', 'aria-label': '닫기' } });
    this.box = el('div', { class: 'npc-box' }, [
      this.closeBtn,
      this.nameEl,
      this.textEl,
      el('div', { class: 'npc-foot' }, [this.dotsEl, el('div', { class: 'npc-nav' }, [this.prevBtn, this.nextBtn])]),
    ]);
    this.root = el('div', { id: 'npc-dialog', class: 'hidden' }, [this.box]);
    root.append(this.root);

    // 모바일: [말 걸기] 버튼을 누른 그 터치의 click 이 방금 열린 대화창에 떨어져 첫 페이지를 건너뛰지 않게
    const fresh = () => performance.now() - this._openedAt < 400;
    this.prevBtn.addEventListener('click', (e) => { e.stopPropagation(); if (!fresh()) this.prev(); });
    this.nextBtn.addEventListener('click', (e) => { e.stopPropagation(); if (!fresh()) this.next(); });
    this.closeBtn.addEventListener('click', (e) => { e.stopPropagation(); if (!fresh()) this.close(); });
    this.textEl.addEventListener('click', () => { if (!fresh()) this.next(); });
    this._openedAt = 0;
    this._onKey = (e) => {
      if (!this.isOpen()) return;
      if (e.code === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); this.close(); return; }
      if (e.repeat) return;
      if (e.code === 'Space' || e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'KeyE' || e.code === 'ArrowRight') {
        e.preventDefault();
        e.stopImmediatePropagation();
        this.next();
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        this.prev();
      }
    };
    // 게임 키 처리보다 먼저 받음 (대화 중 E 가 다시 말 걸기로 처리되지 않게)
    window.addEventListener('keydown', this._onKey, true);
    this.pages = [];
    this.i = 0;
  }

  isOpen() {
    return !this.root.classList.contains('hidden');
  }

  /**
   * @param {string} name 말하는 NPC 이름
   * @param {string[]} pages 각 페이지 HTML (게임에서 직접 만든 문자열만 사용)
   */
  open(name, pages) {
    this.nameEl.textContent = name;
    this.pages = pages;
    this.i = 0;
    this._openedAt = performance.now();
    this.root.classList.remove('hidden');
    this._render();
  }

  next() {
    if (this.i >= this.pages.length - 1) { this.close(); return; }
    this.i++;
    this.h.onFlip?.();
    this._render();
  }

  prev() {
    if (this.i === 0) return;
    this.i--;
    this.h.onFlip?.();
    this._render();
  }

  close() {
    if (!this.isOpen()) return;
    this.root.classList.add('hidden');
    this.h.onClose?.();
  }

  _render() {
    this.textEl.innerHTML = this.pages[this.i];
    this.dotsEl.textContent = '';
    this.pages.forEach((_, i) => this.dotsEl.append(el('span', { class: i === this.i ? 'on' : '' })));
    this.prevBtn.disabled = this.i === 0;
    this.nextBtn.textContent = this.i >= this.pages.length - 1 ? '알겠어요! ✓' : '다음 ▶';
  }
}

// ── 대사 ─────────────────────────────────────────────
const k = (s) => `<kbd>${s}</kbd>`;

/** 헬스장 안내 코치 */
export function coachPages(mobile, keys = { punch: 'J', kick: 'K' }) {
  if (mobile) {
    return [
      '어서 와요! 저는 <b>안내 코치 득근</b>이에요 💪<br>처음 오셨죠? 기본 조작을 짧게 알려 줄게요.',
      '<b>🕹️ 이동</b><br>왼쪽 아래를 누른 채로 끌면 조이스틱이 나와요.<br>끝까지 밀면 <b>달리기</b>!<br>빈 화면을 끌면 카메라가 돌고, 두 손가락으로 <b>확대/축소</b>해요.',
      '<b>🏋️ 운동 기구 · 벤치</b><br>기구 가까이 가면 오른쪽 아래에 <b>[이용]</b> 버튼이 생겨요.<br>누르면 운동 시작! 운동하는 동안 <b>3초마다 1코인</b> 🪙<br>그만할 때도 같은 버튼.',
      '<b>🥊 샌드백</b><br>샌드백 정면에서 👊(주먹) · 🦶(발차기) 버튼!<br>바닥 불이 <b style="color:#39d98a">초록색</b>일 때 치면 <b>PERFECT</b> → 코인을 더 줘요.',
      '<b>🛍️ 상점 · 🎒 가방</b><br>서쪽 벽 보라색 가판대에서 옷·모자·트레일을 사요.<br>산 아이템은 오른쪽 위 🎒 에서 입고 벗을 수 있어요.',
      '<b>💬 채팅 · 🏆 랭킹</b><br>오른쪽 위 💬 를 누르면 채팅 화면! 🎮 로 돌아와요.<br>가운데 천장 전광판은 오늘의 실시간 랭킹이에요.',
      '<b>🗼 득근 타워</b><br>북동쪽 구석의 보라색 <b>포탈</b>에 들어가면 점프맵 <b>득근 타워</b>로 가요.<br>정상까지 올라가면 코인 보상! 그럼 즐거운 운동 되세요 😄',
    ];
  }
  return [
    '어서 와요! 저는 <b>안내 코치 득근</b>이에요 💪<br>처음 오셨죠? 기본 조작을 짧게 알려 줄게요.',
    `<b>🕹️ 이동</b><br>${k('W')}${k('A')}${k('S')}${k('D')} 이동 · ${k('Shift')} 달리기 · ${k('Space')} 점프<br>마우스 <b>드래그</b>로 카메라 회전, <b>휠</b>로 확대/축소해요.`,
    `<b>🏋️ 운동 기구 · 벤치</b><br>기구 가까이에서 ${k('E')} → 운동 시작! 다시 ${k('E')} 면 그만해요.<br>운동하는 동안 <b>3초마다 1코인</b> 🪙 이 쌓여요.`,
    `<b>🥊 샌드백</b><br>샌드백 정면에서 ${k(keys.punch)} 주먹 · ${k(keys.kick)} 발차기!<br>바닥 불이 <b style="color:#39d98a">초록색</b>일 때 치면 <b>PERFECT</b> → 코인을 더 줘요.`,
    `<b>🛍️ 상점 · 🎒 가방</b><br>서쪽 벽 보라색 가판대에서 ${k('E')} → 옷·모자·트레일을 사요.<br>산 아이템은 ${k('I')} 가방에서 입고 벗어요.`,
    `<b>💬 채팅 · 🏆 랭킹</b><br>${k('Enter')} 로 채팅, <b>/help</b> 로 명령어 보기.<br>가운데 천장 전광판은 오늘의 실시간 랭킹 (밑에서 ${k('E')} 로 자세히).<br>${k('Esc')} 는 메뉴예요.`,
    '<b>🗼 득근 타워</b><br>북동쪽 구석의 보라색 <b>포탈</b>에 들어가면 점프맵 <b>득근 타워</b>로 가요.<br>정상까지 올라가면 코인 보상! 그럼 즐거운 운동 되세요 😄',
  ];
}

/** 타워 안내원 */
export function towerGuidePages(mobile) {
  const R = mobile ? '<b>[↺]</b> 버튼' : `${k('R')} 키`;
  return [
    '안녕! 여긴 <b>득근 타워</b>야 🗼<br>가운데 기둥을 빙글빙글 돌면서 꼭대기까지 올라가면 성공!',
    '<b>🟩 체크포인트</b><br>초록 발판을 밟으면 저장돼. 떨어지거나 함정에 닿으면 마지막 체크포인트로 돌아가.<br>' + `막히면 ${R}로 체크포인트로 돌아갈 수 있어.`,
    '<b>⚠️ 함정</b><br><b style="color:#ff5c7a">빨간 줄</b>과 돌아가는 <b>바벨</b>에 닿으면 실패! 바벨은 점프로 넘어.<br>🟦 파란 발판은 움직이고, 🟪 보라 매트는 깜빡이면 곧 사라져.',
    '<b>🟧 점프대</b><br>주황 발판을 밟으면 높이 튀어 올라. 공중에서 방향을 잡아 위 발판에 내려!<br>' + (mobile ? '조이스틱을 끝까지 밀면 달리면서 멀리 뛸 수 있어.' : `${k('Shift')} 를 누르고 달리면 더 멀리 뛰어.`),
    '<b>🏆 정상</b><br>꼭대기에 도착하면 <b>코인 보상</b>과 기록이 나와. 위의 시계가 지금 기록이야.<br>돌아갈 때는 파란 <b>포탈</b>이나 위의 <b>🏋️ 헬스장</b> 버튼! 화이팅 💪',
  ];
}
