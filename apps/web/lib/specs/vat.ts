/**
 * 부가세 분리.
 *
 * **품목 마스터에 넣는 단가는 부가세가 포함된 금액이다.**
 * 그런데 예전 코드는 그 단가 위에 10% 를 또 얹었다(`qty * unitPrice * 0.1`).
 * 과세 품목이 전부 10% 씩 비싸게 청구됐다 — 2026-08-18 확인 시점에 164줄 270,614원.
 * (칡면사리 18,000 을 넣으면 19,800 으로 청구됐다)
 *
 * 그래서 얹지 않고 **입력한 금액 안에서 나눈다.**
 *   줄 총액 = 수량 × 입력단가        ← 사장님이 받으려는 금액 그대로
 *   공급가  = 총액 ÷ 1.1
 *   부가세  = 총액 − 공급가
 *
 * 저장은 `unit_price`(공급가 단가) + `vat_amount` 로 나눠 넣는다.
 * 명세서·정산서가 전부 `수량 × unit_price + vat_amount` 로 합계를 내기 때문에,
 * 이 둘을 더하면 총액이 정확히 나와야 한다. 반올림 오차는 부가세 쪽에서 흡수한다.
 */

export interface VatSplit {
  /** 저장할 공급가 단가 */
  unitPrice: number
  /** 저장할 부가세 */
  vat: number
  /** 수량 × 입력단가 — 실제 청구 금액 */
  gross: number
}

/**
 * @param taxable          과세 품목인지 (products.taxable_flag)
 * @param qty              수량
 * @param enteredUnitPrice 품목 마스터에 넣은 단가 (부가세 포함)
 */
export function splitVat(taxable: boolean, qty: number, enteredUnitPrice: number): VatSplit {
  const gross = Math.round(qty * enteredUnitPrice)
  if (!taxable) return { unitPrice: enteredUnitPrice, vat: 0, gross }

  const unitPrice = Math.round(enteredUnitPrice / 1.1)
  // 총액에서 공급가를 뺀 나머지를 부가세로 둔다. 그래야 수량×공급가 + 부가세 = 총액 이 된다.
  const vat = gross - Math.round(qty * unitPrice)
  return { unitPrice, vat, gross }
}
