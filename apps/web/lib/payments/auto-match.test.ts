import { describe, expect, it, vi } from 'vitest'
import { fakeDb } from '@/lib/testing/fake-db'
import { parseAutoMatchMode, runAutoMatch } from './auto-match'

/**
 * 계좌조회 수집 뒤에 도는 자동매칭 배치. 판정(decideMatch)은 항상 payment_matches 에 기록하고,
 * mode==='live' 일 때만 AUTO_MATCH 건을 실제로 반영한다(applyMatch, record_receivable_payment).
 * 판정 로직 자체는 lib/payments/match.ts 에서 이미 테스트됐으므로 여기서는 배치의 진행/기록/모드
 * 분기만 검증한다.
 */

describe('parseAutoMatchMode', () => {
  it('shadow/live 는 그대로, 그 밖의 값(미설정 포함)은 off 로 본다', () => {
    expect(parseAutoMatchMode('shadow')).toBe('shadow')
    expect(parseAutoMatchMode('live')).toBe('live')
    expect(parseAutoMatchMode('off')).toBe('off')
    expect(parseAutoMatchMode(undefined)).toBe('off')
    expect(parseAutoMatchMode('strict')).toBe('off')
    expect(parseAutoMatchMode('')).toBe('off')
  })
})

const restaurantRow = (id: string, name: string) => ({ id, organizations: { name, organization_type: 'restaurant', status: 'active' } })

describe('runAutoMatch', () => {
  const baseTables = {
    bank_transactions: [
      { id: 'bt-1', amount: 30000, depositor_raw: '박창민', depositor_norm: '박창민' },
    ],
    depositor_aliases: [{ restaurant_id: 'r1', alias_norm: '박창민' }],
    restaurants: [restaurantRow('r1', '할매솥뚜껑삼겹살 별내점')],
    receivables: [{ id: 'rcv-1', restaurant_id: 'r1', balance: 30000, due_date: '2026-09-20', created_at: '2026-09-20T00:00:00Z' }],
  }

  it('mode=off 면 아무것도 조회·기록하지 않는다', async () => {
    const f = fakeDb(baseTables)
    const summary = await runAutoMatch(f.db, 'off')
    expect(summary).toEqual({ mode: 'off', evaluated: 0, autoMatched: 0, applied: 0, errors: [] })
    expect(f.writes).toHaveLength(0)
  })

  it('mode=shadow 면 AUTO_MATCH 판정을 payment_matches 에 기록하되 실제로 반영하지 않는다(rpc 호출 없음)', async () => {
    const f = fakeDb(baseTables)
    ;(f.db as any).rpc = vi.fn()

    const summary = await runAutoMatch(f.db, 'shadow')

    expect(summary).toEqual({ mode: 'shadow', evaluated: 1, autoMatched: 1, applied: 0, errors: [] })
    expect((f.db as any).rpc).not.toHaveBeenCalled()
    const w = f.writes.find(w => w.table === 'payment_matches' && w.op === 'upsert')!
    expect(w.payload).toMatchObject({ bank_transaction_id: 'bt-1', verdict: 'AUTO_MATCH', restaurant_id: 'r1' })
  })

  it('mode=live 면 AUTO_MATCH 건을 실제로 확정한다(record_receivable_payment 호출)', async () => {
    const f = fakeDb({ ...baseTables, bank_transactions: [{ id: 'bt-1', amount: 30000, depositor_raw: '박창민', depositor_norm: '박창민', direction: 'in', trdt: '2026-09-29T00:00:00Z', posted_at: null, posted_restaurant_id: null }] })
    ;(f.db as any).rpc = vi.fn().mockResolvedValue({ data: { applied: 30000, updated_count: 1, leftover: 0, already_posted: false }, error: null })

    const summary = await runAutoMatch(f.db, 'live')

    expect(summary).toEqual({ mode: 'live', evaluated: 1, autoMatched: 1, applied: 1, errors: [] })
    expect((f.db as any).rpc).toHaveBeenCalledWith('record_receivable_payment', expect.objectContaining({ p_restaurant_id: 'r1', p_created_by: null }))
    const matchWrite = f.writes.find(w => w.table === 'payment_matches' && w.op === 'upsert')!
    expect(matchWrite.payload).toMatchObject({ verdict: 'AUTO_MATCH', restaurant_id: 'r1' })
  })

  it('REVIEW/UNMATCHED 건은 기록만 하고 mode=live 여도 반영하지 않는다', async () => {
    const f = fakeDb({
      bank_transactions: [{ id: 'bt-2', amount: 999999, depositor_raw: '박창민', depositor_norm: '박창민', direction: 'in', trdt: '2026-09-29T00:00:00Z', posted_at: null, posted_restaurant_id: null }],
      depositor_aliases: [{ restaurant_id: 'r1', alias_norm: '박창민' }],
      restaurants: [restaurantRow('r1', '할매솥뚜껑삼겹살 별내점')],
      receivables: [{ id: 'rcv-1', restaurant_id: 'r1', balance: 30000, due_date: '2026-09-20', created_at: '2026-09-20T00:00:00Z' }],
    })
    ;(f.db as any).rpc = vi.fn()

    const summary = await runAutoMatch(f.db, 'live')

    expect(summary.autoMatched).toBe(0)
    expect((f.db as any).rpc).not.toHaveBeenCalled()
    const w = f.writes.find(w => w.table === 'payment_matches' && w.op === 'upsert')!
    expect(w.payload).toMatchObject({ verdict: 'REVIEW' })
  })

  it('반영되지 않은 은행 거래가 없으면 조용히 끝난다', async () => {
    const f = fakeDb({ bank_transactions: [], depositor_aliases: [], restaurants: [], receivables: [] })
    const summary = await runAutoMatch(f.db, 'shadow')
    expect(summary).toEqual({ mode: 'shadow', evaluated: 0, autoMatched: 0, applied: 0, errors: [] })
  })

  it('mode=live 에서 반영이 실패하면(예: 그 사이 미수금이 바뀜) errors 에 기록하고 나머지는 계속한다', async () => {
    const f = fakeDb({ ...baseTables, bank_transactions: [{ id: 'bt-1', amount: 30000, depositor_raw: '박창민', depositor_norm: '박창민', direction: 'in', trdt: '2026-09-29T00:00:00Z', posted_at: null, posted_restaurant_id: null }] })
    ;(f.db as any).rpc = vi.fn().mockResolvedValue({ data: null, error: { message: 'OVERPAY', details: '0' } })

    const summary = await runAutoMatch(f.db, 'live')

    expect(summary.applied).toBe(0)
    expect(summary.errors).toEqual([{ bankTransactionId: 'bt-1', reason: 'RPC_ERROR' }])
  })
})
