import { describe, it, expect } from 'vitest'
import { syncStatementFinance } from '@/lib/settlement-finance'

/** 확정 여부만 흉내내고, 쓰기가 일어나면 기록해 두는 가짜 db */
function fakeDb(confirmedAt: string | null) {
  const writes: string[] = []
  const db = {
    writes,
    from(table: string) {
      const api: any = {
        select: () => api,
        eq: () => api,
        update: (_v: unknown) => { writes.push(`update:${table}`); return api },
        maybeSingle: async () => ({
          data: table === 'sales_statements'
            ? { confirmed_at: confirmedAt, total_amount: 100 }
            : null,
        }),
        then: (resolve: (v: { data: unknown[] }) => void) => resolve({ data: [] }),
      }
      return api
    },
  }
  return db
}

describe('syncStatementFinance 잠금 게이트', () => {
  it('확정된 정산서는 금액을 바꾸지 않는다', async () => {
    const db = fakeDb('2026-08-15T05:00:00Z')
    const applied = await syncStatementFinance('stmt-1', 999, 999, db)
    expect(applied).toBe(false)
    expect(db.writes).toEqual([])
  })

  it('확정되지 않은 정산서는 그대로 갱신한다', async () => {
    const db = fakeDb(null)
    const applied = await syncStatementFinance('stmt-1', 999, 999, db)
    expect(applied).toBe(true)
    expect(db.writes).toContain('update:sales_statements')
  })
})
