/**
 * 주소로 서울 식당인지 가른다 — 2026-10 가락시장 직접구매 시작. 사장님 기준: "서울 식당은 주소기준이야."
 * 서울 식당은 품목별 공급처 발주문자 대상에서 빠지고 "가락 살 것 목록"으로 간다.
 */
export function isSeoulAddress(address: string | null | undefined): boolean {
  return Boolean(address?.trim().startsWith('서울'))
}
