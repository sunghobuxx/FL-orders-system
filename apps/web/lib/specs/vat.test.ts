import { describe, it, expect } from 'vitest'
import { splitVat } from './vat'

describe('splitVat', () => {
  it('면세 품목은 단가를 그대로 두고 부가세가 없다', () => {
    const r = splitVat(false, 5, 3500)
    expect(r).toEqual({ unitPrice: 3500, vat: 0, gross: 17500 })
  })

  it('과세 품목은 입력 단가 안에서 나눈다 — 위에 얹지 않는다', () => {
    // 18,000 을 넣었으면 18,000 을 받는다. 예전에는 19,800 이 됐다.
    const r = splitVat(true, 1, 18000)
    expect(r.gross).toBe(18000)
    expect(r.unitPrice + r.vat).toBe(18000)
  })

  it('수량이 여럿이어도 수량 × 공급가 + 부가세 = 총액', () => {
    const r = splitVat(true, 4, 18000)
    expect(r.gross).toBe(72000)
    expect(4 * r.unitPrice + r.vat).toBe(72000)
  })

  it('반올림이 떨어지지 않아도 총액은 어긋나지 않는다', () => {
    for (const [qty, price] of [[3, 3700], [7, 9900], [2, 5500], [1, 74000]] as const) {
      const r = splitVat(true, qty, price)
      expect(qty * r.unitPrice + r.vat).toBe(r.gross)
    }
  })

  it('부가세는 총액의 약 1/11 이다', () => {
    const r = splitVat(true, 1, 11000)
    expect(r.unitPrice).toBe(10000)
    expect(r.vat).toBe(1000)
  })
})
