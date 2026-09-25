import { describe, expect, it } from 'vitest'
import { MATCH_RULE_VERSION, decideMatch, type MatchInput, type OpenReceivable } from './match'

const R1 = 'rest-1'
const R2 = 'rest-2'
let seq = 0
const rv = (restaurantId: string, balance: number, dueDate: string): OpenReceivable => ({
  id: `rv-${++seq}`, restaurantId, balance, dueDate, createdAt: `${dueDate}T00:00:00Z`,
})

const base = (over: Partial<MatchInput> = {}): MatchInput => ({
  direction: 'in',
  amount: 100_000,
  depositorNorm: '홍길동',
  aliases: [{ restaurantId: R1, aliasNorm: '홍길동' }],
  restaurantNames: [{ restaurantId: R1, nameNorm: '맛승' }],
  receivables: [rv(R1, 100_000, '2026-09-10')],
  ...over,
})

describe('decideMatch — 자동확정(AUTO_MATCH)', () => {
  it('별칭이 한 업체를 가리키고 입금액이 미수금 합계와 같으면 AUTO_MATCH', () => {
    const d = decideMatch(base({ amount: 150_000, receivables: [rv(R1, 100_000, '2026-09-10'), rv(R1, 50_000, '2026-09-17')] }))
    expect(d).toMatchObject({ verdict: 'AUTO_MATCH', restaurantId: R1, ruleVersion: MATCH_RULE_VERSION })
    expect(d.reasons).toEqual(['alias_unique', 'exact_total'])
  })

  it('부분입금(합계보다 작음)도 AUTO_MATCH — 모자란 금액은 미수금으로 남는다', () => {
    const d = decideMatch(base({ amount: 70_000, receivables: [rv(R1, 100_000, '2026-09-10'), rv(R1, 50_000, '2026-09-17')] }))
    expect(d).toMatchObject({ verdict: 'AUTO_MATCH', restaurantId: R1 })
    expect(d.reasons).toEqual(['alias_unique', 'partial'])
  })

  it('가장 오래된 미수금 잔액보다 작은 아주 적은 금액도 부분입금으로 AUTO_MATCH', () => {
    const d = decideMatch(base({ amount: 1, receivables: [rv(R1, 100_000, '2026-09-10')] }))
    expect(d.verdict).toBe('AUTO_MATCH')
    expect(d.reasons).toEqual(['alias_unique', 'partial'])
  })
})

describe('decideMatch — 사람이 봐야 하는 경우(REVIEW)', () => {
  it('초과입금은 자동확정하지 않는다(붙일 곳이 없다)', () => {
    const d = decideMatch(base({ amount: 100_001 }))
    expect(d).toMatchObject({ verdict: 'REVIEW', restaurantId: R1 })
    expect(d.reasons).toContain('overpay')
  })

  it('다른 업체의 미수금은 합계에 넣지 않는다 — 그 업체 미수금보다 많으면 다른 업체가 아무리 많아도 초과입금', () => {
    const d = decideMatch(base({ amount: 150_000, receivables: [rv(R1, 100_000, '2026-09-10'), rv(R2, 999_999, '2026-09-01')] }))
    expect(d).toMatchObject({ verdict: 'REVIEW', restaurantId: R1 })
    expect(d.reasons).toContain('overpay')
  })

  it('별칭은 맞는데 미수금이 없으면 REVIEW', () => {
    const d = decideMatch(base({ receivables: [] }))
    expect(d).toMatchObject({ verdict: 'REVIEW', restaurantId: R1 })
    expect(d.reasons).toContain('no_receivable')
  })

  it('같은 별칭이 두 업체에 등록돼 있으면 금액이 맞아도 REVIEW, 업체는 정하지 않는다', () => {
    const d = decideMatch(base({
      aliases: [{ restaurantId: R1, aliasNorm: '홍길동' }, { restaurantId: R2, aliasNorm: '홍길동' }],
      receivables: [rv(R1, 100_000, '2026-09-10'), rv(R2, 100_000, '2026-09-10')],
    }))
    expect(d).toMatchObject({ verdict: 'REVIEW', restaurantId: null })
    expect(d.reasons).toContain('ambiguous_alias')
    expect(d.candidates.map(c => c.restaurantId).sort()).toEqual([R1, R2])
  })

  it('별칭이 한 업체를 가리키는데 입금자명이 다른 업체의 업체명과도 같으면 REVIEW', () => {
    const d = decideMatch(base({ restaurantNames: [{ restaurantId: R2, nameNorm: '홍길동' }] }))
    expect(d.verdict).toBe('REVIEW')
    expect(d.reasons).toContain('alias_name_conflict')
  })

  it('업체명만 같고 별칭이 없으면 후보로만 제안하고 자동확정하지 않는다', () => {
    const d = decideMatch(base({ depositorNorm: '맛승', aliases: [], amount: 100_000 }))
    expect(d).toMatchObject({ verdict: 'REVIEW', restaurantId: R1 })
    expect(d.reasons).toEqual(['name_only_no_alias'])
    expect(d.candidates).toEqual([{ restaurantId: R1, reason: 'name' }])
  })

  it('업체명이 두 업체와 같으면 업체를 정하지 않는다', () => {
    const d = decideMatch(base({
      depositorNorm: '맛승', aliases: [],
      restaurantNames: [{ restaurantId: R1, nameNorm: '맛승' }, { restaurantId: R2, nameNorm: '맛승' }],
    }))
    expect(d).toMatchObject({ verdict: 'REVIEW', restaurantId: null })
  })
})

describe('decideMatch — 매칭 대상이 아닌 경우(UNMATCHED)', () => {
  it('출금·취소(direction out)는 일반 입금 매칭에서 제외한다', () => {
    const d = decideMatch(base({ direction: 'out' }))
    expect(d).toMatchObject({ verdict: 'UNMATCHED', restaurantId: null })
    expect(d.reasons).toEqual(['not_inbound'])
  })

  it('금액이 0 이하이거나 숫자가 아니면 UNMATCHED', () => {
    for (const amount of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(decideMatch(base({ amount })).reasons).toEqual(['not_inbound'])
    }
  })

  it('입금자명이 비어 있으면 UNMATCHED', () => {
    const d = decideMatch(base({ depositorNorm: '' }))
    expect(d).toMatchObject({ verdict: 'UNMATCHED' })
    expect(d.reasons).toEqual(['no_depositor'])
  })

  it('등록된 별칭도, 같은 업체명도 없으면 UNMATCHED', () => {
    const d = decideMatch(base({ depositorNorm: '모르는사람' }))
    expect(d).toMatchObject({ verdict: 'UNMATCHED', restaurantId: null })
    expect(d.reasons).toEqual(['no_candidate'])
  })
})
