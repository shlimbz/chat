// 헬스장 NPC 이동 경로 (서버가 사용)
// - NODES: 통로 위의 점. EDGES: 직선으로 걸어도 기구·벽에 부딪히지 않는 연결 (실제 충돌 상자로 검사해 만든 목록)
// - 목적지(기구·샌드백·벤치·라운지)마다 가장 가까운 통로 점(node) → 다가가는 자리(approach) → 운동 자리(spot)
import { EQUIPMENT_LAYOUT, PUNCHING_BAGS, localToWorld } from './gymLayout.js';
import { EQUIPMENT_TYPES } from './equipmentTypes.js';

export const NODES = {
  w1: { x: -17.5, z: -7.0 }, w2: { x: -13.5, z: -7.0 }, w3: { x: -9.5, z: -7.0 }, w4: { x: -5.0, z: -7.0 },
  w5: { x: 0.0, z: -6.5 }, w6: { x: 5.5, z: -7.4 }, w7: { x: 10.5, z: -7.4 }, w8: { x: 14.6, z: -7.4 },
  m1: { x: -17.5, z: 0.6 }, m2: { x: -13.0, z: 0.6 }, m3: { x: -9.0, z: 0.6 }, m4: { x: -5.0, z: 0.6 }, m5: { x: -1.0, z: 0.4 },
  c1: { x: 0.2, z: 5.6 }, c2: { x: 0.2, z: 10.6 }, c3: { x: 6.5, z: 1.0 }, c4: { x: 7.5, z: 6.0 },
  r1: { x: -17.0, z: 9.6 }, r2: { x: -13.0, z: 9.6 }, r3: { x: -8.5, z: 9.6 }, r4: { x: -4.0, z: 9.6 },
  e1: { x: 14.4, z: -3.0 }, e2: { x: 14.4, z: 1.0 }, e3: { x: 14.4, z: 5.0 },
  l1: { x: 9.6, z: 9.4 }, l2: { x: 9.6, z: 12.6 },
};

/** 연결 (양방향) — 헬스장의 실제 충돌 상자로 "직선으로 걸어도 안 부딪히는지" 검사해서 만든 목록 (기구 배치를 바꾸면 다시 만들어야 함) */
export const EDGES = [
  ['w1', 'w2'], ['w1', 'w3'], ['w1', 'm1'], ['w2', 'w3'], ['w3', 'w4'], ['w4', 'w5'],
  ['w4', 'm4'], ['w4', 'm5'], ['w5', 'w6'], ['w5', 'm5'], ['w6', 'w7'], ['w7', 'w8'],
  ['w7', 'e1'], ['w8', 'e1'], ['w8', 'e2'], ['m1', 'm2'], ['m2', 'm3'], ['m2', 'm4'],
  ['m3', 'm4'], ['m3', 'm5'], ['m4', 'm5'], ['m5', 'c1'], ['m5', 'c3'], ['c1', 'c2'],
  ['c1', 'c4'], ['c1', 'r4'], ['c2', 'r4'], ['c3', 'c4'], ['c3', 'e2'], ['c4', 'e3'],
  ['c4', 'l1'], ['c4', 'l2'], ['r1', 'r2'], ['r2', 'r3'], ['r3', 'r4'], ['e1', 'e2'],
  ['e1', 'e3'], ['e2', 'e3'], ['l1', 'l2'],
];

