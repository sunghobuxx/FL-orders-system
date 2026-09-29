import { describe, expect, it } from 'vitest'
import { aggregateMonthlyTax, monthRange, previousMonthKst } from './tax-invoice-month'

describe('monthRange', () => {
  it('★ YYYY-MM 을 받아 그 달의 첫날·마지막날을 낸다', () => {
    expect(monthRange('2026-09')).toEqual({ start: '2026-09-01', end: '2026-09-30' })
    expect(monthRange('2026-02')).toEqual({ start: '2026-02-01', end: '2026-02-28' })
  })

  it('YYYY-MM-01 형식도 받는다', () => {
    expect(monthRange('2026-09-01')).toEqual({ start: '2026-09-01', end: '2026-09-30' })
  })

  it('윤년 2월도 맞게 낸다', () => {
    expect(monthRange('2028-02')).toEqual({ start: '2028-02-01', end: '2028-02-29' })
  })

  it('형식이 아니면 거절한다', () => {
    expect(() => monthRange('2026/09')).toThrow()
    expect(() => monthRange('09-2026')).toThrow()
  })

  it('월이 1~12 밖이면 거절한다', () => {
    expect(() => monthRange('2026-13')).toThrow()
    expect(() => monthRange('2026-00')).toThrow()
  })
})

describe('previousMonthKst', () => {
  it('★ KST 기준 지난달 1일을 낸다(세금계산서는 지난달분을 이번달 10일까지 내는 게 실무)', () => {
    // now 는 테스트에서 주입 — 실제 함수는 인자 없이 Date.now() 를 쓰되, 여기서는 주입 가능한 형태로 검증
    expect(previousMonthKst(new Date('2026-09-15T00:00:00Z'))).toBe('2026-08-01')
  })

  it('1월이면 작년 12월로 넘어간다', () => {
    expect(previousMonthKst(new Date('2026-01-05T00:00:00Z'))).toBe('2025-12-01')
  })
})

describe('aggregateMonthlyTax', () => {
  it('★ total_amount·vat_amount 합으로 공급가·세액·합계를 낸다', () => {
    const result = aggregateMonthlyTax([
      { total_amount: 55000, vat_amount: 5000 },
      { total_amount: 33000, vat_amount: 3000 },
      { total_amount: 10000, vat_amount: 0 }, // 면세 품목만 있던 날
    ])
    expect(result).toEqual({ totalAmount: 98000, taxTotal: 8000, supplyCostTotal: 90000 })
  })

  it('빈 배열이면 전부 0', () => {
    expect(aggregateMonthlyTax([])).toEqual({ totalAmount: 0, taxTotal: 0, supplyCostTotal: 0 })
  })

  it('vat_amount 가 null 이어도(면세만 있던 날) 0 으로 본다', () => {
    const result = aggregateMonthlyTax([{ total_amount: 20000, vat_amount: null }])
    expect(result).toEqual({ totalAmount: 20000, taxTotal: 0, supplyCostTotal: 20000 })
  })

  it('문자열로 온 금액도(postgres numeric 이 JS 로 문자열로 올 수 있다) 숫자로 합친다', () => {
    const result = aggregateMonthlyTax([{ total_amount: '55000', vat_amount: '5000' }])
    expect(result).toEqual({ totalAmount: 55000, taxTotal: 5000, supplyCostTotal: 50000 })
  })
})
