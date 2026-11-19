// 캐릭터 외형 데이터 정의 + 검증
// Three.js에 의존하지 않는 순수 모듈 → Phase 2에서 서버도 같은 파일로 검증합니다.
// (클라이언트가 보낸 외형 값은 신뢰하지 않고 반드시 sanitizeAppearance 를 거칩니다.)

export const BODY_PRESETS = [
  { id: 'male', label: '남성형', shoulder: 1.0, hip: 0.92, height: 1.0, limb: 1.0, bust: false },
  { id: 'female', label: '여성형', shoulder: 0.86, hip: 1.0, height: 0.95, limb: 0.9, bust: true },
  { id: 'slim', label: '슬림형', shoulder: 0.9, hip: 0.86, height: 1.04, limb: 0.85, bust: false },
  { id: 'stocky', label: '다부진형', shoulder: 1.12, hip: 1.02, height: 0.93, limb: 1.15, bust: false },
];

export const SKIN_COLORS = ['#ffe3cc', '#f6cba3', '#e2ad80', '#c68b5c', '#9b6643', '#6b4531'];

export const HAIR_STYLES = [
  { id: 'short', label: '숏컷' },
  { id: 'buzz', label: '버즈컷' },
  { id: 'spiky', label: '스파이키' },
  { id: 'long', label: '롱헤어' },
  { id: 'ponytail', label: '포니테일' },
  { id: 'bun', label: '똥머리' },
  { id: 'bald', label: '민머리' },
];

export const HAIR_COLORS = ['#221b17', '#5a3a22', '#9a6a3a', '#e3c16f', '#a8432b', '#b8b8b8', '#f08bb4', '#4a7fd6'];

export const FACE_SHAPES = [
  { id: 'round', label: '둥근형' },
  { id: 'square', label: '각진형' },
  { id: 'oval', label: '계란형' },
  { id: 'vline', label: 'V라인' },
];

export const OUTFITS = [
  { id: 'tshirt_shorts', label: '티셔츠 + 반바지', longSleeve: false, sleeveless: false, longPants: false, hood: false },
  { id: 'tank_shorts', label: '나시 + 반바지', longSleeve: false, sleeveless: true, longPants: false, hood: false },
  { id: 'hoodie_joggers', label: '후드 + 조거', longSleeve: true, sleeveless: false, longPants: true, hood: true },
  { id: 'tracksuit', label: '트레이닝복', longSleeve: true, sleeveless: false, longPants: true, hood: false },
];

export const CLOTH_COLORS = ['#f4f4f4', '#2b2d33', '#e8505b', '#f9a03f', '#f6d55c', '#3caea3', '#3d7dd8', '#8e6bd8', '#f08bb4'];

export const SHOES = [
  { id: 'sneakers', label: '운동화' },
  { id: 'hightop', label: '하이탑' },
  { id: 'slides', label: '슬리퍼' },
];

export const SHOE_COLORS = ['#ffffff', '#2b2d33', '#e8505b', '#3d7dd8', '#3caea3', '#f6d55c'];

export const DEFAULT_APPEARANCE = Object.freeze({
  body: 'male',
  skin: SKIN_COLORS[1],
  hair: 'short',
  hairColor: HAIR_COLORS[0],
  face: 'round',
  outfit: 'tshirt_shorts',
  topColor: CLOTH_COLORS[3],
  bottomColor: CLOTH_COLORS[1],
  shoes: 'sneakers',
  shoeColor: SHOE_COLORS[0],
});

const ids = (list) => list.map((x) => x.id);

// 필드별 허용 값 목록 (UI도 이 정의를 그대로 사용)
export const APPEARANCE_FIELDS = {
  body: ids(BODY_PRESETS),
  skin: SKIN_COLORS,
  hair: ids(HAIR_STYLES),
  hairColor: HAIR_COLORS,
  face: ids(FACE_SHAPES),
  outfit: ids(OUTFITS),
  topColor: CLOTH_COLORS,
  bottomColor: CLOTH_COLORS,
  shoes: ids(SHOES),
  shoeColor: SHOE_COLORS,
};

/** 허용 목록에 없는 값은 기본값으로 대체한 새 객체를 반환 */
export function sanitizeAppearance(input) {
  const src = input && typeof input === 'object' ? input : {};
  const out = {};
  for (const [key, allowed] of Object.entries(APPEARANCE_FIELDS)) {
    const v = typeof src[key] === 'string' ? src[key].toLowerCase() : null;
    const match = allowed.find((a) => a.toLowerCase() === v);
    out[key] = match || DEFAULT_APPEARANCE[key];
  }
  return out;
}

export function randomAppearance(rand = Math.random) {
  const out = {};
  for (const [key, allowed] of Object.entries(APPEARANCE_FIELDS)) {
    out[key] = allowed[Math.floor(rand() * allowed.length)];
  }
  return out;
}

export const findBody = (id) => BODY_PRESETS.find((p) => p.id === id) || BODY_PRESETS[0];
export const findOutfit = (id) => OUTFITS.find((o) => o.id === id) || OUTFITS[0];

// ── 닉네임 ─────────────────────────────────────────────
export const NICKNAME_MIN = 2;
export const NICKNAME_MAX = 12;
const NICKNAME_RE = /^[가-힣a-zA-Z0-9_]+$/;

export function validateNickname(raw) {
  const value = typeof raw === 'string' ? raw.trim() : '';
  if (value.length < NICKNAME_MIN) return { ok: false, value, error: `닉네임은 ${NICKNAME_MIN}자 이상이어야 합니다.` };
  if (value.length > NICKNAME_MAX) return { ok: false, value, error: `닉네임은 ${NICKNAME_MAX}자 이하여야 합니다.` };
  if (!NICKNAME_RE.test(value)) return { ok: false, value, error: '한글, 영문, 숫자, 밑줄(_)만 사용할 수 있습니다.' };
  return { ok: true, value, error: null };
}

// ── 성장 수치 (Phase 5에서 서버가 계산해 내려줄 값의 형태) ──
export const DEFAULT_BODY_STATS = Object.freeze({
  chest: 0, shoulders: 0, arms: 0, back: 0, legs: 0, bodyFat: 0.35,
});

export function sanitizeBodyStats(input) {
  const src = input && typeof input === 'object' ? input : {};
  const out = {};
  for (const key of Object.keys(DEFAULT_BODY_STATS)) {
    const n = Number(src[key]);
    out[key] = Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : DEFAULT_BODY_STATS[key];
  }
  return out;
}
