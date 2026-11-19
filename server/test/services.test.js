// 서버 로직 단위 테스트 (socket.io/express 설치 없이 실행 가능)
//   cd server && npm test
// DB 관련 테스트는 두 방식(로컬 SQLite, Turso 어댑터)으로 똑같이 실행합니다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../src/db.js';
import { createFakeLibsqlClient } from '../test-utils/fakeLibsql.js';
import { AccountService, hashPassword, verifyPassword } from '../src/services/AccountService.js';
import { CharacterService, hashToken } from '../src/services/CharacterService.js';
import { ChatService, parseChatInput, cleanText, RateLimiter } from '../src/services/ChatService.js';
import { PlayerRegistry } from '../src/game/PlayerRegistry.js';
import { resolveAttack } from '../src/game/combat.js';
import { EconomyService } from '../src/services/EconomyService.js';
import { StatsService, kstDay } from '../src/services/StatsService.js';
import { ECONOMY } from '../../client/js/shared/economy.js';

const BACKENDS = {
  local: () => openDatabase({ DB_PATH: ':memory:' }),
  turso: () => openDatabase({}, { libsqlClient: createFakeLibsqlClient() }),
};

for (const [name, makeDb] of Object.entries(BACKENDS)) {
  test(`[${name}] 스키마 v5 생성 + 재시작 시 재실행 안 함`, async () => {
    const client = name === 'turso' ? createFakeLibsqlClient() : null;
    const db = client ? await openDatabase({}, { libsqlClient: client }) : await makeDb();
    assert.equal(db.kind, name);
    assert.equal(Number((await db.get("SELECT value FROM _meta WHERE key = 'schema_version'")).value), 5);
    if (client) {
      const before = client.calls.executeMultiple;
      await openDatabase({}, { libsqlClient: client });
      assert.equal(client.calls.executeMultiple, before + 1);
    }
  });

  test(`[${name}] 계정: 가입/로그인/세션/로그아웃/차단`, async () => {
    const accounts = new AccountService(await makeDb(), { adminUsernames: ['BossAdmin'] });
    const r = await accounts.register('player01', 'secret123');
    assert.equal(r.ok, true);
    assert.equal(r.account.isAdmin, false);
    assert.equal((await accounts.register('PLAYER01', 'whatever1')).ok, false); // 대소문자 무시 중복
    assert.equal((await accounts.register('ab', 'secret123')).ok, false); // 짧은 아이디
    assert.equal((await accounts.register('player02', '123')).ok, false); // 짧은 비번

    assert.equal((await accounts.login('player01', 'wrongpw')).ok, false);
    assert.equal((await accounts.login('nobody', 'secret123')).ok, false);
    const l = await accounts.login('player01', 'secret123');
    assert.equal(l.ok, true);
    assert.equal((await accounts.fromSession(l.token)).username, 'player01');
    assert.equal(await accounts.fromSession('x'.repeat(40)), null);

    await accounts.logout(l.token);
    assert.equal(await accounts.fromSession(l.token), null);
    assert.equal((await accounts.fromSession(r.token)).id, r.account.id); // 다른 세션은 유지

    await accounts.setBanned(r.account.id, true, '도배');
    assert.equal(await accounts.fromSession(r.token), null); // 차단 시 세션 삭제
    const banned = await accounts.login('player01', 'secret123');
    assert.equal(banned.ok, false);
    assert.equal(banned.code, 'BANNED');
    await accounts.setBanned(r.account.id, false);
    assert.equal((await accounts.login('player01', 'secret123')).ok, true);

    const admin = await accounts.register('bossadmin', 'secret123');
    assert.equal(admin.account.isAdmin, true); // ADMIN_USERNAMES (대소문자 무시)
  });

  test(`[${name}] 코인: 시작 코인, 벌기(시간당 상한), 구매/판매, 잔액 부족, 동시 구매, 관리자 지급, 저장`, async () => {
    const db = await makeDb();
    const accounts = new AccountService(db);
    const { account } = await accounts.register('shopper1', 'secret123');
    assert.equal(account.coins, ECONOMY.STARTING_COINS);
    let now = 1000;
    const eco = new EconomyService(db, { now: () => now });
    const w = await eco.open(account.id);
    assert.equal(w.coins, ECONOMY.STARTING_COINS);
    // 벌기: 시간당 상한
    assert.equal(eco.earn(account.id, 10), 10);
    assert.equal(eco.earn(account.id, ECONOMY.HOURLY_CAP), ECONOMY.HOURLY_CAP - 10);
    assert.equal(eco.earn(account.id, 1), 0);
    now += 3600001;
    assert.equal(eco.earn(account.id, 5), 5);
    const total = ECONOMY.STARTING_COINS + ECONOMY.HOURLY_CAP + 5;
    assert.equal(eco.view(account.id).coins, total);
    // 아직 DB 에는 저장 전 → flush 후 저장
    assert.equal((await accounts.findById(account.id)).coins, ECONOMY.STARTING_COINS);
    await eco.flushAll();
    assert.equal((await accounts.findById(account.id)).coins, total);
    // 구매
    assert.equal((await eco.buy(account.id, 'nope')).ok, false);
    const r = await eco.buy(account.id, 'medal'); // 1500
    assert.equal(r.ok, true);
    assert.equal(r.coins, total - 1500);
    assert.deepEqual(r.items, ['medal']);
    assert.equal((await eco.buy(account.id, 'medal')).ok, false); // 중복 구매 불가
    assert.equal((await eco.buy(account.id, 'aura_gold')).ok, false); // 4000 > 잔액
    // 동시에 두 번 눌러도 한 번만
    eco.earn(account.id, 0);
    const [a1, a2] = await Promise.all([eco.buy(account.id, 'cap'), eco.buy(account.id, 'cap')]);
    assert.equal([a1.ok, a2.ok].filter(Boolean).length, 1);
    // 판매 (50%)
    const s1 = await eco.sell(account.id, 'medal');
    assert.equal(s1.ok, true);
    assert.equal(s1.coins, total - 1500 - 300 + 750);
    assert.equal((await eco.sell(account.id, 'medal')).ok, false);
    // DB 와 메모리 일치
    const row = await accounts.findById(account.id);
    assert.equal(row.coins, s1.coins);
    assert.deepEqual(row.items, ['cap']);
    // 관리자 지급/회수 (0 아래로 안 내려감)
    assert.equal(await eco.adminGive(account.id, 100), s1.coins + 100);
    assert.equal(await eco.adminGive(account.id, -999999), 0);
    await eco.close(account.id);
    assert.equal((await accounts.findById(account.id)).coins, 0);
    // 접속 안 한 계정에도 지급 가능
    assert.equal(await eco.adminGive(account.id, 50), 50);
  });

  test(`[${name}] 오늘의 랭킹: 누적·정렬·날짜 바뀌면 초기화·내 기록`, async () => {
    const db = await makeDb();
    const accounts = new AccountService(db);
    const chars = new CharacterService(db);
    const { account } = await accounts.register('ranker01', 'secret123');
    const ids = [];
    for (const nick of ['가가', '나나', '다다']) ids.push((await chars.create(account.id, nick, {})).character.id);
    let now = Date.UTC(2026, 10, 19, 3, 0); // 한국 12:00
    const st = new StatsService(db, { now: () => now, cacheMs: 0 });
    st.addExercise(ids[0], 30); st.addExercise(ids[1], 90); st.addBagHit(ids[2], 5); st.addBagHit(ids[0], 2);
    await st.flush();
    st.addExercise(ids[0], 100); // 저장 전에도 랭킹에 반영 (DB 를 쓰지 않고 합쳐서 계산)
    st.setName(ids[2], '다다');
    st.addExercise(ids[2], 5); // DB 에 아직 없는 사람도 이름과 함께 표시
    const r = await st.ranking(10);
    assert.equal(r.day, '2026-11-19');
    assert.deepEqual(r.exercise.map((x) => [x.nickname, x.value]), [['가가', 130], ['나나', 90], ['다다', 5]]);
    assert.deepEqual(r.bag.map((x) => [x.nickname, x.value]), [['다다', 5], ['가가', 2]]);
    st.addBagHit(ids[1]);
    assert.deepEqual(await st.mine(ids[1]), { exercise: 90, bag: 1 });
    now += 15 * 3600000; // 한국 다음날 03:00
    assert.equal(kstDay(now), '2026-11-20');
    const r2 = await st.ranking(10);
    assert.deepEqual(r2.exercise, []);
  });

  test(`[${name}] 관리자 계정 자동 생성(환경 변수) + 예약 아이디`, async () => {
    const accounts = new AccountService(await makeDb(), { adminUsernames: ['ADMING'], reservedUsernames: ['ADMING'] });
    // 일반 가입으로는 관리자 아이디를 먼저 차지할 수 없음
    assert.equal((await accounts.register('adming', 'hacker123')).ok, false);
    assert.equal((await accounts.ensureAdmin('ADMING', 'adminpass1')).created, true);
    const l = await accounts.login('ADMING', 'adminpass1');
    assert.equal(l.ok, true);
    assert.equal(l.account.isAdmin, true);
    assert.equal(l.account.coins, 0);
    assert.deepEqual(l.account.items, []);
    // 비밀번호를 바꾸면 재시작 시 새 비밀번호로 맞춰짐
    assert.equal((await accounts.ensureAdmin('ADMING', 'newpass99')).created, false);
    assert.equal((await accounts.login('ADMING', 'adminpass1')).ok, false);
    assert.equal((await accounts.login('ADMING', 'newpass99')).ok, true);
    assert.equal((await accounts.ensureAdmin('ADMING', '123')).ok, false); // 너무 짧은 비밀번호
    assert.equal(await accounts.cleanupSessions(), 0);
  });

  test(`[${name}] 캐릭터: 계정당 3개, 소유 확인, 삭제 후 닉네임 재사용, 예전 캐릭터 가져오기`, async () => {
    const db = await makeDb();
    const accounts = new AccountService(db);
    const characters = new CharacterService(db);
    const a = (await accounts.register('user_a', 'secret123')).account;
    const b = (await accounts.register('user_b', 'secret123')).account;

    const c1 = await characters.create(a.id, '헬린이', { gender: 'female', muscle: 0.8 });
    assert.equal(c1.ok, true);
    assert.equal(c1.character.appearance.gender, 'female');
    assert.equal(c1.character.appearance.muscle, 0.8);
    assert.equal((await characters.create(b.id, '헬린이', {})).ok, false); // 닉네임 중복
    await characters.create(a.id, '둘째', {});
    await characters.create(a.id, '셋째', {});
    const fourth = await characters.create(a.id, '넷째', {});
    assert.equal(fourth.ok, false);
    assert.match(fourth.error, /최대 3개/);

    assert.equal((await characters.listByAccount(a.id)).length, 3);
    assert.equal(await characters.findOwned(b.id, c1.character.id), null); // 남의 캐릭터 사용 불가
    assert.equal((await characters.findOwned(a.id, c1.character.id)).nickname, '헬린이');

    await characters.softDelete(c1.character.id);
    assert.equal((await characters.listByAccount(a.id)).length, 2);
    assert.equal(await characters.findByNickname('헬린이'), null);
    assert.equal((await characters.create(b.id, '헬린이', {})).ok, true); // 삭제 후 닉네임 재사용

    // 예전 버전(토큰 방식) 캐릭터
    const legacyToken = 'legacy-token-abcdefghijklmnop';
    await db.run(
      'INSERT INTO users (nickname, token_hash, appearance, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?)',
      ['옛날캐릭', hashToken(legacyToken), '{}', 0, 0],
    );
    const claimed = await characters.claimLegacy(b.id, legacyToken);
    assert.equal(claimed.nickname, '옛날캐릭');
    assert.equal(claimed.accountId, b.id);
    assert.equal(await characters.claimLegacy(a.id, legacyToken), null); // 이미 가져간 캐릭터
  });

  test(`[${name}] 계정 삭제 시 캐릭터도 정리, 채팅 기록은 "(삭제된 캐릭터)" 로 남음`, async () => {
    const db = await makeDb();
    const accounts = new AccountService(db);
    const characters = new CharacterService(db);
    const chat = new ChatService(db);
    const a = (await accounts.register('leaver', 'secret123')).account;
    const ca = (await characters.create(a.id, '떠날사람', {})).character;
    const b = (await accounts.register('stayer', 'secret123')).account;
    const cb = (await characters.create(b.id, '남는사람', {})).character;
    await chat.saveGlobal(ca, '안녕');
    await chat.saveWhisper(cb, ca, '잘가');
    await accounts.deleteAccount(a.id);
    assert.equal(await accounts.findByUsername('leaver'), null);
    assert.equal(await characters.findByNickname('떠날사람'), null);
    const hist = await chat.globalHistory();
    assert.equal(hist.at(-1).from, '(삭제된 캐릭터)');
    assert.deepEqual(await chat.whisperPartners(cb.id), []);
  });

  test(`[${name}] 채팅 저장/조회: 페이지, 귓속말 상대별 조회`, async () => {
    const db = await makeDb();
    const accounts = new AccountService(db);
    const characters = new CharacterService(db);
    const chat = new ChatService(db);
    const acc = (await accounts.register('chatter', 'secret123')).account;
    const a = (await characters.create(acc.id, '에이', {})).character;
    const b = (await characters.create(acc.id, '비비', {})).character;
    const c = (await characters.create(acc.id, '씨씨', {})).character;

    for (let i = 0; i < 60; i++) await chat.saveGlobal(a, `msg ${i}`);
    const w1 = await chat.saveWhisper(a, b, '비밀1');
    await chat.saveWhisper(b, a, '비밀2');
    await chat.saveWhisper(a, c, '씨에게');
    assert.equal(w1.to, '비비');

    const recent = await chat.globalHistory();
    assert.equal(recent.length, 50);
    assert.equal(recent.at(-1).text, 'msg 59');
    const older = await chat.globalHistory(recent[0].id);
    assert.equal(older.length, 10);
    assert.equal(older[0].text, 'msg 0');

    const forC = (await chat.initialHistory(c.id)).filter((m) => m.type === 'whisper');
    assert.deepEqual(forC.map((m) => m.text), ['씨에게']);
    assert.deepEqual((await chat.whisperPartners(a.id)).map((p) => p.nickname), ['씨씨', '비비']);
    assert.deepEqual((await chat.whispersBetween(a.id, b.id)).map((m) => m.text), ['비밀1', '비밀2']);
    assert.deepEqual(await chat.whispersBetween(b.id, c.id), []);
  });
}

