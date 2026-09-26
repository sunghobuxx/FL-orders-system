import { grossUnitPrice, splitVat } from '@/lib/specs/vat'
import { normalizeUnit } from '@/lib/units'

/**
 * 잠긴(price_overridden) 명세서 줄을 발주에 다시 맞출 때의 규칙.
 *
 * 예전에는 잠긴 줄의 **수량까지** 그대로 두었다. 업체별 고정단가 품목은 새 줄이 만들어질 때부터
 * 잠긴 채라서(sync.ts 의 orgOverrides), 회원이 발주 수량을 고쳐 다시 내도 명세서 수량이 첫 발주 값에
 * 멈췄다 — 아구찜 참 잘하는 집 중랑점 9/26 두절콩나물, 발주 4개 / 명세서 3개(2026-09-26).
 *
 * 잠금은 「단가를 손으로 지정했다」는 표시이지 「수량을 손으로 지정했다」는 뜻이 아니다.
 * 관리자가 수량을 손으로 고치는 경로(명세서 편집·발주 수정·배송앱)는 모두 order_items.qty 도 함께 바꾸므로,
 * 잠긴 줄도 **최신 발주 수량**을 따라가면 손으로 고친 수량은 그대로 지켜진다.
 *
 *  - 수량은 발주를 따르고, 단가는 잠긴 값을 유지한다. 과세 품목은 새 수량에 맞춰 부가세를 다시 나눈다.
 *  - 단위가 다르면 옛 줄을 그대로 둔다(단가가 단위별이라 수량만 바꾸면 금액이 틀어진다).
 *  - 발주 수량이 0 이하이거나 숫자가 아니면 옛 줄을 지킨다(줄을 0 으로 만들지 않는다).
 */

export interface KeptLine {
  qty: number
  unit: string | null
  unit_price: number
  vat_amount: number | null
}

export interface OrderedItem {
  id: string
  product_id: string
  qty: number
  unit: string
}

export interface KeptSpecLine {
  order_item_id: string
  product_id: string
  qty: number
  unit: string
  unit_price: number
  vat_amount: number
  price_overridden: true
}

export function keptSpecLine(kept: KeptLine, item: OrderedItem, taxable: boolean): KeptSpecLine {
  const keptQty = Number(kept.qty)
  const itemQty = Number(item.qty)
  // 「박스」와 box 는 같은 단위다(과거 줄엔 한글 표기가 남아 있다). 표기만 다르다고 수량을 못 따라가면 이번 사고가 조용히 재발한다.
  const sameUnit = kept.unit == null || normalizeUnit(kept.unit) === normalizeUnit(item.unit)
  const follows = sameUnit && Number.isFinite(itemQty) && itemQty > 0 && itemQty !== keptQty
  const unit = follows ? item.unit : (kept.unit ?? item.unit)

  if (!follows) {
    return {
      order_item_id: item.id,
      product_id: item.product_id,
      qty: keptQty,
      unit,
      unit_price: Number(kept.unit_price),
      vat_amount: Number(kept.vat_amount ?? 0),
      price_overridden: true,
    }
  }

  // 부가세 포함 총액 단가를 되살려 새 수량으로 다시 나눈다(vat.ts 와 같은 규칙).
  const gross = grossUnitPrice(Number(kept.unit_price), Number(kept.vat_amount ?? 0), keptQty)
  const split = splitVat(taxable, itemQty, gross)
  return {
    order_item_id: item.id,
    product_id: item.product_id,
    qty: itemQty,
    unit,
    unit_price: split.unitPrice,
    vat_amount: split.vat,
    price_overridden: true,
  }
}
