// 운동기구 종류 정의 (서버/클라이언트 공용)
// minigame: 미니게임 모듈이 등록될 Phase. Phase 1 에서는 아직 어떤 미니게임도 없습니다.
// muscles: Phase 5 성장 시스템에서 사용할 근육 부위
// exercise: E 를 누르면 하는 동작 (CharacterModel 의 EXERCISES)
// spot: 운동 자세를 잡는 위치 (기구 로컬 좌표) — x, z, y(올라서는 높이), r(바라보는 방향, 기구 기준)
export const EQUIPMENT_TYPES = {
  benchpress: { label: '벤치프레스', minigamePhase: 4, muscles: ['chest', 'arms'], exercise: 'ex_bench', spot: { x: 0, z: 0.26, y: 0.5, r: 0 } },
  dumbbell: { label: '덤벨컬', minigamePhase: 4, muscles: ['arms'], exercise: 'ex_curl', spot: { x: 0, z: 0.75, y: 0, r: Math.PI } },
  treadmill: { label: '러닝머신', minigamePhase: 4, muscles: ['bodyFat'], exercise: 'ex_tread', spot: { x: 0, z: 0.15, y: 0.2, r: Math.PI } },
  legpress: { label: '레그프레스', minigamePhase: null, muscles: ['legs'], exercise: 'ex_legpress', spot: { x: 0, z: 0.62, y: 0.48, r: Math.PI } },
  shoulderpress: { label: '숄더프레스', minigamePhase: null, muscles: ['shoulders'], exercise: 'ex_shoulder', spot: { x: 0, z: 0.12, y: 0.55, r: 0 } },
  latpulldown: { label: '랫풀다운', minigamePhase: null, muscles: ['back'], exercise: 'ex_lat', spot: { x: 0, z: 0.32, y: 0.55, r: Math.PI } },
  seat: { label: '벤치', minigamePhase: null, muscles: [], exercise: 'sit', spot: { x: 0, z: 0, y: 0.5, r: 0 } },
  // 운동이 아닌 상호작용 (E 로 화면 열기)
  shop: { label: '치장 상점', minigamePhase: null, muscles: [], exercise: null, spot: { x: 0, z: 1.2, y: 0, r: 0 } },
  rankboard: { label: '오늘의 랭킹', minigamePhase: null, muscles: [], exercise: null, spot: { x: 0, z: 0, y: 0, r: 0 } },
};
