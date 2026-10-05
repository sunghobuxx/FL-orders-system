import { describe, expect, it } from 'vitest'
import { splitTaxByTaxability } from './tax-invoice-split'

describe('splitTaxByTaxability', () => {
  it('과세와 면세가 섞이면 두 장으로 나눈다', () => {
    const groups = splitTaxByTaxability([
      { amount: 50000, vat: 5000, taxable: true },
      { amount: 1000000, vat: 0, taxable: false },
    ])
    expect(groups).toEqual([
      { taxType: '과세', supplyCostTotal: 50000, taxTotal: 5000 },
      { taxType: '면세', supplyCostTotal: 1000000, taxTotal: 0 },
    ])
  })

  it('면세만 있으면 면세 한 장', () => {
    expect(splitTaxByTaxability([{ amount: 300000, vat: 0, taxable: false }]))
      .toEqual([{ taxType: '면세', supplyCostTotal: 300000, taxTotal: 0 }])
  })

  it('과세만 있으면 과세 한 장', () => {
    expect(splitTaxByTaxability([{ amount: 100000, vat: 10000, taxable: true }]))
      .toEqual([{ taxType: '과세', supplyCostTotal: 100000, taxTotal: 10000 }])
  })

  it('줄이 없으면 아무것도 만들지 않는다', () => {
    expect(splitTaxByTaxability([])).toEqual([])
  })
})
