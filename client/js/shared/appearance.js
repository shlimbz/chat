// 캐릭터 외형 데이터 정의 + 검증
// Three.js 에 의존하지 않는 순수 모듈 → 서버도 같은 파일로 검증합니다.
// (클라이언트가 보낸 외형 값은 신뢰하지 않고 반드시 sanitizeAppearance 를 거칩니다.)

export const GENDERS = [
  { id: 'male', label: '남자' },
  { id: 'female', label: '여자' },
];

// 체형 슬라이더 (0~1) — 근육량 · 몸무게 · 키
export const BODY_SLIDERS = [
  { key: 'muscle', label: '근육량', min: '말랑', max: '근육질' },
  { key: 'weight', label: '몸무게', min: '슬림', max: '통통' },
  { key: 'height', label: '키', min: '작게', max: '크게' },
];

// 빠르게 고를 수 있는 체형 예시 (슬라이더 값 묶음)
export const BODY_PRESETS = [
  { id: 'normal', label: '보통', muscle: 0.3, weight: 0.35 },
  { id: 'slim', label: '슬림', muscle: 0.15, weight: 0.05 },
  { id: 'muscular', label: '근육질', muscle: 1, weight: 0.4 },
  { id: 'chubby', label: '통통', muscle: 0.2, weight: 1 },
];

export const SKIN_COLORS = ['#ffe9d6', '#ffe3cc', '#f6cba3', '#e2ad80', '#c68b5c', '#9b6643', '#6b4531', '#ffd2c2'];

export const HAIR_STYLES = [
  { id: 'short', label: '숏컷' },
  { id: 'buzz', label: '버즈컷' },
  { id: 'spiky', label: '스파이키' },
  { id: 'long', label: '롱헤어' },
  { id: 'ponytail', label: '포니테일' },
  { id: 'pigtails', label: '양갈래' },
  { id: 'bun', label: '똥머리' },
  { id: 'bowl', label: '바가지머리' },
  { id: 'heihachi', label: '헤이하치컷' },
  { id: 'mohawk', label: '모히칸' },
  { id: 'afro', label: '아프로' },
  { id: 'topknot', label: '상투' },
  { id: 'bald', label: '민머리' },
];

export const HAIR_COLORS = ['#221b17', '#5a3a22', '#9a6a3a', '#e3c16f', '#a8432b', '#b8b8b8', '#f08bb4', '#4a7fd6'];

export const FACE_SHAPES = [
  { id: 'round', label: '둥근형' },
  { id: 'square', label: '각진형' },
  { id: 'oval', label: '계란형' },
  { id: 'vline', label: 'V라인' },
];

