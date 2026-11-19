// Phase 1 단위 테스트 (Three.js 없이 실행 가능한 순수 로직)
// 실행: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  sanitizeAppearance, randomAppearance, validateNickname, DEFAULT_APPEARANCE, APPEARANCE_FIELDS,
  sanitizeBodyStats,
} from '../client/js/shared/appearance.js';
import { CollisionWorld } from '../client/js/world/CollisionWorld.js';
import { lerpAngle } from '../client/js/character/PlayerController.js';

test('닉네임 검증', () => {
  assert.equal(validateNickname('헬린이').ok, true);
  assert.equal(validateNickname('gym_bro99').ok, true);
  assert.equal(validateNickname('  공백제거  ').value, '공백제거');
  assert.equal(validateNickname('a').ok, false);
  assert.equal(validateNickname('가'.repeat(13)).ok, false);
  assert.equal(validateNickname('<script>').ok, false);
  assert.equal(validateNickname('띄어 쓰기').ok, false);
  assert.equal(validateNickname(null).ok, false);
});

test('외형 값 검증: 허용되지 않은 값은 기본값으로', () => {
  const out = sanitizeAppearance({ gender: 'female', skin: '#123456', hair: 'evil', outfit: 'tracksuit', muscle: 5, weight: -1, height: '0.73', extra: 'x' });
  assert.equal(out.gender, 'female');
  assert.equal(out.skin, DEFAULT_APPEARANCE.skin);
  assert.equal(out.hair, DEFAULT_APPEARANCE.hair);
  assert.equal(out.outfit, 'tracksuit');
  assert.equal(out.muscle, 1);
  assert.equal(out.weight, 0);
  assert.equal(out.height, 0.75); // 0.05 단위
  assert.equal('extra' in out, false);
  const def = sanitizeAppearance(null);
  assert.equal(def.gender, 'male');
  assert.deepEqual(def.acc, {});
});

test('외형: 예전 체형 데이터 호환, 악세사리는 보유한 것만', () => {
  const old = sanitizeAppearance({ body: 'stocky', hair: 'bun' });
  assert.equal(old.gender, 'male');
  assert.equal(old.muscle, 0.75);
  assert.equal(sanitizeAppearance({ body: 'female' }).gender, 'female');
  const acc = { hat: 'cap', eyes: 'sunglasses', neck: 'cap' };
  assert.deepEqual(sanitizeAppearance({ acc }).acc, {}); // 보유 없음 → 제거
  assert.deepEqual(sanitizeAppearance({ acc }, { ownedItems: ['cap', 'sunglasses'] }).acc, { hat: 'cap', eyes: 'sunglasses' }); // 슬롯 불일치 제거
});

test('랜덤 외형은 항상 유효', () => {
  for (let i = 0; i < 200; i++) {
    const a = randomAppearance();
    for (const [k, allowed] of Object.entries(APPEARANCE_FIELDS)) assert.ok(allowed.includes(a[k]), k);
    assert.ok(a.muscle >= 0 && a.muscle <= 1);
  }
});

test('성장 수치는 0~1 로 제한', () => {
  const s = sanitizeBodyStats({ chest: 5, arms: -1, legs: 'abc', back: 0.5 });
  assert.equal(s.chest, 1);
  assert.equal(s.arms, 0);
  assert.equal(s.legs, 0);
  assert.equal(s.back, 0.5);
});

test('충돌: 박스 밖으로 밀어냄', () => {
  const w = new CollisionWorld({ minX: -10, maxX: 10, minZ: -10, maxZ: 10 });
  w.addBox(-1, 1, -1, 1);
  const p = { x: 1.2, z: 0 };
  w.resolveCircle(p, 0.35);
  assert.ok(p.x >= 1.35 - 1e-9, `x=${p.x}`);
  const inside = { x: 0.9, z: 0.1 };
  w.resolveCircle(inside, 0.35);
  assert.equal(w.overlaps(inside, 0.349), false);
});

test('충돌: 방 경계 제한', () => {
  const w = new CollisionWorld({ minX: -5, maxX: 5, minZ: -5, maxZ: 5 });
  const p = { x: 99, z: -99 };
  w.resolveCircle(p, 0.5);
  assert.equal(p.x, 4.5);
  assert.equal(p.z, -4.5);
});

test('충돌: 회전된 로컬 박스', () => {
  const w = new CollisionWorld({ minX: -50, maxX: 50, minZ: -50, maxZ: 50 });
  // 가로 4, 세로 1 박스를 90도 회전 → 세로로 길어짐
  w.addLocalBox({ minX: -2, maxX: 2, minZ: -0.5, maxZ: 0.5 }, 10, 0, Math.PI / 2);
  const b = w.boxes[0];
  assert.ok(Math.abs(b.minX - 9.5) < 1e-9 && Math.abs(b.maxX - 10.5) < 1e-9);
  assert.ok(Math.abs(b.minZ + 2) < 1e-9 && Math.abs(b.maxZ - 2) < 1e-9);
});

test('각도 보간은 짧은 방향으로', () => {
  const r = lerpAngle(3.0, -3.0, 0.5);
  assert.ok(Math.abs(r) > 3.0, `r=${r}`);
});

test('물리: 높이 있는 장애물 — 낮은 건 올라서고/넘고, 높은 건 막힘', () => {
  const w = new CollisionWorld({ minX: -10, maxX: 10, minZ: -10, maxZ: 10 });
  w.addBox(-1, 1, -0.3, 0.3, 'bench', 0.5); // 벤치 (높이 0.5)
  w.addBox(3, 4, -1, 1, 'rack', 1.36); // 거치대
  w.addBox(-5, -4, -1, 1, 'deck', 0.2); // 러닝머신 발판 (걸어서 올라감)

  // 바닥에서는 벤치에 막힘
  const p = { x: 0, z: 0.5 };
  w.resolveCircle(p, 0.35, 0);
  assert.ok(p.z >= 0.65 - 1e-9);
  // 0.3m 이상 떠 있으면 벤치를 통과
  const q = { x: 0, z: 0.4 };
  w.resolveCircle(q, 0.35, 0.3);
  assert.equal(q.z, 0.4);
  // 벤치 위 바닥 높이 = 0.5 (점프해서 올라섬)
  assert.equal(w.groundHeight(0, 0, 0.3), 0.5);
  assert.equal(w.groundHeight(0, 0, 0.1), 0); // 아직 낮으면 벤치 위로 착지 불가
  // 높은 거치대는 점프 최고점(약 0.96m)에서도 막힘
  const r = { x: 3.2, z: 0 };
  w.resolveCircle(r, 0.35, 0.96);
  assert.ok(r.x <= 2.65 + 1e-9);
  // 발판은 바닥에서 바로 걸어 올라감
  assert.equal(w.groundHeight(-4.5, 0, 0), 0.2);
  const d = { x: -4.5, z: 0 };
  w.resolveCircle(d, 0.35, 0);
  assert.equal(d.x, -4.5);
});
