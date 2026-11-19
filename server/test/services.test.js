// 서버 로직 단위 테스트 (socket.io/express 없이 실행 가능)
//   cd server && npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../src/db.js';
import { UserService } from '../src/services/UserService.js';
import { ChatService, parseChatInput, cleanText, RateLimiter } from '../src/services/ChatService.js';
import { PlayerRegistry } from '../src/game/PlayerRegistry.js';

const freshDb = () => openDatabase(':memory:');

test('계정: 가입 → 토큰 재접속 → 닉네임 사칭 차단', () => {
  const users = new UserService(freshDb());
  const a = users.register('헬린이', { body: 'female' });
  assert.equal(a.ok, true);
  assert.ok(a.token.length >= 30);
  assert.equal(a.user.appearance.body, 'female');

  // 같은 닉네임(대소문자 무관)으로는 가입 불가
  assert.deepEqual(users.register('헬린이', {}), { ok: false, error: 'NICK_TAKEN' });
  const b = users.register('GymBro', {});
  assert.deepEqual(users.register('gymbro', {}), { ok: false, error: 'NICK_TAKEN' });
  assert.equal(b.ok, true);

  // 토큰으로만 본인 확인
  assert.equal(users.findByToken(a.token).id, a.user.id);
  assert.equal(users.findByToken('x'.repeat(32)), null);
  assert.equal(users.findByToken(b.token).nickname, 'GymBro');

  assert.deepEqual(users.register('a', {}), { ok: false, error: 'NICK_INVALID' });
  assert.deepEqual(users.register('<b>hi</b>', {}), { ok: false, error: 'NICK_INVALID' });
});

test('계정: 외형은 검증된 값만 저장, 마지막 위치 저장', () => {
  const users = new UserService(freshDb());
  const { user } = users.register('테스터', { hair: 'evil', skin: '#ffe3cc' });
  assert.equal(user.appearance.hair, 'short');
  assert.equal(users.updateAppearance(user.id, { body: 'stocky', skin: 'javascript:alert(1)' }).skin, '#f6cba3');
  users.saveLastSeen(user.id, { x: 3, z: -2, r: 1 });
  assert.deepEqual(users.findById(user.id).lastPos, { x: 3, z: -2, r: 1 });
});

test('채팅 입력 해석', () => {
  assert.deepEqual(parseChatInput('  안녕  하세요 '), { kind: 'global', text: '안녕 하세요' });
  assert.deepEqual(parseChatInput('/w 철수 같이 운동해요'), { kind: 'whisper', target: '철수', text: '같이 운동해요' });
  assert.deepEqual(parseChatInput('/msg 철수 hi'), { kind: 'whisper', target: '철수', text: 'hi' });
  assert.equal(parseChatInput('/w 철수').kind, 'error');
  assert.equal(parseChatInput('/r 답장').kind, 'reply');
  assert.equal(parseChatInput('/WHO').kind, 'who');
  assert.equal(parseChatInput('/help').kind, 'help');
  assert.equal(parseChatInput('/dance').kind, 'error');
  assert.equal(parseChatInput('   ').kind, 'empty');
  assert.equal(parseChatInput(123).kind, 'empty');
  assert.equal(cleanText('a\u0000b\nc').includes('\n'), false);
  assert.equal(cleanText('가'.repeat(500)).length, 200);
});

test('채팅 저장/조회: 전체 기록 페이지, 귓속말 상대별 조회', () => {
  const db = freshDb();
  const users = new UserService(db);
  const chat = new ChatService(db);
  const a = users.register('에이', {}).user;
  const b = users.register('비비', {}).user;
  const c = users.register('씨씨', {}).user;

  for (let i = 0; i < 60; i++) chat.saveGlobal(a.id, `msg ${i}`);
  const w1 = chat.saveWhisper(a.id, b.id, '비밀1');
  chat.saveWhisper(b.id, a.id, '비밀2');
  chat.saveWhisper(a.id, c.id, '씨에게');

  assert.deepEqual({ type: w1.type, from: w1.from, to: w1.to, text: w1.text }, { type: 'whisper', from: '에이', to: '비비', text: '비밀1' });

  const recent = chat.globalHistory();
  assert.equal(recent.length, 50);
  assert.equal(recent.at(-1).text, 'msg 59');
  const older = chat.globalHistory(recent[0].id);
  assert.equal(older.length, 10);
  assert.equal(older[0].text, 'msg 0');

  // 귓속말은 관련자에게만
  const forC = chat.initialHistory(c.id).filter((m) => m.type === 'whisper');
  assert.deepEqual(forC.map((m) => m.text), ['씨에게']);
  const forB = chat.initialHistory(b.id).filter((m) => m.type === 'whisper');
  assert.deepEqual(forB.map((m) => m.text), ['비밀1', '비밀2']);

  assert.deepEqual(chat.whisperPartners(a.id).map((p) => p.nickname), ['씨씨', '비비']);
  assert.deepEqual(chat.whispersBetween(a.id, b.id).map((m) => m.text), ['비밀1', '비밀2']);
  assert.deepEqual(chat.whispersBetween(b.id, c.id), []);
});

test('도배 방지', () => {
  const rl = new RateLimiter(3, 1000);
  assert.equal(rl.allow(1, 0), true);
  assert.equal(rl.allow(1, 10), true);
  assert.equal(rl.allow(1, 20), true);
  assert.equal(rl.allow(1, 30), false);
  assert.equal(rl.allow(2, 30), true);
  assert.equal(rl.allow(1, 1500), true);
});

test('이동 검증: 범위 제한, 순간이동 차단, 변경분만 전송', () => {
  const reg = new PlayerRegistry();
  const p = reg.add('s1', { id: 7, nickname: 'n', appearance: {}, bodyStats: {}, level: 1, lastPos: null }, 0);
  assert.equal(p.x, 0);
  assert.equal(p.z, 8);

  assert.equal(reg.applyMove(p, [0.5, 0, 7.5, 0, 1], 100), 'ok');
  assert.deepEqual(reg.takeStatePacket(), [[7, 0.5, 0, 7.5, 0, 1]]);
  assert.deepEqual(reg.takeStatePacket(), []); // 변화 없으면 전송 안 함

  assert.equal(reg.applyMove(p, [10, 0, -10, 0, 1], 200), 'corrected'); // 0.1초에 20m 이동 불가
  assert.equal(p.x, 0.5);

  assert.equal(reg.applyMove(p, [0.5, 99, 7.5, 0, 3], 300), 'ok');
  assert.equal(p.y, 1.6); // 점프 높이 제한
  assert.equal(reg.applyMove(p, ['a', 0, 0, 0, 0], 400), 'invalid');
  assert.equal(reg.applyMove(p, [0.5, 0, 7.5, 0, 99], 500), 'ok');
  assert.equal(p.a, 0); // 알 수 없는 동작 → idle

  assert.equal(reg.getByNickname('N'), p);
  reg.remove('s1');
  assert.equal(reg.count, 0);
});
