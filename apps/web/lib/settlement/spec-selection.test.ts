import { describe, it, expect } from 'vitest'
import { pickSpecs, type SpecRow } from './spec-selection'

const inRange: SpecRow[] = [
  { id: 's1', business_date: '2026-08-03', total_amount: 100 },
  { id: 's2', business_date: '2026-08-05', total_amount: 200 },
]

describe('pickSpecs', () => {
  it('기간 안의 명세서를 담는다', () => {
    const got = pickSpecs(inRange, [], new Set())
    expect(got.map(s => s.id)).toEqual(['s1', 's2'])
  })

  it('확정된 정산서에 이미 담긴 명세서는 뺀다 — 두 번 청구하면 안 된다', () => {
    const got = pickSpecs(inRange, [], new Set(['s1']))
    expect(got.map(s => s.id)).toEqual(['s2'])
  })

  it('기간 이전인데 어느 정산서에도 안 담긴 명세서를 이월해 담는다', () => {
    const orphan: SpecRow[] = [{ id: 'late', business_date: '2026-07-30', total_amount: 50 }]
    const got = pickSpecs(inRange, orphan, new Set())
    expect(got.map(s => s.id)).toEqual(['late', 's1', 's2'])
  })

  it('이월 대상이 확정 정산서에 이미 담겨 있으면 안 담는다', () => {
    const orphan: SpecRow[] = [{ id: 'late', business_date: '2026-07-30', total_amount: 50 }]
    const got = pickSpecs(inRange, orphan, new Set(['late']))
    expect(got.map(s => s.id)).toEqual(['s1', 's2'])
  })

  it('같은 명세서가 두 목록에 들어와도 한 번만 담는다', () => {
    const dup: SpecRow[] = [{ id: 's1', business_date: '2026-08-03', total_amount: 100 }]
    const got = pickSpecs(inRange, dup, new Set())
    expect(got.map(s => s.id)).toEqual(['s1', 's2'])
  })
})