test('비밀번호 해시: 원문 저장 안 함, 검증', async () => {
  const h1 = await hashPassword('hello123');
  const h2 = await hashPassword('hello123');
  assert.notEqual(h1, h2); // 솔트
  assert.equal(h1.includes('hello123'), false);
  assert.equal(await verifyPassword('hello123', h1), true);
  assert.equal(await verifyPassword('hello124', h1), false);
});

test('채팅 입력 해석 (일반 + 관리자 명령어)', () => {
  assert.deepEqual(parseChatInput('/give 철수 500'), { kind: 'admin', action: 'give', target: '철수', amount: 500 });
  assert.equal(parseChatInput('/give 철수').kind, 'error');
  assert.deepEqual(parseChatInput('  안녕  하세요 '), { kind: 'global', text: '안녕 하세요' });
  assert.deepEqual(parseChatInput('/w 철수 같이 운동해요'), { kind: 'whisper', target: '철수', text: '같이 운동해요' });
  assert.equal(parseChatInput('/w 철수').kind, 'error');
  assert.equal(parseChatInput('/r 답장').kind, 'reply');
  assert.equal(parseChatInput('/WHO').kind, 'who');
  assert.equal(parseChatInput('/dance').kind, 'error');
  assert.equal(parseChatInput('   ').kind, 'empty');
  assert.deepEqual(parseChatInput('/kick 철수 도배 그만'), { kind: 'admin', action: 'kick', target: '철수', reason: '도배 그만' });
  assert.deepEqual(parseChatInput('/ban 철수'), { kind: 'admin', action: 'ban', target: '철수', reason: null });
  assert.deepEqual(parseChatInput('/mute 철수 30'), { kind: 'admin', action: 'mute', target: '철수', minutes: 30 });
  assert.equal(parseChatInput('/mute 철수').minutes, 10);
  assert.deepEqual(parseChatInput('/notice 서버 점검 예정'), { kind: 'admin', action: 'notice', text: '서버 점검 예정' });
  assert.deepEqual(parseChatInput('/unban player01'), { kind: 'admin', action: 'unban', target: 'player01' });
  assert.equal(parseChatInput('/kick').kind, 'error');
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

const mkPlayer = (reg, id, x, z, r = 0) => {
  const p = reg.add(`s${id}`, { id, nickname: `p${id}`, appearance: {}, bodyStats: {}, level: 1, lastPos: { x, z, r } }, 0);
  return p;
};

test('전투: 거리·방향·쿨다운 판정, 넉백, 연타 시 기절', () => {
  const reg = new PlayerRegistry();
  const a = mkPlayer(reg, 1, 0, 0, 0); // +z 를 바라봄
  const front = mkPlayer(reg, 2, 0, 1.0); // 앞 1m
  const behind = mkPlayer(reg, 3, 0, -1.0); // 뒤
  const far = mkPlayer(reg, 4, 0, 3.0); // 멀리

  let r = resolveAttack(a, reg.list(), 'punch', 1000);
  assert.equal(r.ok, true);
  assert.deepEqual(r.hits.map((h) => h.target.id), [2]);
  assert.equal(r.hits[0].kz > 0, true); // 앞으로 밀려남
  assert.equal(r.hits[0].kx, 0);

  assert.equal(resolveAttack(a, reg.list(), 'punch', 1100).ok, false); // 쿨다운
  assert.equal(resolveAttack(a, reg.list(), 'punch', 1400).ok, true); // 2타 (누적 2점)
  r = resolveAttack(a, reg.list(), 'kick', 1500); // 발차기 2점 → 누적 4점
  assert.equal(r.hits[0].down, false);
  r = resolveAttack(a, reg.list(), 'punch', 1900); // 누적 5점 → 기절
  assert.equal(r.hits[0].down, true);
  assert.ok(front.downUntil > 1900);

  // 기절한 사람은 더 맞지 않고, 공격도 못 함
  assert.deepEqual(resolveAttack(a, reg.list(), 'kick', 2300).hits, []);
  assert.equal(resolveAttack(front, reg.list(), 'punch', 2400).ok, false);
  assert.equal(behind.hitLog.length, 0);
  assert.equal(far.hitLog.length, 0);
});

test('이동 검증: 범위 제한, 순간이동 차단, 넉백 중 여유, 변경분만 전송', () => {
  const reg = new PlayerRegistry();
  const p = reg.add('s1', { id: 7, nickname: 'n', appearance: {}, bodyStats: {}, level: 1, lastPos: null }, 0);
  assert.equal(p.z, 12);
  assert.equal(reg.applyMove(p, [0.5, 0, 11.5, 0, 1], 100), 'ok');
  assert.deepEqual(reg.takeStatePacket(), [[7, 0.5, 0, 11.5, 0, 1]]);
  assert.deepEqual(reg.takeStatePacket(), []);
  assert.equal(reg.applyMove(p, [10, 0, -10, 0, 1], 200), 'corrected');
  assert.equal(reg.applyMove(p, [0.5, 99, 11.5, 0, 3], 300), 'ok');
  assert.equal(p.y, 3.5);
  assert.equal(reg.applyMove(p, ['a', 0, 0, 0, 0], 400), 'invalid');
  // 넉백 중에는 더 빠른 이동 허용
  p.knockbackUntil = 1000;
  assert.equal(reg.applyMove(p, [0.5, 0, 10.0, 0, 0], 500), 'ok');
});
