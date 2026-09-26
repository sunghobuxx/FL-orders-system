import { describe, expect, it } from 'vitest'
import { fakeDb } from '@/lib/testing/fake-db'
import { settledSpecIds } from './settled'

const run = (tables: Record<string, unknown[]>, ids = ['s1']) => settledSpecIds(fakeDb(tables).db as never, ids)

describe('settledSpecIds — 확정됐거나 완납된 정산서에 든 명세서', () => {
  it('정산서에 안 들어간 명세서는 확정 대상이 아니다', async () => {
    expect([...await run({ sales_statement_lines: [] })]).toEqual([])
  })

  it('확정(confirmed_at)된 정산서에 든 명세서는 잠긴 것', async () => {
    const r = await run({
      sales_statement_lines: [{ sales_statement_id: 'st1', source_doc_id: 's1' }],
      sales_statements: [{ id: 'st1', confirmed_at: '2026-09-27T01:00:00Z' }],
      receivables: [{ statement_id: 'st1', status: 'unpaid' }],
    })
    expect([...r]).toEqual(['s1'])
  })

  it('완납(paid)된 정산서에 든 명세서는 잠긴 것', async () => {
    const r = await run({
      sales_statement_lines: [{ sales_statement_id: 'st1', source_doc_id: 's1' }],
      sales_statements: [{ id: 'st1', confirmed_at: null }],
      receivables: [{ statement_id: 'st1', status: 'paid' }],
    })
    expect([...r]).toEqual(['s1'])
  })

  it('미확정이고 미납·부분입금이면 잠기지 않았다(고칠 수 있다)', async () => {
    for (const status of ['unpaid', 'partial', 'overdue']) {
      const r = await run({
        sales_statement_lines: [{ sales_statement_id: 'st1', source_doc_id: 's1' }],
        sales_statements: [{ id: 'st1', confirmed_at: null }],
        receivables: [{ statement_id: 'st1', status }],
      })
      expect([...r]).toEqual([])
    }
  })

  it('미수금 행이 하나도 없는 미확정 정산서는 완납으로 보지 않는다', async () => {
    const r = await run({
      sales_statement_lines: [{ sales_statement_id: 'st1', source_doc_id: 's1' }],
      sales_statements: [{ id: 'st1', confirmed_at: null }],
      receivables: [],
    })
    expect([...r]).toEqual([])
  })

  it('명세서가 여러 개면 잠긴 것만 골라낸다', async () => {
    const r = await run({
      sales_statement_lines: [
        { sales_statement_id: 'st1', source_doc_id: 's1' },
        { sales_statement_id: 'st2', source_doc_id: 's2' },
      ],
      sales_statements: [{ id: 'st1', confirmed_at: '2026-09-27T01:00:00Z' }, { id: 'st2', confirmed_at: null }],
      receivables: [{ statement_id: 'st1', status: 'unpaid' }, { statement_id: 'st2', status: 'unpaid' }],
    }, ['s1', 's2'])
    expect([...r]).toEqual(['s1'])
  })

  it('명세서 id 가 없으면 조회하지 않고 빈 집합', async () => {
    expect([...await run({}, [])]).toEqual([])
  })
})
