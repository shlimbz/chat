// 득근 타워: 코스가 실제로 깰 수 있는지 + 서버 "날기" 검증이 정상 플레이를 막지 않는지
// 실제 PlayerController 물리(점프·중력·충돌)로 봇을 움직여 확인합니다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { CollisionWorld } from '../client/js/world/CollisionWorld.js';
import { PlayerController } from '../client/js/character/PlayerController.js';
import {
  TOWER_ELEMENTS, TOWER_CHECKPOINTS, TOWER_BOUNDS, TOWER_SPAWN, MAPS, mapOf, towerSupport, standingOn,
  moveOffset, fadeState, hitsSpinBar, onKillStrip, spinAngle,
} from '../client/js/shared/towerLayout.js';
import { PlayerRegistry } from '../server/src/game/PlayerRegistry.js';

const SOLIDS = TOWER_ELEMENTS.filter((e) => e.solid !== false);

function towerWorld() {
  const w = new CollisionWorld(TOWER_BOUNDS);
  const boxes = new Map();
  w.addBox(298, 302, -2, 2, 'pillar');
  for (const e of SOLIDS) {
    const b = w.addBox(e.x - e.w / 2, e.x + e.w / 2, e.z - e.d / 2, e.z + e.d / 2, e.id, e.top, e.top - e.h);
    b.dx = 0; b.dz = 0;
    if (e.pad) b.pad = e.pad;
    boxes.set(e.id, { b, e, last: { dx: 0, dz: 0 } });
  }
  /** Tower.update 와 같은 계산 */
  const tick = (ms) => {
    for (const { b, e, last } of boxes.values()) {
      if (e.move) {
        const { dx, dz } = moveOffset(e, ms);
        b.dx = dx - last.dx; b.dz = dz - last.dz;
        last.dx = dx; last.dz = dz;
        b.minX = e.x + dx - e.w / 2; b.maxX = e.x + dx + e.w / 2;
        b.minZ = e.z + dz - e.d / 2; b.maxZ = e.z + dz + e.d / 2;
      }
      if (e.fade) b.off = !fadeState(e, ms).solid;
    }
  };
  return { w, boxes, tick };
}

function makeBot(world) {
  const axis = { x: 0, y: 0 };
  const input = {
    enabled: true, onPress: () => () => {}, getMoveAxis: () => axis, isRunning: () => false,
  };
  const camera = { getForward: () => ({ x: 0, z: 1 }), getRight: () => ({ x: 1, z: 0 }) };
  const model = {
    root: { position: { set() {} }, rotation: {} }, update() {}, setExercise() {}, playAttack() {}, flinch() {}, knockDown() {}, action: 'idle',
  };
  const pc = new PlayerController(model, input, camera, world);
  return { pc, axis };
}

const gapTo = (p, b) => Math.hypot(Math.max(0, b.minX - p.x, p.x - b.maxX), Math.max(0, b.minZ - p.z, p.z - b.maxZ));

test('타워 코스: 연속된 발판 간격·높이가 점프로 갈 수 있는 범위', () => {
  for (let i = 1; i < SOLIDS.length; i++) {
    const a = SOLIDS[i - 1];
    const b = SOLIDS[i];
    const gap = Math.hypot(
      Math.max(0, Math.abs(a.x - b.x) - (a.w + b.w) / 2),
      Math.max(0, Math.abs(a.z - b.z) - (a.d + b.d) / 2),
    );
    const rise = b.top - a.top;
    assert.ok(gap <= 1.5, `${b.id} 간격 ${gap}`);
    assert.ok(rise <= (a.pad ? 3.0 : 0.6), `${b.id} 높이차 ${rise}`);
  }
  assert.equal(TOWER_CHECKPOINTS[0].cp, 0);
  assert.ok(TOWER_CHECKPOINTS.at(-1).goal);
  assert.equal(mapOf(TOWER_SPAWN.x), MAPS.TOWER);
  assert.equal(mapOf(0), MAPS.GYM);
});

