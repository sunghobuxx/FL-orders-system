/**
 * 품목 분류 — 대분류 9개 · 소분류 2단 (2026-09-17 사장님 확정).
 *
 * 전에는 화면마다 분류 목록을 복사해 두고 있었다(회원 발주·어드민 품목·어드민 발주·앱).
 * 목록이 갈라지면 **어느 화면에서는 품목이 통째로 안 보인다** — 회원 발주 화면은
 * 목록에 없는 분류를 걸러내기 때문이다. 그래서 한 곳에 모은다.
 *
 * **운영 규칙:** 대분류는 이 9개로 고정하고, 늘어나는 품목은 소분류로 받는다.
 * 기타식품에 비슷한 게 3개 이상 모이면 소분류를 새로 판다.
 */

export const PRODUCT_CATEGORIES = [
  { code: 'vegetable', label: '야채', emoji: '🥬' },
  { code: 'fruit', label: '과일', emoji: '🍎' },
  { code: 'livestock', label: '축산', emoji: '🥚' },
  { code: 'seafood', label: '수산', emoji: '🐟' },
  { code: 'grain', label: '곡류·면류', emoji: '🍜' },
  { code: 'seasoning', label: '양념·조미', emoji: '🧂' },
  { code: 'frozen', label: '냉동', emoji: '❄️' },
  { code: 'misc', label: '기타식품', emoji: '🧺' },
  { code: 'supply', label: '소모품', emoji: '🧻' },
] as const

export type CategoryCode = typeof PRODUCT_CATEGORIES[number]['code']

export const CATEGORY_ORDER: string[] = PRODUCT_CATEGORIES.map(c => c.code)
export const CATEGORY_LABELS: Record<string, string> =
  Object.fromEntries(PRODUCT_CATEGORIES.map(c => [c.code, c.label]))
export const CATEGORY_EMOJI: Record<string, string> =
  Object.fromEntries(PRODUCT_CATEGORIES.map(c => [c.code, c.emoji]))

/**
 * 옛 분류값을 새 대분류로 읽는다.
 *
 * DB 를 바꾸기 전에도 화면이 정상으로 돌아가야 해서 둔다. DB 를 바꾼 뒤에도
 * 남겨 둔다 — 모르는 값이 들어와도 품목이 화면에서 사라지지 않게 하는 안전망이다.
 */
const LEGACY: Record<string, string> = {
  meat: 'livestock',   // 육류 → 축산
  dairy: 'livestock',  // 유제품 → 축산(유제품 소분류)
  etc: 'misc',         // 기타 → 기타식품
}

export function normalizeCategory(code: string | null | undefined): string {
  if (!code) return 'misc'
  if (CATEGORY_LABELS[code]) return code
  return LEGACY[code] ?? 'misc'
}

export function categoryLabel(code: string | null | undefined): string {
  return CATEGORY_LABELS[normalizeCategory(code)] ?? '기타식품'
}

/** 소분류. 새 품목은 여기에 더해 받는다 (대분류는 고정). */
export const SUBCATEGORIES: Record<string, string[]> = {
  vegetable: ['엽채류', '근채류', '과채류', '고추류', '버섯류', '콩나물·나물', '파류', '향채', '두부류', '절임·가공채소'],
  fruit: ['과일'],
  livestock: ['난류', '육가공', '정육', '유제품'],
  seafood: ['해조류', '수산가공'],
  grain: ['쌀', '면류', '묵류', '분식'],
  seasoning: ['장류', '소스·식초', '가루·분말', '기름', '당류', '참깨'],
  frozen: ['냉동식품'],
  misc: ['음료·커피', '기타'],
  supply: ['위생장갑', '종이·포장', '청소·세척', '기타 소모품'],
}
