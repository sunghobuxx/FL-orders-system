import { isGarakAddress } from '@/lib/region'

export interface CandidateLine {
  orderItemId: string
  restaurantName: string
  qty: number
  unit: string
}

/** 배정 후보는 서울·일산이 아닌 업체의 발주 줄만 쓴다. 서울·일산은 가락 목록으로 이미 따로 간다. */
export function isEligibleAddress(address: string | null | undefined): boolean {
  return !isGarakAddress(address)
}

/** 가락 매입 수량과 수량이 같은 줄을 먼저 보여 준다. 같은 수량끼리는 업체명순. */
export function sortCandidates(lines: CandidateLine[], purchaseQty: number): Array<CandidateLine & { exact: boolean }> {
  return lines
    .map(l => ({ ...l, exact: Number(l.qty) === Number(purchaseQty) }))
    .sort((a, b) => Number(b.exact) - Number(a.exact) || a.restaurantName.localeCompare(b.restaurantName, 'ko'))
}

/** 가락 수량과 고른 줄 수량이 다르면 경고 문구. 같으면 null. 저장은 막지 않는다. */
export function allocationWarning(purchaseQty: number, lineQty: number): string | null {
  if (Number(purchaseQty) === Number(lineQty)) return null
  return `가락 매입 ${purchaseQty}개와 고른 줄 ${lineQty}개가 다릅니다. 그래도 저장은 됩니다.`
}