test('타워 코스: 위아래로 겹치는 발판 사이에 머리 공간이 충분함', () => {
  for (let i = 0; i < SOLIDS.length; i++) {
    for (let j = i + 1; j < SOLIDS.length; j++) {
      const a = SOLIDS[i];
      const b = SOLIDS[j];
      // 움직이는 발판은 여러 시각에서 확인
      let near = false;
      for (let ms = 0; ms < 8000 && !near; ms += 100) {
        const oa = moveOffset(a, ms);
        const ob = moveOffset(b, ms);
        const gx = Math.abs(a.x + oa.dx - b.x - ob.dx) - (a.w + b.w) / 2;
        const gz = Math.abs(a.z + oa.dz - b.z - ob.dz) - (a.d + b.d) / 2;
        if (gx < 0.6 && gz < 0.6) near = true;
        if (!a.move && !b.move) break;
      }
      if (!near) continue; // 수평으로 떨어져 있음
      const lo = a.top < b.top ? a : b;
      const hi = a.top < b.top ? b : a;
      if (j === i + 1) continue;
      assert.ok(hi.top - hi.h - lo.top >= 2.0, `${lo.id} 위 ${hi.id} 머리 공간 ${hi.top - hi.h - lo.top}`);
    }
  }
});

test('충돌: 공중 발판은 아래로 지나갈 수 있고, 위로 뛰면 머리가 부딪힘', () => {
  const w = new CollisionWorld({ minX: -10, maxX: 10, minZ: -10, maxZ: 10 });
  w.addBox(-1, 1, -1, 1, 'float', 3.0, 2.6);
  const pos = { x: 0.2, z: 0 };
  w.resolveCircle(pos, 0.35, 0); // 바닥(0)에 서 있으면 머리(1.6)가 밑면(2.6)보다 낮음 → 막지 않음
  assert.equal(pos.x, 0.2);
  assert.equal(w.ceilingAbove(0, 0, 0.5, 1.2), 2.6); // 발 0.5→1.2 로 올라가면 머리 2.1→2.8: 밑면 2.6 에 닿음
  assert.equal(w.ceilingAbove(5, 5, 0.5, 1.2), Infinity);
  assert.equal(w.groundHeight(0, 0, 3.0), 3.0);
  w.boxes[0].off = true; // 사라진 발판
  assert.equal(w.groundHeight(0, 0, 3.0), 0);
});

test('움직이는 발판은 위에 선 캐릭터를 태우고, 점프대는 튀어 오르게 함', () => {
  const w = new CollisionWorld({ minX: -10, maxX: 10, minZ: -10, maxZ: 10 });
  const mv = w.addBox(-1, 1, -1, 1, 'mv', 1, 0.6);
  const { pc } = makeBot(w);
  pc.teleport(0, 0, 0, 1);
  pc.update(1 / 30);
  assert.equal(pc.grounded, true);
  for (let i = 0; i < 10; i++) {
    mv.dx = 0.05; mv.minX += 0.05; mv.maxX += 0.05;
    pc.update(1 / 30);
  }
  assert.ok(Math.abs(pc.position.x - 0.5) < 0.06, `태워짐 ${pc.position.x}`);
  const pad = w.addBox(4, 6, -1, 1, 'pad', 0.4, 0);
  pad.pad = 9.5;
  let jumped = 0;
  pc.onPad = () => { jumped++; };
  pc.teleport(5, 0, 0, 0.4);
  pc.update(1 / 30);
  assert.equal(jumped, 1);
  let maxY = 0;
  for (let i = 0; i < 60; i++) { pc.update(1 / 30); maxY = Math.max(maxY, pc.position.y); }
  assert.ok(maxY > 3.2 && maxY < 4.1, `점프대 높이 ${maxY}`);
});

