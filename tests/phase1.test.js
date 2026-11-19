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
  const out = sanitizeAppearance({ body: 'female', skin: '#123456', hair: 'mohawk', outfit: 'tracksuit', extra: 'x' });
  assert.equal(out.body, 'female');
  assert.equal(out.skin, DEFAULT_APPEARANCE.skin);
  assert.equal(out.hair, DEFAULT_APPEARANCE.hair);
  assert.equal(out.outfit, 'tracksuit');
  assert.equal('extra' in out, false);
  assert.deepEqual(sanitizeAppearance(null), { ...DEFAULT_APPEARANCE });
});

test('랜덤 외형은 항상 유효', () => {
  for (let i = 0; i < 200; i++) {
    const a = randomAppearance();
    for (const [k, allowed] of Object.entries(APPEARANCE_FIELDS)) assert.ok(allowed.includes(a[k]), k);
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
