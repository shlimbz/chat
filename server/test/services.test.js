// 서버 로직 단위 테스트 (socket.io/express 설치 없이 실행 가능)
//   cd server && npm test
// DB 관련 테스트는 두 방식(로컬 SQLite, Turso 어댑터)으로 똑같이 실행합니다.
// Turso 는 실제 응답 형식을 흉내 낸 가짜 클라이언트(fakeLibsql.js)로 검증합니다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../src/db.js';
import { createFakeLibsqlClient } from '../test-utils/fakeLibsql.js';
import { UserService } from '../src/services/UserService.js';
import { ChatService, parseChatInput, cleanText, RateLimiter } from '../src/services/ChatService.js';
import { PlayerRegistry } from '../src/game/PlayerRegistry.js';

const BACKENDS = {
  local: () => openDatabase({ DB_PATH: ':memory:' }),
  turso: () => openDatabase({}, { libsqlClient: createFakeLibsqlClient() }),
};

for (const [name, makeDb] of Object.entries(BACKENDS)) {
  test(`[${name}] 스키마 생성은 여러 번 실행해도 안전`, async () => {
    const client = name === 'turso' ? createFakeLibsqlClient() : null;
    const open = () => (client ? openDatabase({}, { libsqlClient: client }) : makeDb());
    const db = await open();
    assert.equal(db.kind, name);
    const v = await db.get("SELECT value FROM _meta WHERE key = 'schema_version'");
    assert.equal(Number(v.value), 1);
    if (client) {
      const before = client.calls.executeMultiple;
      await openDatabase({}, { libsqlClient: client }); // 재시작 상황
      assert.equal(client.calls.executeMultiple, before + 1); // _meta 생성만, 마이그레이션 재실행 없음
    }
  });

  test(`[${name}] 계정: 가입 → 토큰 재접속 → 닉네임 사칭 차단`, async () => {
    const users = new UserService(await makeDb());
    const a = await users.register('헬린이', { body: 'female' });
    assert.equal(a.ok, true);
    assert.ok(a.token.length >= 30);
    assert.equal(a.user.appearance.body, 'female');
    assert.equal(typeof a.user.id, 'number');

    assert.deepEqual(await users.register('헬린이', {}), { ok: false, error: 'NICK_TAKEN' });
    const b = await users.register('GymBro', {});
    assert.equal(b.ok, true);
    assert.deepEqual(await users.register('gymbro', {}), { ok: false, error: 'NICK_TAKEN' });

    assert.equal((await users.findByToken(a.token)).id, a.user.id);
    assert.equal(await users.findByToken('x'.repeat(32)), null);
    assert.equal((await users.findByToken(b.token)).nickname, 'GymBro');

    assert.deepEqual(await users.register('a', {}), { ok: false, error: 'NICK_INVALID' });
    assert.deepEqual(await users.register('<b>hi</b>', {}), { ok: false, error: 'NICK_INVALID' });
  });

  test(`[${name}] 계정: 외형은 검증된 값만 저장, 마지막 위치 저장`, async () => {
    const users = new UserService(await makeDb());
    const { user } = await users.register('테스터', { hair: 'evil', skin: '#ffe3cc' });
    assert.equal(user.appearance.hair, 'short');
    assert.equal((await users.updateAppearance(user.id, { body: 'stocky', skin: 'javascript:alert(1)' })).skin, '#f6cba3');
    assert.equal((await users.findById(user.id)).appearance.body, 'stocky');
    await users.saveLastSeen(user.id, { x: 3, z: -2, r: 1 });
    assert.deepEqual((await users.findById(user.id)).lastPos, { x: 3, z: -2, r: 1 });
  });

  test(`[${name}] 채팅 저장/조회: 페이지, 귓속말 상대별 조회`, async () => {
    const db = await makeDb();
    const users = new UserService(db);
    const chat = new ChatService(db);
    const a = (await users.register('에이', {})).user;
    const b = (await users.register('비비', {})).user;
    const c = (await users.register('씨씨', {})).user;

    for (let i = 0; i < 60; i++) await chat.saveGlobal(a, `msg ${i}`);
    const w1 = await chat.saveWhisper(a, b, '비밀1');
    await chat.saveWhisper(b, a, '비밀2');
    await chat.saveWhisper(a, c, '씨에게');

    assert.deepEqual(
      { type: w1.type, from: w1.from, to: w1.to, text: w1.text, idOk: Number.isInteger(w1.id) },
      { type: 'whisper', from: '에이', to: '비비', text: '비밀1', idOk: true },
    );

    const recent = await chat.globalHistory();
    assert.equal(recent.length, 50);
    assert.equal(recent.at(-1).text, 'msg 59');
    assert.equal(recent.at(-1).from, '에이');
    const older = await chat.globalHistory(recent[0].id);
    assert.equal(older.length, 10);
    assert.equal(older[0].text, 'msg 0');

    // 귓속말은 관련자에게만
    const forC = (await chat.initialHistory(c.id)).filter((m) => m.type === 'whisper');
    assert.deepEqual(forC.map((m) => m.text), ['씨에게']);
    const forB = (await chat.initialHistory(b.id)).filter((m) => m.type === 'whisper');
    assert.deepEqual(forB.map((m) => m.text), ['비밀1', '비밀2']);

    assert.deepEqual((await chat.whisperPartners(a.id)).map((p) => p.nickname), ['씨씨', '비비']);
    assert.deepEqual((await chat.whispersBetween(a.id, b.id)).map((m) => m.text), ['비밀1', '비밀2']);
    assert.deepEqual(await chat.whispersBetween(b.id, c.id), []);
  });
}

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
  assert.deepEqual(reg.takeStatePacket(), []);

  assert.equal(reg.applyMove(p, [10, 0, -10, 0, 1], 200), 'corrected');
  assert.equal(p.x, 0.5);

  assert.equal(reg.applyMove(p, [0.5, 99, 7.5, 0, 3], 300), 'ok');
  assert.equal(p.y, 1.6);
  assert.equal(reg.applyMove(p, ['a', 0, 0, 0, 0], 400), 'invalid');
  assert.equal(reg.applyMove(p, [0.5, 0, 7.5, 0, 99], 500), 'ok');
  assert.equal(p.a, 0);

  assert.equal(reg.getByNickname('N'), p);
  reg.remove('s1');
  assert.equal(reg.count, 0);
});