test('함정 판정: 빨간 줄 / 회전 바벨 (점프로 넘으면 안전)', () => {
  const kill = TOWER_ELEMENTS.find((e) => e.kind === 'kill');
  assert.ok(onKillStrip(kill, kill.x, kill.top - kill.h, kill.z));
  assert.equal(onKillStrip(kill, kill.x, kill.top + 0.9, kill.z), false);
  const sp = TOWER_ELEMENTS.find((e) => e.spin);
  const ms = 12345;
  const a = spinAngle(sp, ms);
  const px = sp.x + Math.cos(a) * 1.0;
  const pz = sp.z + Math.sin(a) * 1.0;
  assert.ok(hitsSpinBar(sp, ms, px, sp.top, pz)); // 바 위치에 서 있음
  assert.equal(hitsSpinBar(sp, ms, px, sp.top + 0.8, pz), false); // 점프로 넘는 중
  assert.equal(hitsSpinBar(sp, ms, sp.x + Math.cos(a + Math.PI / 2) * 1.0, sp.top, sp.z + Math.sin(a + Math.PI / 2) * 1.0), false);
});

test('봇이 실제 물리로 정상까지 올라가고, 서버 높이 검증은 한 번도 막지 않음', () => {
  const { w, boxes, tick } = towerWorld();
  const { pc, axis } = makeBot(w);
  const reg = new PlayerRegistry();
  let now = 1_000_000;
  const sp = reg.add('s', { id: 1, nickname: 'bot', appearance: {} }, now);
  const start = TOWER_CHECKPOINTS[0];
  reg.place(sp, { x: start.x, y: start.top, z: start.z }, MAPS.TOWER, now);
  pc.teleport(start.x, start.z, 0, start.top);
  const dt = 1 / 60;
  let sendT = 0;
  let idx = 1; // 다음 목표 발판
  let corrected = 0;
  let falls = 0;
  const fallAt = {};
  let lastOnCur = 0;
  let steps = 0;
  let cp = 0;
  let maxSteps = 60 * 60 * 6;
  while (idx < SOLIDS.length && maxSteps-- > 0) {
    steps++;
    now += dt * 1000;
    tick(now);
    const cur = boxes.get(SOLIDS[idx - 1].id).b;
    const nb = boxes.get(SOLIDS[idx].id);
    const next = nb.b;
    const p = pc.position;
    const tx = (next.minX + next.maxX) / 2;
    const tz = (next.minZ + next.maxZ) / 2;
    const dx = tx - p.x;
    const dz = tz - p.z;
    const d = Math.hypot(dx, dz) || 1;
    const gap = gapTo(p, next);
    const onCur = pc.grounded && w.groundBox === cur;
    if (onCur) lastOnCur = now;
    const air = !pc.grounded;
    const ready = !next.off && (!nb.e.fade || fadeState(nb.e, now + 900).solid) && (!nb.e.move || gap < 1.3);
    // 내 발판 가장자리에 왔는지 (한 걸음 앞이 발판 밖)
    const ax = p.x + (dx / d) * 0.25;
    const az = p.z + (dz / d) * 0.25;
    const leaving = ax < cur.minX - 0.1 || ax > cur.maxX + 0.1 || az < cur.minZ - 0.1 || az > cur.maxZ + 0.1;
    if (onCur && !ready) {
      // 다음 발판이 멀거나(움직이는 중) 없으면 내 발판 안쪽 가장자리에서 기다림
      const inX = Math.min(Math.max(p.x + (dx / d) * 0.3, cur.minX + 0.3), cur.maxX - 0.3);
      const inZ = Math.min(Math.max(p.z + (dz / d) * 0.3, cur.minZ + 0.3), cur.maxZ - 0.3);
      const ex = inX - p.x;
      const ez = inZ - p.z;
      const el = Math.hypot(ex, ez);
      axis.x = el > 0.05 ? ex / el : 0;
      axis.y = el > 0.05 ? ez / el : 0;
    } else {
      axis.x = dx / d;
      axis.y = dz / d;
      if (onCur && (leaving || gap < 0.5)) pc.requestJump();
    }
    const yBefore = p.y;
    let padBox = null;
    pc.onPad = () => { padBox = w.groundBox; };
    pc.update(dt);
    if ((pc.grounded && w.groundBox === next) || padBox === next) idx++;
    // 떨어짐: 마지막 체크포인트로 (게임과 같은 규칙)
    for (let i = TOWER_CHECKPOINTS.length - 1; i > cp; i--) if (pc.grounded && standingOn(TOWER_CHECKPOINTS[i], p.x, p.y, p.z)) { cp = i; break; }
    if (p.y < TOWER_CHECKPOINTS[cp].top - 3.5 || (yBefore - p.y > 0 && p.y < cur.top - 3)) {
      falls++;
      fallAt[SOLIDS[idx].id] = (fallAt[SOLIDS[idx].id] || 0) + 1;
      const c = TOWER_CHECKPOINTS[cp];
      pc.teleport(c.x, c.z, 0, c.top);
      reg.place(sp, { x: c.x, y: c.top, z: c.z }, MAPS.TOWER, now);
      idx = SOLIDS.indexOf(c) + 1;
      continue;
    }
    sendT += dt;
    if (sendT >= 1 / 12) {
      sendT = 0;
      const res = reg.applyMove(sp, pc.getNetworkState(), now);
      if (res === 'corrected') corrected++;
    }
  }
  assert.equal(idx, SOLIDS.length, `정상 도착 실패 (목표 ${idx}/${SOLIDS.length}, 떨어짐 ${falls}회 ${JSON.stringify(fallAt)}, 서버 되돌림 ${corrected})`);
  assert.equal(corrected, 0, '정상 플레이가 서버 검증에 막힘');
  assert.ok(falls <= 6, `너무 자주 떨어짐: ${falls}`);
  console.log(`  봇 클리어: ${(steps / 60).toFixed(1)}초, 떨어짐 ${falls}회`);
});

