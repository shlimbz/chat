// 득근 타워: 코스가 실제로 깰 수 있는지 + 서버 "날기" 검증이 정상 플레이를 막지 않는지
// 실제 PlayerController 물리(점프·중력·충돌)로 봇을 움직여 확인합니다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { CollisionWorld } from '../client/js/world/CollisionWorld.js';
import { PlayerController } from '../client/js/character/PlayerController.js';
import {
  TOWER_ELEMENTS, TOWER_CHECKPOINTS, TOWER_BOUNDS, TOWER_SPAWN, MAPS, mapOf, towerSupport, standingOn,
  moveOffset, fadeState, hitsSpinBar, onKillStrip, spinAngle, shapeGap, turnAngle, windAt, inWind,
  hitsRope, ropeAngle, hitsCrusher, crushHeight, sandbagHit, sandbagPos, ROPE,
} from '../client/js/shared/towerLayout.js';
import { PlayerRegistry } from '../server/src/game/PlayerRegistry.js';

const SOLIDS = TOWER_ELEMENTS.filter((e) => e.solid !== false);

function towerWorld() {
  const w = new CollisionWorld(TOWER_BOUNDS);
  const boxes = new Map();
  w.addBox(298, 302, -2, 2, 'pillar');
  for (const e of SOLIDS) {
    const b = e.round
      ? w.addCylinder(e.x, e.z, e.w / 2, e.id, e.top, e.top - e.h)
      : w.addBox(e.x - e.w / 2, e.x + e.w / 2, e.z - e.d / 2, e.z + e.d / 2, e.id, e.top, e.top - e.h);
    b.dx = 0; b.dz = 0;
    if (e.pad) b.pad = e.pad;
    if (e.slip) b.slip = true;
    if (e.conveyor) b.conveyor = e.conveyor;
    if (e.turn) { b.cx = e.x; b.cz = e.z; }
    boxes.set(e.id, { b, e, last: { dx: 0, dz: 0, a: 0 } });
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
      if (e.turn) { const a = turnAngle(e, ms); b.turnD = a - last.a; last.a = a; }
    }
  };
  /** 지금 서 있는 곳의 바람 (Tower.update 와 같은 계산) */
  const wind = (p, ms) => {
    for (const { e } of boxes.values()) {
      const wd = windAt(e, ms);
      if (wd && inWind(e, p.x, p.y, p.z)) return wd;
    }
    return null;
  };
  tick.wind = wind;
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

const gapTo = (p, b) => (b.round
  ? Math.max(0, Math.hypot(p.x - b.cx, p.z - b.cz) - b.r)
  : Math.hypot(Math.max(0, b.minX - p.x, p.x - b.maxX), Math.max(0, b.minZ - p.z, p.z - b.maxZ)));
const inside = (b, x, z, m) => (b.round ? Math.hypot(x - b.cx, z - b.cz) < b.r + m : !(x < b.minX - m || x > b.maxX + m || z < b.minZ - m || z > b.maxZ + m));

