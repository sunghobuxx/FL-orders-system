import { describe, expect, it, vi } from 'vitest'
import { fakeDb } from '@/lib/testing/fake-db'
import { applyMatch } from './apply-match'

/**
 * confirm-bank-transaction 라우트(수동 확정)와 auto-match 배치(자동 확정)가 똑같이 쓰는
 * 핵심 로직만 뽑아낸 것 — record_receivable_payment RPC 호출 + 성공 시 입금자 별칭 자동 등록.
 * 업체 불일치 409 판단·HTTP 상태 매핑은 호출하는 쪽(라우트)의 몫이라 여기서는 다루지 않는다.
 */

const txRow = (over: Record<string, unknown> = {}) => ({
  id: 'bt-1', direction: 'in', amount: 48000, posted_at: null, posted_restaurant_id: null,
  depositor_raw: '박창민(할매솥뚜껑삼', depositor_norm: '박창민할매솥뚜껑삼', trdt: '2026-09-29T00:00:00Z', ...over,
})

describe('applyMatch', () => {
  it('★ record_receivable_payment 를 은행 거래 금액·입금일로 호출하고, 성공하면 입금자명을 별칭으로 등록한다', async () => {
    const f = fakeDb({ bank_transactions: [txRow()], depositor_aliases: [] })
    ;(f.db as any).rpc = vi.fn().mockResolvedValue({ data: { applied: 48000, updated_count: 1, leftover: 0, already_posted: false }, error: null })

    const result = await applyMatch(f.db, { bankTransactionId: 'bt-1', restaurantId: 'r1', createdBy: 'admin-1' })

    expect(result).toEqual({ ok: true, alreadyPosted: false, applied: 48000, updatedCount: 1, credited: 0 })
    expect((f.db as any).rpc).toHaveBeenCalledWith('record_receivable_payment', {
      p_restaurant_id: 'r1', p_amount: 48000, p_method: 'transfer', p_paid_at: '2026-09-29T00:00:00Z',
      p_created_by: 'admin-1', p_bank_transaction_id: 'bt-1',
    })
    const w = f.writes.find(w => w.table === 'depositor_aliases' && w.op === 'insert')!
    expect(w.payload).toMatchObject({ restaurant_id: 'r1', alias_raw: '박창민(할매솥뚜껑삼', alias_norm: '박창민할매솥뚜껑삼', created_by: 'admin-1' })
  })

  it('createdBy 가 null 이어도(자동확정) 그대로 넘긴다', async () => {
    const f = fakeDb({ bank_transactions: [txRow()] })
    ;(f.db as any).rpc = vi.fn().mockResolvedValue({ data: { applied: 48000, updated_count: 1, leftover: 0, already_posted: false }, error: null })

    await applyMatch(f.db, { bankTransactionId: 'bt-1', restaurantId: 'r1', createdBy: null })

    expect((f.db as any).rpc).toHaveBeenCalledWith('record_receivable_payment', expect.objectContaining({ p_created_by: null }))
  })

  it('없는 거래면 NOT_FOUND', async () => {
    const f = fakeDb({ bank_transactions: [] })
    const result = await applyMatch(f.db, { bankTransactionId: 'bt-x', restaurantId: 'r1', createdBy: null })
    expect(result).toEqual({ ok: false, reason: 'NOT_FOUND' })
  })

  it('출금 거래면 NOT_INBOUND', async () => {
    const f = fakeDb({ bank_transactions: [txRow({ direction: 'out' })] })
    const result = await applyMatch(f.db, { bankTransactionId: 'bt-1', restaurantId: 'r1', createdBy: null })
    expect(result).toEqual({ ok: false, reason: 'NOT_INBOUND' })
  })

  it('이미 다른 업체로 반영된 거래는 ALREADY_POSTED_OTHER — RPC 를 부르지 않는다', async () => {
    const f = fakeDb({ bank_transactions: [txRow({ posted_at: '2026-09-29T00:00:00Z', posted_restaurant_id: 'r2' })] })
    ;(f.db as any).rpc = vi.fn()
    const result = await applyMatch(f.db, { bankTransactionId: 'bt-1', restaurantId: 'r1', createdBy: null })
    expect(result).toEqual({ ok: false, reason: 'ALREADY_POSTED_OTHER' })
    expect((f.db as any).rpc).not.toHaveBeenCalled()
  })

  it('같은 업체로 이미 반영된 거래(중복)는 already_posted 로 성공 응답, 별칭도 다시 등록하지 않는다', async () => {
    const f = fakeDb({ bank_transactions: [txRow({ posted_at: '2026-09-29T00:00:00Z', posted_restaurant_id: 'r1' })] })
    ;(f.db as any).rpc = vi.fn().mockResolvedValue({ data: { applied: 0, updated_count: 0, leftover: 0, already_posted: true }, error: null })
    const result = await applyMatch(f.db, { bankTransactionId: 'bt-1', restaurantId: 'r1', createdBy: null })
    expect(result).toEqual({ ok: true, alreadyPosted: true, applied: 0, updatedCount: 0, credited: 0 })
    expect(f.writes.find(w => w.table === 'depositor_aliases')).toBeUndefined()
  })

  it('RPC 오류는 원문 그대로(message/details) 넘긴다 — 호출하는 쪽이 매핑한다', async () => {
    const f = fakeDb({ bank_transactions: [txRow()] })
    ;(f.db as any).rpc = vi.fn().mockResolvedValue({ data: null, error: { message: 'OVERPAY', details: '30000' } })
    const result = await applyMatch(f.db, { bankTransactionId: 'bt-1', restaurantId: 'r1', createdBy: null })
    expect(result).toEqual({ ok: false, reason: 'RPC_ERROR', message: 'OVERPAY', details: '30000' })
  })

  it('입금자명이 없으면(이자 입금 등) 별칭을 등록하지 않는다', async () => {
    const f = fakeDb({ bank_transactions: [txRow({ depositor_raw: null, depositor_norm: null })] })
    ;(f.db as any).rpc = vi.fn().mockResolvedValue({ data: { applied: 48000, updated_count: 1, leftover: 0, already_posted: false }, error: null })
    await applyMatch(f.db, { bankTransactionId: 'bt-1', restaurantId: 'r1', createdBy: null })
    expect(f.writes.find(w => w.table === 'depositor_aliases')).toBeUndefined()
  })

  it('이미 등록된 별칭이면(중복키) 조용히 넘어가고 확정 결과는 그대로 성공', async () => {
    const f = fakeDb({ bank_transactions: [txRow()] }, { errors: { 'depositor_aliases:insert': { message: 'duplicate key value violates unique constraint', code: '23505' } } })
    ;(f.db as any).rpc = vi.fn().mockResolvedValue({ data: { applied: 48000, updated_count: 1, leftover: 0, already_posted: false }, error: null })
    const result = await applyMatch(f.db, { bankTransactionId: 'bt-1', restaurantId: 'r1', createdBy: null })
    expect(result.ok).toBe(true)
  })
})
