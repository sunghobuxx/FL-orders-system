import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeDb, type FakeWrite } from '@/lib/testing/fake-db'

const fin = vi.hoisted(() => ({ computeOutstanding: vi.fn(), syncStatementFinance: vi.fn() }))
vi.mock('@/lib/settlement-finance', () => fin)

import { cleanSpecAfterBatchDelete } from './cleanup-deleted-batch'

const args = { restaurantId: 'r1', businessDate: '2026-09-21', itemIds: ['oi-1'], productIds: ['p-gaenip'] }

const base = (over: Record<string, unknown[]> = {}) => ({
  daily_specs: [{ id: 'spec-1' }],
  daily_spec_lines: [{ id: 'l1', product_id: 'p-gaenip', order_item_id: null, amount: 46000, vat_amount: 0 }],
  sales_statement_lines: [{ id: 'sl1', sales_statement_id: 'st1', source_doc_id: 'spec-1', amount: 46000 }],
  sales_statements: [{ id: 'st1', confirmed_at: null }],
  receivables: [{ statement_id: 'st1', status: 'unpaid', balance: 200000 }],
  ...over,
})

const run = async (tables: Record<string, unknown[]>) => {
  const f = fakeDb(tables)
  const result = await cleanSpecAfterBatchDelete(f.db as never, args)
  return { result, writes: f.writes }
}
const wrote = (writes: FakeWrite[], table: string, op: string) => writes.filter(w => w.table === table && w.op === op)

describe('cleanSpecAfterBatchDelete — 지운 발주의 명세서·정산서 정리', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    fin.computeOutstanding.mockResolvedValue(0)
    fin.syncStatementFinance.mockResolvedValue(undefined)
  })

  it('★ 그 발주로 만든 줄뿐이면 줄·정산서 줄·명세서를 지우고 정산서 총액과 미수금을 다시 맞춘다 (킨텍스점 9/21, 2026-09-26)', async () => {
    const { result, writes } = await run(base())
    expect(result).toEqual({ status: 'cleaned', removedLines: 1, removedSpec: true })
    expect(wrote(writes, 'daily_spec_lines', 'delete')).toHaveLength(1)
    expect(wrote(writes, 'sales_statement_lines', 'delete')).toHaveLength(1)
    expect(wrote(writes, 'daily_specs', 'delete')).toHaveLength(1)
    expect(fin.syncStatementFinance).toHaveBeenCalledTimes(1)
    expect(fin.syncStatementFinance.mock.calls[0][0]).toBe('st1')
  })

  it('관리자가 손으로 넣은 다른 품목 줄이 남아 있으면 명세서는 지우지 않고 합계만 다시 낸다', async () => {
    const { result, writes } = await run(base({
      daily_spec_lines: [
        { id: 'l1', product_id: 'p-gaenip', order_item_id: 'oi-1', amount: 46000, vat_amount: 0 },
        { id: 'l2', product_id: 'p-manual', order_item_id: null, amount: 5000, vat_amount: 500 },
      ],
    }))
    expect(result).toMatchObject({ status: 'cleaned', removedLines: 1, removedSpec: false })
    expect(wrote(writes, 'daily_specs', 'delete')).toEqual([])
    expect(wrote(writes, 'daily_specs', 'update')[0].payload).toEqual({ total_amount: 5500, vat_amount: 500 })
    expect(wrote(writes, 'sales_statement_lines', 'update')[0].payload).toEqual({ amount: 5500 })
    expect(fin.syncStatementFinance).toHaveBeenCalledTimes(1)
  })

  it('발주 연결이 끊긴 줄도 같은 품목이면 지운다(연결이 끊긴 줄이 대부분이다)', async () => {
    const { result } = await run(base({ daily_spec_lines: [{ id: 'l1', product_id: 'p-gaenip', order_item_id: null, amount: 46000, vat_amount: 0 }] }))
    expect(result.removedLines).toBe(1)
  })

  it('order_item_id 로 이어진 줄은 품목이 달라도 지운다', async () => {
    const { result } = await run(base({ daily_spec_lines: [{ id: 'l1', product_id: 'other', order_item_id: 'oi-1', amount: 100, vat_amount: 0 }] }))
    expect(result.removedLines).toBe(1)
  })

  it('★ 확정됐거나 완납된 정산서에 든 날짜는 아무것도 지우지 않는다', async () => {
    const { result, writes } = await run(base({ sales_statements: [{ id: 'st1', confirmed_at: '2026-09-27T01:00:00Z' }] }))
    expect(result).toEqual({ status: 'settled', removedLines: 0, removedSpec: false })
    expect(writes).toEqual([])
    expect(fin.syncStatementFinance).not.toHaveBeenCalled()
  })

  it('★ 이미 받은 돈보다 정산서 총액이 작아지게 되면(부분입금 뒤 발주 삭제) 정리를 거부한다 — 초과 입금이 기록 없이 사라지지 않게', async () => {
    // 미수금 잔액 10,000 인 정산서에서 46,000 짜리 명세서를 지우면 잔액이 -36,000 → 0 으로 잘려 36,000 이 사라진다
    const { result, writes } = await run(base({ receivables: [{ statement_id: 'st1', status: 'partial', balance: 10000 }] }))
    expect(result).toEqual({ status: 'overpaid', removedLines: 0, removedSpec: false })
    expect(writes).toEqual([])
    expect(fin.syncStatementFinance).not.toHaveBeenCalled()
  })

  it('잔액이 지우는 금액과 정확히 같으면(완전히 0 이 되는 경우)는 정리한다', async () => {
    const { result } = await run(base({ receivables: [{ statement_id: 'st1', status: 'unpaid', balance: 46000 }] }))
    expect(result.status).toBe('cleaned')
  })

  it('그날 명세서가 없으면 할 일이 없다', async () => {
    const { result, writes } = await run(base({ daily_specs: [] }))
    expect(result.status).toBe('none')
    expect(writes).toEqual([])
  })

  it('지울 줄이 하나도 없으면(모두 수동 품목) 손대지 않는다', async () => {
    const { result, writes } = await run(base({ daily_spec_lines: [{ id: 'l2', product_id: 'p-manual', order_item_id: null, amount: 5000, vat_amount: 0 }] }))
    expect(result.status).toBe('none')
    expect(writes).toEqual([])
  })

  it('명세서가 아직 정산서에 안 들어갔으면 정산서는 건드리지 않는다', async () => {
    const { result } = await run(base({ sales_statement_lines: [] }))
    expect(result).toEqual({ status: 'cleaned', removedLines: 1, removedSpec: true })
    expect(fin.syncStatementFinance).not.toHaveBeenCalled()
  })
})
