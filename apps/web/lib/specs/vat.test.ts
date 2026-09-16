import { describe, it, expect } from 'vitest'
import { grossUnitPrice, splitVat } from './vat'

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

describe('grossUnitPrice — 저장된 줄에서 「사장님이 넣은 단가」를 되살린다', () => {
  it('과세 줄은 공급가 + 부가세를 합쳐 되돌린다', () => {
    // 오뎅 4개 8,000원 → 저장은 7,273 + 부가세 2,908
    const s = splitVat(true, 4, 8000)
    expect(s.unitPrice).toBe(7273)
    expect(grossUnitPrice(s.unitPrice, s.vat, 4)).toBe(8000)
  })

  it('면세 줄은 저장값이 곧 입력값이다', () => {
    expect(grossUnitPrice(13500, 0, 10)).toBe(13500)
  })

  it('되살린 값을 다시 나누면 같은 값이 나온다 — 저장할 때마다 깎이면 안 된다', () => {
    let price = 8000
    for (let i = 0; i < 5; i++) {
      const s = splitVat(true, 4, price)
      price = grossUnitPrice(s.unitPrice, s.vat, 4)
    }
    expect(price).toBe(8000)
  })

  it('수량이 0이어도 터지지 않는다', () => {
    expect(grossUnitPrice(7273, 0, 0)).toBe(7273)
  })
})