/** 목적지 목록: { id, kind:'exercise'|'bag'|'sit'|'hang', node, approach:{x,z}, spot:{x,z,y,r}, action, equipId? } */
export function npcDestinations({ raw = false } = {}) {
  const out = [];
  for (const item of EQUIPMENT_LAYOUT) {
    const t = EQUIPMENT_TYPES[item.type];
    const ap = localToWorld(item, t.approach.x, t.approach.z);
    const sp = localToWorld(item, t.spot.x, t.spot.z);
    out.push({
      id: item.id, kind: 'exercise', approach: ap, spot: { x: sp.x, z: sp.z, y: t.spot.y, r: item.rotY + t.spot.r }, action: t.exercise,
    });
  }
  // 샌드백: 정면(+z 쪽 1m)에 서서 주먹·발차기
  for (const b of PUNCHING_BAGS) {
    const p = { x: b.x, z: b.z + 1.0 };
    out.push({ id: b.id, kind: 'bag', approach: p, spot: { ...p, y: 0, r: Math.PI }, action: 'idle' });
  }
  // 입구 쪽 휴식 벤치 (헬스장 쪽을 보고 앉음) — Gym._placeBench 와 같은 자리
  for (const [bx, id] of [[-11, 'rest-bench-1'], [-7.6, 'rest-bench-2']]) {
    for (let i = 0; i < 3; i++) {
      const x = bx + (i - 1) * (2.6 / 3);
      out.push({
        id: `${id}-seat${i}`, kind: 'sit', approach: { x, z: 12.45 }, spot: { x, z: 13.17, y: 0.48, r: Math.PI }, action: 'sit',
      });
    }
  }
  // 라운지에서 서서 수다
  out.push({ id: 'hang-1', kind: 'hang', approach: { x: 9.6, z: 9.4 }, spot: { x: 9.6, z: 9.4, y: 0, r: Math.PI / 2 }, action: 'idle' });
  out.push({ id: 'hang-2', kind: 'hang', approach: { x: 9.8, z: 12.4 }, spot: { x: 9.8, z: 12.4, y: 0, r: Math.PI * 0.75 }, action: 'idle' });
  for (const d of out) d.node = DEST_NODES[d.id] || null;
  return raw ? out : out.filter((d) => d.node);
}

/** 목적지 → 통로 점 (충돌 검사로 정함) */
export const DEST_NODES = {
  'bench-1': 'w1', 'bench-2': 'w2', 'bench-3': 'w3', 'dumbbell-1': 'm2', 'dumbbell-2': 'm2',
  'dumbbell-3': 'm3', 'treadmill-1': 'w7', 'treadmill-2': 'w7', 'treadmill-3': 'w8', 'treadmill-4': 'w8',
  'legpress-1': 'r2', 'legpress-2': 'r3', 'shoulder-1': 'r3', 'shoulder-2': 'r4', 'latpull-1': 'e1',
  'latpull-2': 'e2', 'latpull-3': 'e3', 'bag-1': 'c1', 'bag-2': 'c1', 'rest-bench-1-seat0': 'r2',
  'rest-bench-1-seat1': 'r2', 'rest-bench-1-seat2': 'r3', 'rest-bench-2-seat0': 'r3', 'rest-bench-2-seat1': 'r3', 'rest-bench-2-seat2': 'r3',
  'hang-1': 'l1', 'hang-2': 'l2',
};

/** 통로 점 사이 최단 경로 (노드 이름 배열) */
export function findPath(from, to) {
  if (from === to) return [from];
  const adj = new Map();
  for (const [a, b] of EDGES) {
    if (!adj.has(a)) adj.set(a, []);
    if (!adj.has(b)) adj.set(b, []);
    adj.get(a).push(b);
    adj.get(b).push(a);
  }
  const dist = new Map([[from, 0]]);
  const prev = new Map();
  const todo = new Set([from]);
  const len = (a, b) => Math.hypot(NODES[a].x - NODES[b].x, NODES[a].z - NODES[b].z);
  while (todo.size) {
    let cur = null;
    for (const n of todo) if (cur === null || dist.get(n) < dist.get(cur)) cur = n;
    todo.delete(cur);
    if (cur === to) break;
    for (const nb of adj.get(cur) || []) {
      const d = dist.get(cur) + len(cur, nb);
      if (!dist.has(nb) || d < dist.get(nb)) { dist.set(nb, d); prev.set(nb, cur); todo.add(nb); }
    }
  }
  if (!dist.has(to)) return null;
  const path = [to];
  while (path[0] !== from) path.unshift(prev.get(path[0]));
  return path;
}
