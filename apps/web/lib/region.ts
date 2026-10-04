/**
 * 가락시장에서 직접 사다 납품하는 지역인지 주소로 가른다 — 서울 + 일산(2026-10, 사장님 기준: 주소로 구분).
 * 해당 식당은 품목별 공급처 발주문자 대상에서 빠지고 "가락 살 것 목록"으로 간다.
 */
export function isGarakAddress(address: string | null | undefined): boolean {
  const a = address?.trim() ?? ''
  return a.startsWith('서울') || /고양시 일산(동|서)구/.test(a)
}
