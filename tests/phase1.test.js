// Phase 1 단위 테스트 (Three.js 없이 실행 가능한 순수 로직)
// 실행: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  sanitizeAppearance, randomAppearance, validateNickname, DEFAULT_APPEARANCE, APPEARANCE_FIELDS,
  sanitizeBodyStats,
} from '../client/js/shared/appearance.js';
import { CollisionWorld } from '../client/js/world/CollisionWorld.js';
import { PlayerController, lerpAngle } from '../client/js/character/PlayerController.js';
import { findPunchingBagTarget } from '../client/js/world/bagCollision.js';
import { buildShell, facePlacement, insideHead } from '../client/js/character/headShape.js';

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

test('얼굴 파츠는 각각 검증되고 예전 캐릭터는 기본 얼굴로 호환', () => {
  const a = sanitizeAppearance({ eyes: 'sparkle', brows: 'angled', nose: 'dot', mouth: 'cat' });
  assert.equal(a.eyes, 'sparkle');
  assert.equal(a.brows, 'angled');
  assert.equal(a.nose, 'dot');
  assert.equal(a.mouth, 'cat');
  const old = sanitizeAppearance({ hair: 'short', face: 'round' });
  assert.equal(old.eyes, DEFAULT_APPEARANCE.eyes);
  assert.equal(old.brows, DEFAULT_APPEARANCE.brows);
  assert.equal(old.nose, DEFAULT_APPEARANCE.nose);
  assert.equal(old.mouth, DEFAULT_APPEARANCE.mouth);
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

test('샌드백: 플레이어가 바라보는 방향의 정면 공격만 판정', () => {
  const front = { worldX: 0, worldZ: 1.2 };
  const bags = [front, { worldX: 2.4, worldZ: 1.2 }];
  assert.equal(findPunchingBagTarget(bags, {
    fromX: 0, fromZ: 0, hitX: 0, hitZ: 0.9, rotY: 0,
  }), front);
  assert.equal(findPunchingBagTarget([front], {
    fromX: 0, fromZ: 0, hitX: 0, hitZ: 0.9, rotY: Math.PI,
  }), null); // 뒤돌아선 상태
  assert.equal(findPunchingBagTarget([front], {
    fromX: 0, fromZ: 0, hitX: 0, hitZ: 0.9, rotY: Math.PI / 2,
  }), null); // 옆을 보는 상태
  assert.equal(findPunchingBagTarget([front], {
    fromX: 0, fromZ: -1.5, hitX: 0, hitZ: -0.6, rotY: 0,
  }), null); // 사정거리 밖
});

test('벤치 앉기: 다가온 쪽(앞/뒤)을 바라보고 앉고, 같은 쪽으로 일어남', () => {
  const model = {
    root: { position: { set() {} }, rotation: { y: 0 } },
    setExercise() {},
  };
  const input = { onPress: () => () => {} };
  const player = new PlayerController(model, input, {}, {});
  const seat = {
    type: 'seat', exercise: 'sit', twoSided: true, rotY: 0, x: 1, z: 2, spot: { x: 1, z: 2, y: 0.48, r: 0 },
  };
  // 벤치 앞(+z)에서 벤치를 바라보며 접근 → 앞쪽을 보고 앉음
  player.position.x = 1; player.position.z = 2.6; player.rotY = Math.PI;
  player.startActivity(seat);
  assert.equal(player.rotY, 0);
  assert.ok(player.activity.exit.z > 2.5);
  // 벤치 뒤(-z)에서 접근 → 반대쪽을 보고 앉고, 뒤쪽으로 일어남
  player.activity = null;
  player.position.x = 1; player.position.z = 1.4; player.rotY = 0;
  player.startActivity(seat);
  assert.ok(Math.abs(player.rotY - Math.PI) < 1e-9);
  assert.ok(player.activity.exit.z < 1.5);
  // 운동기구는 지정 방향 사용
  player.activity = null;
  player.startActivity({ type: 'machine', exercise: 'ex_bench', x: 0, z: 0, rotY: 0, spot: { x: 1, z: 2, y: 0, r: -0.7 } });
  assert.equal(player.rotY, -0.7);
});

test('머리 모양: 헤어 껍질은 모든 얼굴형·체중에서 머리 표면 밖, 얼굴 파츠는 표면 위', () => {
  for (const face of ['round', 'oval', 'square', 'vline']) {
    for (const cheek of [1, 1.07, 1.14]) {
      const { positions } = buildShell(face, cheek, { scale: 1.03 });
      for (let i = 0; i < positions.length; i += 3) {
        assert.equal(insideHead(face, cheek, positions[i], positions[i + 1], positions[i + 2]), false, `${face} ${cheek}`);
      }
      // 눈·입 위치: 표면에서 1cm 이내 (떠 있거나 파묻히지 않음)
      for (const [x, y] of [[0.1, 0.012], [-0.1, 0.012], [0, -0.112], [0, -0.045]]) {
        const p = facePlacement(face, cheek, x, y, 0.002);
        assert.equal(insideHead(face, cheek, p.x, p.y, p.z), false);
        assert.equal(insideHead(face, cheek, p.x, p.y, p.z - 0.01), true);
      }
    }
  }
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

test('상점 카탈로그: id 중복 없음, 슬롯 유효, 보유 확인 / 확인 생략(null)', async () => {
  const { ACCESSORIES, ACC_SLOTS, sanitizeAppearance } = await import('../client/js/shared/appearance.js');
  const ids = ACCESSORIES.map((a) => a.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const a of ACCESSORIES) {
    assert.ok(ACC_SLOTS.includes(a.slot), a.id);
    assert.ok(a.price > 0, a.id);
  }
  const look = { acc: { hat: 'crown', trail: 'trail_fire', back: 'cap' } };
  assert.deepEqual(sanitizeAppearance(look, { ownedItems: ['crown'] }).acc, { hat: 'crown' });
  assert.deepEqual(sanitizeAppearance(look, { ownedItems: null }).acc, { hat: 'crown', trail: 'trail_fire' }); // 슬롯이 틀린 건 제거
});

test('운동 자리(서버 코인 판정용) = 기구 배치 + 기구별 자리', async () => {
  const { exerciseSpots, EQUIPMENT_LAYOUT } = await import('../client/js/shared/gymLayout.js');
  const spots = exerciseSpots();
  assert.equal(spots.length, EQUIPMENT_LAYOUT.length);
  const lat = spots.find((s) => s.id === 'latpull-1'); // rotY = -90°: 로컬 z 0.32 → 월드 x -0.32
  assert.ok(Math.abs(lat.x - (17 - 0.32)) < 1e-9 && Math.abs(lat.z - -3) < 1e-9);
  assert.equal(lat.exercise, 'ex_lat');
});

test('옷 무늬 다각형 삼각분할', async () => {
  const { triangulate, starPoly, heartPoly } = await import('../client/js/character/polygons.js');
  const area = (poly, tris) => {
    let s = 0;
    for (let i = 0; i < tris.length; i += 3) {
      const [a, b, c] = [poly[tris[i]], poly[tris[i + 1]], poly[tris[i + 2]]];
      s += ((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) / 2;
    }
    return s;
  };
  const polyArea = (p) => Math.abs(p.reduce((s, [x1, y1], i) => { const [x2, y2] = p[(i + 1) % p.length]; return s + x1 * y2 - x2 * y1; }, 0) / 2);
  for (const poly of [starPoly(5, 1, 0.45), heartPoly(24), [[0.15, 1], [-0.5, -0.05], [-0.02, -0.05], [-0.25, -1], [0.5, 0.15], [0.03, 0.15], [0.35, 1]]]) {
    const tris = triangulate(poly);
    assert.equal(tris.length, (poly.length - 2) * 3);
    assert.ok(Math.abs(area(poly, tris) - polyArea(poly)) < 1e-9); // 전부 같은 방향(앞면), 빈틈/겹침 없음
  }
});

test('샌드백 흔들림: 서버·화면이 같은 시각이면 같은 위치, 퍼펙트 구간은 약 18%', async () => {
  const { bagAngle, bagInZone, BAG_SWING } = await import('../client/js/shared/bagMotion.js');
  assert.equal(bagAngle(0, 123456), bagAngle(0, 123456));
  let inZone = 0;
  const N = 10000;
  for (let i = 0; i < N; i++) if (bagInZone(1, (i / N) * BAG_SWING.periodMs)) inZone++;
  assert.ok(inZone / N > 0.15 && inZone / N < 0.21, String(inZone / N));
  // 가운데 구간에서는 기울기가 작음
  for (let t = 0; t < 5000; t += 37) if (bagInZone(0, t)) assert.ok(Math.abs(bagAngle(0, t)) < BAG_SWING.amplitude * BAG_SWING.zone + 1e-9);
});