test('타워 코스: 연속된 발판 간격·높이가 점프로 갈 수 있는 범위', () => {
  for (let i = 1; i < SOLIDS.length; i++) {
    const a = SOLIDS[i - 1];
    const b = SOLIDS[i];
    const gap = shapeGap(a, b);
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
        const g = shapeGap({ ...a, x: a.x + oa.dx, z: a.z + oa.dz }, { ...b, x: b.x + ob.dx, z: b.z + ob.dz });
        if (g < 0.6) near = true;
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
    const tx = next.round ? next.cx : (next.minX + next.maxX) / 2;
    const tz = next.round ? next.cz : (next.minZ + next.maxZ) / 2;
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
    const leaving = !inside(cur, ax, az, 0.1);
    if (onCur && !ready) {
      // 다음 발판이 멀거나(움직이는 중) 없으면 내 발판 안쪽 가장자리에서 기다림
      const ccx = cur.round ? cur.cx : (cur.minX + cur.maxX) / 2;
      const ccz = cur.round ? cur.cz : (cur.minZ + cur.maxZ) / 2;
      const hw = cur.round ? cur.r * 0.7 : (cur.maxX - cur.minX) / 2;
      const hd = cur.round ? cur.r * 0.7 : (cur.maxZ - cur.minZ) / 2;
      const inX = Math.min(Math.max(p.x + (dx / d) * 0.3, ccx - hw + 0.3), ccx + hw - 0.3);
      const inZ = Math.min(Math.max(p.z + (dz / d) * 0.3, ccz - hd + 0.3), ccz + hd - 0.3);
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
    const wd = tick.wind(p, now);
    pc.push.x = wd ? wd.vx : 0;
    pc.push.z = wd ? wd.vz : 0;
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

/**
 * 장애물을 걸어서(필요하면 점프해서) 지나가 보기: 출발 시각을 바꿔 가며 성공 비율 계산
 * @param {(ms:number, x:number, y:number, z:number)=>boolean} hit
 */
function crossRate(el, dir, hit, { jumpAt = null, speed = 3.2 } = {}) {
  const half = Math.max(el.w, el.d) / 2 + 0.6;
  let ok = 0;
  const N = 120;
  for (let i = 0; i < N; i++) {
    let ms = 50_000 + i * 37;
    let s = -half;
    let y = el.top;
    let vy = 0;
    let jumped = false;
    let fail = false;
    while (s < half) {
      const dt = 1 / 60;
      s += speed * dt;
      if (jumpAt !== null && !jumped && s >= jumpAt) { vy = 5; jumped = true; }
      if (jumped) { vy -= 13 * dt; y = Math.max(el.top, y + vy * dt); }
      ms += dt * 1000;
      if (hit(ms, el.x + dir.x * s, y, el.z + dir.z * s)) { fail = true; break; }
    }
    if (!fail) ok++;
  }
  return ok / N;
}

test('새 장애물: 높은 기믹(덤벨 프레스·샌드백 틀)이 위층 발판과 겹치지 않음', () => {
  for (const g of TOWER_ELEMENTS.filter((e) => e.crush || e.sandbag || e.rope)) {
    for (const o of SOLIDS) {
      if (o === g || shapeGap(g, o) > 0.3) continue;
      const dy = o.top - o.h - g.top;
      const need = g.crush ? 3.7 : g.sandbag ? 3.3 : 2.7;
      assert.ok(dy <= 0 || dy >= need, `${g.id}(${g.kind}) 위 ${o.id} 높이 ${dy.toFixed(2)}`);
    }
  }
});

test('새 장애물: 줄넘기는 그냥 걸으면 걸리고, 점프하면 지나갈 수 있음', () => {
  for (const el of TOWER_ELEMENTS.filter((e) => e.rope)) {
    const dir = { x: el.rope.px, z: el.rope.pz };
    const walk = crossRate(el, dir, (ms, x, y, z) => hitsRope(el, ms, x, y, z));
    const jump = crossRate(el, dir, (ms, x, y, z) => hitsRope(el, ms, x, y, z), { jumpAt: -0.9 });
    console.log(`  줄넘기 ${el.id}: 걷기 통과 ${Math.round(walk * 100)}% / 점프 통과 ${Math.round(jump * 100)}%`);
    assert.ok(walk < 0.15, `${el.id} 걷기만 해도 통과 ${walk}`);
    assert.ok(jump > 0.25, `${el.id} 점프 통과 비율 ${jump}`);
    // 줄이 머리 위에 있을 때 가운데에 서 있으면 안전
    const a = ropeAngle(el, 0);
    void a;
    assert.ok(ROPE.height + ROPE.radius > 2.2);
  }
});

test('새 장애물: 덤벨 프레스·샌드백은 타이밍을 맞추면 지나갈 수 있음', () => {
  for (const el of TOWER_ELEMENTS.filter((e) => e.crush)) {
    const r = crossRate(el, { x: 1, z: 0 }, (ms, x, y, z) => hitsCrusher(el, ms, x, y, z), { speed: 6 });
    console.log(`  덤벨 프레스 ${el.id}: 통과 ${Math.round(r * 100)}%`);
    assert.ok(r > 0.25 && r < 0.95, `${el.id} 통과 비율 ${r}`);
    assert.ok(crushHeight(el, 0) >= 0.1);
  }
  for (const el of TOWER_ELEMENTS.filter((e) => e.sandbag)) {
    const dir = { x: -el.sandbag.az, z: el.sandbag.ax }; // 흔들리는 방향과 직각 = 진행 방향
    const r = crossRate(el, dir, (ms, x, y, z) => !!sandbagHit(el, ms, x, y, z), { speed: 6 });
    console.log(`  샌드백 ${el.id}: 통과 ${Math.round(r * 100)}%`);
    assert.ok(r > 0.25 && r < 0.98, `${el.id} 통과 비율 ${r}`);
    const b = sandbagPos(el, 0);
    assert.ok(b.y - 0.55 > el.top + 0.1, '샌드백이 바닥에 끌리지 않음');
  }
});