// 메이플스토리처럼 얼굴 파츠를 독립적으로 골라 조합할 수 있습니다.
export const EYE_STYLES = [
  { id: 'round', label: '동그란 눈' },
  { id: 'sparkle', label: '반짝이는 눈' },
  { id: 'oval', label: '타원 눈' },
  { id: 'sleepy', label: '졸린 눈' },
  { id: 'sharp', label: '날카로운 눈' },
  { id: 'smile', label: '웃는 눈' },
  { id: 'dot', label: '콩알 눈' },
  { id: 'lash', label: '속눈썹 눈' },
  { id: 'wink', label: '윙크' },
];
export const EYE_COLORS = ['#2b2420', '#5a3a22', '#3d7dd8', '#3caea3', '#8e6bd8', '#e8505b'];
export const CHEEK_STYLES = [
  { id: 'blush', label: '볼터치' },
  { id: 'rosy', label: '진한 볼터치' },
  { id: 'freckles', label: '주근깨' },
  { id: 'none', label: '없음' },
];
export const BROW_STYLES = [
  { id: 'soft', label: '부드러운 눈썹' },
  { id: 'straight', label: '일자 눈썹' },
  { id: 'angled', label: '짙은 눈썹' },
  { id: 'none', label: '눈썹 없음' },
];
export const NOSE_STYLES = [
  { id: 'button', label: '작은 코' },
  { id: 'dot', label: '점 코' },
  { id: 'round', label: '동그란 코' },
  { id: 'none', label: '코 없음' },
];
export const MOUTH_STYLES = [
  { id: 'smile', label: '미소' },
  { id: 'small', label: '작은 입' },
  { id: 'open', label: '벌린 입' },
  { id: 'cat', label: '고양이 입' },
  { id: 'grin', label: '활짝 웃음' },
  { id: 'neutral', label: '무표정' },
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

// ── 악세사리 / 치장 아이템 (게임 재화로 구매, 샵에서 사고팔기) ──
// slot 하나에 아이템 하나만 착용. price = 구매가 (판매가는 economy.js 의 SELL_RATE)
export const ACC_SLOTS = ['hat', 'eyes', 'neck', 'ears', 'feet', 'print', 'back', 'trail', 'aura'];
export const ACC_SLOT_LABELS = {
  hat: '모자', eyes: '안경', neck: '목', ears: '귀', feet: '신발', print: '옷 디자인', back: '등', trail: '트레일', aura: '오라',
};
export const RARITY = {
  common: { label: '일반', color: '#8a96a3' },
  rare: { label: '레어', color: '#3d7dd8' },
  epic: { label: '에픽', color: '#8e6bd8' },
  legend: { label: '전설', color: '#e8a23a' },
};
export const ACCESSORIES = [
  // 모자
  { id: 'headband', slot: 'hat', label: '헤어밴드', price: 150, rarity: 'common' },
  { id: 'cap', slot: 'hat', label: '야구모자', price: 300, rarity: 'common' },
  { id: 'beanie', slot: 'hat', label: '비니', price: 300, rarity: 'common' },
  { id: 'party_hat', slot: 'hat', label: '고깔모자', price: 350, rarity: 'common' },
  { id: 'cat_ears', slot: 'hat', label: '고양이 귀', price: 500, rarity: 'rare' },
  { id: 'bunny_ears', slot: 'hat', label: '토끼 귀', price: 500, rarity: 'rare' },
  { id: 'headphones', slot: 'hat', label: '헤드폰', price: 700, rarity: 'rare' },
  { id: 'cowboy', slot: 'hat', label: '카우보이 모자', price: 900, rarity: 'epic' },
  { id: 'crown', slot: 'hat', label: '왕관', price: 2500, rarity: 'legend' },
  { id: 'halo', slot: 'hat', label: '천사 링', price: 3000, rarity: 'legend' },
  // 안경
  { id: 'round_glasses', slot: 'eyes', label: '동그란 안경', price: 200, rarity: 'common' },
  { id: 'sunglasses', slot: 'eyes', label: '선글라스', price: 250, rarity: 'common' },
  { id: 'heart_glasses', slot: 'eyes', label: '하트 안경', price: 600, rarity: 'rare' },
  { id: 'star_glasses', slot: 'eyes', label: '별 안경', price: 600, rarity: 'rare' },
  { id: 'ski_goggles', slot: 'eyes', label: '스키 고글', price: 900, rarity: 'epic' },
  // 목 / 귀
  { id: 'bowtie', slot: 'neck', label: '나비넥타이', price: 250, rarity: 'common' },
  { id: 'scarf', slot: 'neck', label: '목도리', price: 350, rarity: 'common' },
  { id: 'necklace', slot: 'neck', label: '목걸이', price: 400, rarity: 'common' },
  { id: 'gold_chain', slot: 'neck', label: '금 체인', price: 1000, rarity: 'epic' },
  { id: 'medal', slot: 'neck', label: '금메달', price: 1500, rarity: 'epic' },
  { id: 'earrings', slot: 'ears', label: '귀걸이', price: 350, rarity: 'common' },
  { id: 'gold_hoops', slot: 'ears', label: '링 귀걸이', price: 600, rarity: 'rare' },
  // 신발 (기본 신발 대신 착용)
  { id: 'neon_kicks', slot: 'feet', label: '네온 운동화', price: 700, rarity: 'rare' },
  { id: 'bunny_slippers', slot: 'feet', label: '토끼 슬리퍼', price: 700, rarity: 'rare' },
  { id: 'gold_kicks', slot: 'feet', label: '황금 운동화', price: 1500, rarity: 'epic' },
  { id: 'rocket_boots', slot: 'feet', label: '로켓 부츠', price: 2800, rarity: 'legend' },
  // 옷 디자인 (상의 색 위에 그려짐)
  { id: 'print_stripes', slot: 'print', label: '줄무늬', price: 300, rarity: 'common' },
  { id: 'print_star', slot: 'print', label: '별', price: 400, rarity: 'common' },
  { id: 'print_heart', slot: 'print', label: '하트', price: 400, rarity: 'common' },
  { id: 'print_bolt', slot: 'print', label: '번개', price: 600, rarity: 'rare' },
  { id: 'print_flame', slot: 'print', label: '불꽃', price: 800, rarity: 'rare' },
  { id: 'print_paw', slot: 'print', label: '발바닥', price: 600, rarity: 'rare' },
  // 등
  { id: 'backpack', slot: 'back', label: '책가방', price: 500, rarity: 'common' },
  { id: 'cape', slot: 'back', label: '히어로 망토', price: 1200, rarity: 'epic' },
  { id: 'jetpack', slot: 'back', label: '제트팩', price: 2500, rarity: 'legend' },
  { id: 'angel_wings', slot: 'back', label: '천사 날개', price: 3000, rarity: 'legend' },
  { id: 'devil_wings', slot: 'back', label: '악마 날개', price: 3000, rarity: 'legend' },
  // 트레일 (움직이면 뒤에 남는 빛)
  { id: 'trail_sparkle', slot: 'trail', label: '반짝이 트레일', price: 1200, rarity: 'rare' },
  { id: 'trail_bubble', slot: 'trail', label: '비눗방울 트레일', price: 1200, rarity: 'rare' },
  { id: 'trail_heart', slot: 'trail', label: '하트 트레일', price: 1600, rarity: 'epic' },
  { id: 'trail_fire', slot: 'trail', label: '불꽃 트레일', price: 2200, rarity: 'epic' },
  { id: 'trail_rainbow', slot: 'trail', label: '무지개 트레일', price: 3500, rarity: 'legend' },
  // 오라 (발밑에서 빛나는 고리)
  { id: 'aura_ice', slot: 'aura', label: '얼음 오라', price: 2500, rarity: 'epic' },
  { id: 'aura_love', slot: 'aura', label: '러블리 오라', price: 2500, rarity: 'epic' },
  { id: 'aura_gold', slot: 'aura', label: '황금 오라', price: 4000, rarity: 'legend' },
];
export const findAccessory = (id) => ACCESSORIES.find((a) => a.id === id) || null;

export const DEFAULT_APPEARANCE = Object.freeze({
  gender: 'male',
  muscle: 0.3,
  weight: 0.35,
  height: 0.5,
  skin: SKIN_COLORS[2],
  hair: 'short',
  hairColor: HAIR_COLORS[0],
  face: 'round',
  eyes: 'round',
  eyeColor: '#2b2420',
  cheeks: 'blush',
  brows: 'soft',
  nose: 'button',
  mouth: 'smile',
  outfit: 'tshirt_shorts',
  topColor: CLOTH_COLORS[3],
  bottomColor: CLOTH_COLORS[1],
  shoes: 'sneakers',
  shoeColor: SHOE_COLORS[0],
  acc: Object.freeze({}),
});

const ids = (list) => list.map((x) => x.id);

// 목록에서 고르는 필드 (UI도 이 정의를 그대로 사용)
export const APPEARANCE_FIELDS = {
  gender: ids(GENDERS),
  skin: SKIN_COLORS,
  hair: ids(HAIR_STYLES),
  hairColor: HAIR_COLORS,
  face: ids(FACE_SHAPES),
  eyes: ids(EYE_STYLES),
  eyeColor: EYE_COLORS,
  cheeks: ids(CHEEK_STYLES),
  brows: ids(BROW_STYLES),
  nose: ids(NOSE_STYLES),
  mouth: ids(MOUTH_STYLES),
  outfit: ids(OUTFITS),
  topColor: CLOTH_COLORS,
  bottomColor: CLOTH_COLORS,
  shoes: ids(SHOES),
  shoeColor: SHOE_COLORS,
};
export const SLIDER_FIELDS = BODY_SLIDERS.map((s) => s.key);

// 예전 버전(체형 4종) 데이터 호환
const LEGACY_BODY = {
  male: { gender: 'male', muscle: 0.3, weight: 0.35, height: 0.5 },
  female: { gender: 'female', muscle: 0.2, weight: 0.3, height: 0.35 },
  slim: { gender: 'male', muscle: 0.15, weight: 0.05, height: 0.7 },
  stocky: { gender: 'male', muscle: 0.75, weight: 0.65, height: 0.3 },
};

const clamp01 = (n) => Math.min(1, Math.max(0, n));

/**
 * 허용되지 않은 값은 기본값으로 대체한 새 객체를 반환
 * @param {object} input
 * @param {{ownedItems?: string[]|null}} opts 보유한 악세사리 id (빈 배열이면 악세사리 모두 제거, null 이면 확인 안 함)
 */
export function sanitizeAppearance(input, { ownedItems = [] } = {}) {
  // ownedItems === null → 보유 여부는 확인하지 않음 (DB 에서 읽을 때·외형 편집 화면. 서버가 접속 시 다시 확인)
  const src = input && typeof input === 'object' ? input : {};
  const legacy = !src.gender && typeof src.body === 'string' ? LEGACY_BODY[src.body] : null;
  const out = {};
  for (const [key, allowed] of Object.entries(APPEARANCE_FIELDS)) {
    const raw = legacy && key === 'gender' ? legacy.gender : src[key];
    const v = typeof raw === 'string' ? raw.toLowerCase() : null;
    const match = allowed.find((a) => a.toLowerCase() === v);
    out[key] = match || DEFAULT_APPEARANCE[key];
  }
  for (const key of SLIDER_FIELDS) {
    const raw = legacy && src[key] === undefined ? legacy[key] : src[key];
    const n = Number(raw);
    out[key] = Number.isFinite(n) && raw !== null && raw !== '' ? Math.round(clamp01(n) * 20) / 20 : DEFAULT_APPEARANCE[key];
  }
  // 악세사리: 보유한 것만, 슬롯당 하나
  out.acc = {};
  const acc = src.acc && typeof src.acc === 'object' ? src.acc : {};
  for (const slot of ACC_SLOTS) {
    const item = findAccessory(acc[slot]);
    if (item && item.slot === slot && (ownedItems === null || ownedItems.includes(item.id))) out.acc[slot] = item.id;
  }
  return out;
}

export function randomAppearance(rand = Math.random) {
  const out = {};
  for (const [key, allowed] of Object.entries(APPEARANCE_FIELDS)) {
    out[key] = allowed[Math.floor(rand() * allowed.length)];
  }
  for (const key of SLIDER_FIELDS) out[key] = Math.round(rand() * 20) / 20;
  out.acc = {};
  return out;
}

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
  chest: 0, shoulders: 0, arms: 0, back: 0, legs: 0, bodyFat: 0,
});

export function sanitizeBodyStats(input) {
  const src = input && typeof input === 'object' ? input : {};
  const out = {};
  for (const key of Object.keys(DEFAULT_BODY_STATS)) {
    const n = Number(src[key]);
    out[key] = Number.isFinite(n) ? clamp01(n) : DEFAULT_BODY_STATS[key];
  }
  return out;
}
