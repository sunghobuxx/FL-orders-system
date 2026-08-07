/**
 * 우리 품목마스터 ↔ 가락시장 중분류 이름 맞추기.
 *
 * 회원 화면(반입량 변화)과 어드민 화면(시세 추이)이 같은 표를 써야 숫자가 어긋나지 않는다.
 *
 * 2026-08-03 실측: 서울가락 하루 39,278건, 중분류 115종.
 * 품목마스터 활성 131개 중 54개가 붙고, 발주 금액 기준 76.5% 를 덮는다.
 * 계란·쌀·두부 같은 공산품은 도매시장 경매 품목이 아니라 처음부터 대상이 아니다.
 */

/** 우리 품목명(정규화) → 가락시장 중분류명 */
const SYNONYM: Record<string, string> = {
  // 콩나물·숙주 — 우리 쪽 이름이 제각각이라 전부 모아 준다. 발주 금액 최대 항목이다.
  두절콩나물: '콩나물', 매화일자콩나물: '콩나물', 일자: '콩나물', 곱슬이: '콩나물',
  콩나물10kg: '콩나물', 재우숙주: '숙주나물', 숙주: '숙주나물',
  // 손질 상태만 다른 것들
  깐마늘: '마늘', 다진마늘: '마늘', 간마늘: '마늘', 마늘소: '마늘',
  깐양파: '양파', 깐생강: '생강', 청오이: '오이',
  // 품종·별칭
  청양고추: '풋고추', 꽃상추: '상추', 적상추: '상추', 청상추: '상추',
  주키니호박: '호박', 애호박: '호박', 알배기: '배추', 얼갈이: '얼갈이배추',
  총각무: '알타리무', 어린잎: '새싹', 새싹채소: '새싹',
}

/**
 * 가공·조미 식품은 이름에 원물이 들어 있어도 원물 시세와 견줄 대상이 아니다.
 * "사과 2배식초 1.8l"(25,000원/ea) 이 부분일치로 가락 «사과» 에 붙어
 * 어드민 시세 화면에 과일 시세와 나란히 찍히고 있었다.
 */
const PROCESSED = /식초|간장|기름|육수|소스|드레싱|비빔장|주스|음료|김치|단무지|사리|통조림/

/** 괄호·용량 표기를 걷어내고 공백을 없앤다. "황소 팽이버섯 1kg" → "황소팽이버섯" */
export function normalizeName(name: string): string {
  return (name ?? '')
    .replace(/\([^)]*\)/g, '')
    .replace(/\d+(\.\d+)?\s*(kg|g|박스|box|ea|매|입|미|팩|pack)/gi, '')
    .replace(/\s+/g, '')
    .trim()
}

/**
 * 우리 품목명에 대응하는 가락시장 중분류명. 없으면 null.
 * @param marketNames 가락시장에 실제로 존재하는 중분류명 집합
 */
export function toMarketName(productName: string, marketNames: Set<string>): string | null {
  const n = normalizeName(productName)
  if (!n) return null
  if (PROCESSED.test(n)) return null
  // 어느 품목도 아닌 자리표시용 이름. 가락 «기타» 에 붙어 뜻 없는 줄이 생긴다.
  if (n.startsWith('기타')) return null

  const syn = SYNONYM[n.toLowerCase()] ?? SYNONYM[n]
  if (syn && marketNames.has(syn)) return syn

  const normalized = new Map<string, string>()
  for (const m of marketNames) normalized.set(normalizeName(m), m)

  const exact = normalized.get(n)
  if (exact) return exact

  // 부분일치는 두 글자 이상일 때만 본다. "무" 가 "열무" 에 붙는 사고를 막는다.
  for (const [key, orig] of normalized) {
    if (key.length >= 2 && n.length >= 2 && (key.includes(n) || n.includes(key))) return orig
  }
  return null
}
