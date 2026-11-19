// 운동기구 종류 정의 (서버/클라이언트 공용)
// minigame: 미니게임 모듈이 등록될 Phase. Phase 1 에서는 아직 어떤 미니게임도 없습니다.
// muscles: Phase 5 성장 시스템에서 사용할 근육 부위
export const EQUIPMENT_TYPES = {
  benchpress: { label: '벤치프레스', minigamePhase: 4, muscles: ['chest', 'arms'] },
  dumbbell: { label: '덤벨컬', minigamePhase: 4, muscles: ['arms'] },
  treadmill: { label: '러닝머신', minigamePhase: 4, muscles: ['bodyFat'] },
  legpress: { label: '레그프레스', minigamePhase: null, muscles: ['legs'] },
  shoulderpress: { label: '숄더프레스', minigamePhase: null, muscles: ['shoulders'] },
  latpulldown: { label: '랫풀다운', minigamePhase: null, muscles: ['back'] },
};