test('서버: 타워에서 발판 없이 올라가면(날기) 되돌림, 점프대 위에서는 높이 허용', () => {
  const reg = new PlayerRegistry();
  let now = 2_000_000;
  const p = reg.add('s', { id: 2, nickname: 'fly', appearance: {} }, now);
  reg.place(p, { x: TOWER_SPAWN.x, y: 0, z: TOWER_SPAWN.z }, MAPS.TOWER, now);
  // 제자리에서 계속 위로
  let res = 'ok';
  for (let i = 1; i <= 12 && res === 'ok'; i++) {
    now += 100;
    res = reg.applyMove(p, [TOWER_SPAWN.x, i * 0.4, TOWER_SPAWN.z, 0, 0], now);
  }
  assert.equal(res, 'corrected');
  assert.ok(p.y <= 1.3);
  // 점프대 위에서 튀어 오르는 건 정상
  const pad = TOWER_ELEMENTS.find((e) => e.pad && e.top > 5);
  reg.place(p, { x: pad.x, y: pad.top, z: pad.z }, MAPS.TOWER, now);
  res = 'ok';
  for (let i = 1; i <= 8 && res === 'ok'; i++) {
    now += 83;
    res = reg.applyMove(p, [pad.x, pad.top + i * 0.42, pad.z, 0, 0], now);
  }
  assert.equal(res, 'ok');
  // 헬스장에서는 타워 좌표로 갈 수 없음 (경계)
  const g = reg.add('g', { id: 3, nickname: 'gym', appearance: {} }, now);
  assert.equal(reg.applyMove(g, [300, 0, 0, 0, 0], now + 100), 'corrected');
  assert.ok(towerSupport(TOWER_SPAWN.x, 0, TOWER_SPAWN.z));
});
