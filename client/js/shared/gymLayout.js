// 헬스장 기구 배치 (서버/클라이언트 공용)
// - 클라이언트: 이 목록대로 기구를 배치
// - 서버: 플레이어가 "정말 기구 자리에서 운동 중인지", "샌드백 앞에서 쳤는지" 검증 (재화 지급용)
import { EQUIPMENT_TYPES } from './equipmentTypes.js';

export const EQUIPMENT_LAYOUT = [
  // 벤치프레스 / 프리웨이트 존
  { id: 'bench-1', type: 'benchpress', x: -16, z: -10, rotY: 0 },
  { id: 'bench-2', type: 'benchpress', x: -12, z: -10, rotY: 0 },
  { id: 'bench-3', type: 'benchpress', x: -8, z: -10, rotY: 0 },
  { id: 'dumbbell-1', type: 'dumbbell', x: -15, z: -3, rotY: 0 },
  { id: 'dumbbell-2', type: 'dumbbell', x: -11, z: -3, rotY: 0 },
  { id: 'dumbbell-3', type: 'dumbbell', x: -7, z: -3, rotY: 0 },
  // 유산소 존
  { id: 'treadmill-1', type: 'treadmill', x: 9.4, z: -10.5, rotY: 0 },
  { id: 'treadmill-2', type: 'treadmill', x: 11.7, z: -10.5, rotY: 0 },
  { id: 'treadmill-3', type: 'treadmill', x: 14, z: -10.5, rotY: 0 },
  { id: 'treadmill-4', type: 'treadmill', x: 16.3, z: -10.5, rotY: 0 },
  // 머신 존
  { id: 'legpress-1', type: 'legpress', x: -16, z: 6, rotY: 0 },
  { id: 'legpress-2', type: 'legpress', x: -12, z: 6, rotY: 0 },
  { id: 'shoulder-1', type: 'shoulderpress', x: -8, z: 6, rotY: 0 },
  { id: 'shoulder-2', type: 'shoulderpress', x: -4, z: 6, rotY: 0 },
  // 동쪽 벽면 랫풀다운 존
  { id: 'latpull-1', type: 'latpulldown', x: 17, z: -3, rotY: -Math.PI / 2 },
  { id: 'latpull-2', type: 'latpulldown', x: 17, z: 1, rotY: -Math.PI / 2 },
  { id: 'latpull-3', type: 'latpulldown', x: 17, z: 5, rotY: -Math.PI / 2 },
];

/** 샌드백 위치 */
export const PUNCHING_BAGS = [
  { id: 'bag-1', x: -1.8, z: 3.1 },
  { id: 'bag-2', x: 2.3, z: 3.1 },
];

/** 기구 로컬 좌표 → 월드 좌표 (Gym 의 배치 회전과 같은 계산) */
export function localToWorld(item, lx, lz) {
  const c = Math.cos(item.rotY);
  const s = Math.sin(item.rotY);
  return { x: item.x + lx * c + lz * s, z: item.z - lx * s + lz * c };
}

/** 운동 자리 목록: [{ id, type, exercise, x, z }] */
export function exerciseSpots() {
  return EQUIPMENT_LAYOUT.map((item) => {
    const t = EQUIPMENT_TYPES[item.type];
    const p = localToWorld(item, t.spot.x, t.spot.z);
    return { id: item.id, type: item.type, exercise: t.exercise, x: p.x, z: p.z };
  });
}
