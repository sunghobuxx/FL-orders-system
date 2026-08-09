import { describe, it, expect } from 'vitest'
import { isConfirmed, confirmedStatementIds } from './confirm'

/** sales_statements 만 흉내내는 가짜 db. 실 DB 를 건드리지 않는다. */
function fakeDb(rows: Array<{ id: string; confirmed_at: string | null }>) {
  return {
    from(table: string) {
      if (table !== 'sales_statements') throw new Error(`예상 못 한 테이블: ${table}`)
      let picked = rows
      const api = {
        select: () => api,
        eq: (_col: string, val: string) => {
          picked = rows.filter(r => r.id === val)
          return api
        },
        in: (_col: string, vals: string[]) => {
          picked = rows.filter(r => vals.includes(r.id))
          return api
        },
        maybeSingle: async () => ({ data: picked[0] ?? null }),
        then: (resolve: (v: { data: typeof rows }) => void) => resolve({ data: picked }),
      }
      return api
    },
  }
}

describe('isConfirmed', () => {
  it('confirmed_at 이 있으면 true', async () => {
    const db = fakeDb([{ id: 'a', confirmed_at: '2026-08-15T05:00:00Z' }])
    expect(await isConfirmed(db, 'a')).toBe(true)
  })

  it('confirmed_at 이 null 이면 false', async () => {
    const db = fakeDb([{ id: 'a', confirmed_at: null }])
    expect(await isConfirmed(db, 'a')).toBe(false)
  })

  it('정산서가 없으면 false — 아직 만들어지지 않은 것이지 잠긴 것이 아니다', async () => {
    const db = fakeDb([])
    expect(await isConfirmed(db, 'nope')).toBe(false)
  })
})

describe('confirmedStatementIds', () => {
  it('확정된 것만 골라 돌려준다', async () => {
    const db = fakeDb([
      { id: 'a', confirmed_at: '2026-08-15T05:00:00Z' },
      { id: 'b', confirmed_at: null },
      { id: 'c', confirmed_at: '2026-08-08T05:00:00Z' },
    ])
    const got = await confirmedStatementIds(db, ['a', 'b', 'c'])
    expect([...got].sort()).toEqual(['a', 'c'])
  })

  it('빈 배열이면 DB 를 부르지 않고 빈 Set', async () => {
    const db = { from() { throw new Error('부르면 안 된다') } }
    expect(await confirmedStatementIds(db, [])).toEqual(new Set())
  })
})
