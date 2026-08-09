/**
 * 회원이 직접 추가할 수 있는 품목 고르기.
 *
 * db 를 건드리지 않는 순수 함수로 둔다. 규칙이 잘못되면 회원 발주 목록에 엉뚱한 품목이
 * 뜨거나 0 원 명세서가 나가므로, 그대로 시험할 수 있어야 한다.
 */

export interface CatalogProduct {
  id: string
  standard_name: string
  category: string | null
  default_unit: string
}

export interface AddableProduct extends CatalogProduct {
  /** 기본 단가. 없으면 null — 0 으로 두면 화면에 "0원" 으로 보인다 */
  price: number | null
  /** 단가가 없어 관리자 확인을 거쳐야 하는 품목 */
  needsApproval: boolean
}

/**
 * @param all        활성 품목 전체
 * @param mineIds    이미 내 목록에 있는 품목
 * @param pendingIds 이미 요청해 둔 품목
 * @param priceOf    품목별 기본 단가
 */
export function buildAddable(
  all: CatalogProduct[],
  mineIds: Set<string>,
  pendingIds: Set<string>,
  priceOf: Map<string, number>,
): AddableProduct[] {
  const out: AddableProduct[] = []
  for (const p of all) {
    if (mineIds.has(p.id)) continue
    if (pendingIds.has(p.id)) continue
    // 단가 0 은 "없음" 으로 본다. 그대로 발주되면 명세서가 0 원으로 나간다.
    const raw = priceOf.get(p.id)
    const price = raw !== undefined && raw > 0 ? raw : null
    out.push({ ...p, price, needsApproval: price === null })
  }
  return out
}

/** 관리자가 정해 준 기본 품목은 회원이 빼면 안 된다. 값이 없으면 안전한 쪽으로 본다. */
export function canMemberRemove(addedBy: string): boolean {
  return addedBy === 'member'
}
