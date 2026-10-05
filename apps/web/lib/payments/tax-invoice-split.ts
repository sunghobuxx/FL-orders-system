/**
 * 과세·면세 품목을 나눠 계산서 금액을 만든다. 팝빌은 과세 계산서의 세액을 공급가의 10%(±1,000원)로만
 * 받으므로, 면세 품목 공급가가 섞이면 한 장으로는 거절된다. 그래서 두 장으로 나눈다.
 */
export interface TaxLine {
  amount: number
  vat: number
  taxable: boolean
}

export interface TaxGroup {
  taxType: '과세' | '면세'
  supplyCostTotal: number
  taxTotal: number
}

export function splitTaxByTaxability(lines: TaxLine[]): TaxGroup[] {
  let supplyTaxable = 0
  let taxTaxable = 0
  let supplyExempt = 0
  for (const l of lines) {
    if (l.taxable) {
      supplyTaxable += Number(l.amount)
      taxTaxable += Number(l.vat)
    } else {
      supplyExempt += Number(l.amount)
    }
  }
  const groups: TaxGroup[] = []
  if (supplyTaxable > 0 || taxTaxable > 0) {
    groups.push({ taxType: '과세', supplyCostTotal: Math.round(supplyTaxable), taxTotal: Math.round(taxTaxable) })
  }
  if (supplyExempt > 0) {
    groups.push({ taxType: '면세', supplyCostTotal: Math.round(supplyExempt), taxTotal: 0 })
  }
  return groups
}
