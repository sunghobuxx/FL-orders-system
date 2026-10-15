import { describe, it, expect } from 'vitest'
import { periodRangeFor, isPeriodEnd } from './generate'

/**
 * 반월정산(semimonthly) — 매달 1~15일, 16일~말일. 인계점이 2026-10-15 처음 썼다.
 */
describe('periodRangeFor — semimonthly', () => {
  it('1~15일 사이는 1일~15일 구간', () => {
    expect(periodRangeFor('semimonthly', '2026-10-04')).toEqual({ start: '2026-10-01', end: '2026-10-15' })
    expect(periodRangeFor('semimonthly', '2026-10-15')).toEqual({ start: '2026-10-01', end: '2026-10-15' })
  })

  it('16일~말일 사이는 16일~그 달 마지막날 구간', () => {
    expect(periodRangeFor('semimonthly', '2026-10-16')).toEqual({ start: '2026-10-16', end: '2026-10-31' })
    expect(periodRangeFor('semimonthly', '2026-10-31')).toEqual({ start: '2026-10-16', end: '2026-10-31' })
  })

  it('2월처럼 말일이 다른 달도 정확히 구한다', () => {
    expect(periodRangeFor('semimonthly', '2026-02-20')).toEqual({ start: '2026-02-16', end: '2026-02-28' })
  })
})

describe('isPeriodEnd — semimonthly', () => {
  it('15일과 말일만 기간의 끝이다', () => {
    expect(isPeriodEnd('semimonthly', '2026-10-15')).toBe(true)
    expect(isPeriodEnd('semimonthly', '2026-10-31')).toBe(true)
    expect(isPeriodEnd('semimonthly', '2026-10-14')).toBe(false)
    expect(isPeriodEnd('semimonthly', '2026-10-20')).toBe(false)
  })
})
