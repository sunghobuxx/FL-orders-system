import { describe, expect, it } from 'vitest'
import { recommendMatches, type UnpostedTx } from './recommend'
import type { OpenReceivable } from './match'

const tx = (over: Partial<UnpostedTx> = {}): UnpostedTx => ({ id: 'tx-1', amount: 48000, depositorRaw: '할매솥뚜껑삼겹살고강점', depositorNorm: '할매솥뚜껑삼겹살고강점', ...over })
const rv = (restaurantId: string, balance: number, dueDate: string): OpenReceivable => ({ id: `${restaurantId}-${dueDate}`, restaurantId, balance, dueDate, createdAt: `${dueDate}T00:00:00Z` })

describe('recommendMatches — 미확정 입금 각 건에 decideMatch 를 적용한다', () => {
  it('★ 별칭이 유일하고 미수금과 맞으면 AUTO_MATCH', () => {
    const out = recommendMatches(
      [tx()],
      [{ restaurantId: 'r1', aliasNorm: '할매솥뚜껑삼겹살고강점' }],
      [{ restaurantId: 'r1', nameNorm: '고강점' }],
      [rv('r1', 48000, '2026-09-26')],
    )
    expect(out.get('tx-1')).toMatchObject({ verdict: 'AUTO_MATCH', restaurantId: 'r1' })
  })

  it('입금자 원문이 없으면(이자 입금 등) UNMATCHED', () => {
    const out = recommendMatches([tx({ depositorRaw: null, depositorNorm: null })], [], [], [])
    expect(out.get('tx-1')).toMatchObject({ verdict: 'UNMATCHED', reasons: ['no_depositor'] })
  })

  it('여러 건을 한 번에 처리하고, 다른 업체 미수금은 서로 섞이지 않는다', () => {
    const out = recommendMatches(
      [tx({ id: 't1', depositorRaw: 'A', depositorNorm: 'a', amount: 1000 }), tx({ id: 't2', depositorRaw: 'B', depositorNorm: 'b', amount: 2000 })],
      [{ restaurantId: 'r1', aliasNorm: 'a' }, { restaurantId: 'r2', aliasNorm: 'b' }],
      [],
      [rv('r1', 1000, '2026-09-01'), rv('r2', 2000, '2026-09-01')],
    )
    expect(out.get('t1')).toMatchObject({ verdict: 'AUTO_MATCH', restaurantId: 'r1' })
    expect(out.get('t2')).toMatchObject({ verdict: 'AUTO_MATCH', restaurantId: 'r2' })
  })
})
