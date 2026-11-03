/**
 * 가락시장에서 직접 사다 납품하는 지역인지 주소로 가른다 — 서울 + 일산(2026-10, 사장님 기준: 주소로 구분).
 * 해당 식당은 품목별 공급처 발주문자 대상에서 빠지고 "가락 살 것 목록"으로 간다.
 */
export function isGarakAddress(address: string | null | undefined): boolean {
  const a = address?.trim() ?? ''
  return a.startsWith('서울') || /고양시 일산(동|서)구/.test(a)
}

/**
 * 주소는 서울·일산이 아니지만, 사장님이 서울·일산과 같은 방식(가락 직접구매)으로
 * 다루길 원하는 업체를 위한 예외. organizations.garak_direct_override 로 켠다
 * (2026-11-01, 마이웨이·뽈마루 대구뽈찜 — 실제 주소는 파주지만 가락 목록으로 포함).
 */
export function isGarakRouted(address: string | null | undefined, override: boolean | null | undefined): boolean {
  return Boolean(override) || isGarakAddress(address)
}
