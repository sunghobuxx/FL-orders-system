import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
const state = vi.hoisted(() => ({ fail: '', filters: [] as unknown[][] }))
const loader = vi.hoisted(() => ({ map: new Map<string, unknown>(), fail: false }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }))
vi.mock('@/lib/pricing/price-status-loader', () => ({
  loadSpecStatuses: async () => { if (loader.fail) throw new Error('boom'); return loader.map },
}))
vi.mock('@/lib/member-session', () => ({ getMemberSession: async () => ({ user: { id: 'member' }, supabase: {
  from(table: string) {
    const q: Record<string, any> = {}; let single = false
    for (const method of ['select', 'gte', 'lte', 'order', 'in']) q[method] = () => q
    q.eq = (key: string, value: unknown) => { state.filters.push([table,key,value]); return q }
    q.maybeSingle = () => { single = true; return q }
    q.then = (resolve: (value: unknown) => void) => resolve({ error: table === state.fail ? { message: 'failed' } : null,
      data: table === 'memberships' ? { organization_id: 'own', organizations: { name: '테스트' } } : table === 'restaurants' ? { id: 'rest', settlement_cycle: 'weekly' } : table === 'daily_specs' ? (single ? { id: 'spec', business_date: '2026-09-15', total_amount: 10000 } : [{ id: 'spec', business_date: '2026-09-15', total_amount: 10000 }]) : table === 'receivables' ? [{ balance: 4000, status: 'partial', due_date: '2026-09-20', sales_statements: { settlement_periods: { start_date: '2026-09-14', end_date: '2026-09-20' } } }] : [] })
    return q
  },
} }) }))
import { GET } from '@/app/api/member/settlement/route'
const request = (extra = '') => GET(new NextRequest('http://localhost/api/member/settlement?date=2026-09-15&from=2026-09-01&to=2026-09-30' + extra))
beforeEach(() => { state.fail = ''; state.filters = []; loader.map = new Map(); loader.fail = false })
describe('정산 조회 API', () => {
  it('납품 합계와 부분 납부 잔액을 구분한다', async () => {
    const response = await request('&restaurantId=other')
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ outstanding: 4000, periods: [{ total: 10000, outstanding: 4000, billed: true }] })
    expect(state.filters).toContainEqual(['receivables','restaurant_id','rest'])
    expect(state.filters.some(row => row.includes('other'))).toBe(false)
  })
  it('잔액 조회 오류를 0원이나 완납으로 처리하지 않는다', async () => {
    state.fail = 'receivables'; expect((await request()).status).toBe(500)
  })

  it('업체 표시 범위의 단가 확정 상태를 priceStatuses 로 준다 (오늘 날짜 pending)', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-09-15T03:00:00Z')) // KST 2026-09-15 = 명세서 날짜(오늘)
    try {
      loader.map = new Map([['spec', { status: 'pending', at: null }]])
      const body = await (await request()).json()
      expect(body.priceStatuses).toEqual([{ date: '2026-09-15', status: 'pending', at: null }])
    } finally { vi.useRealTimers() }
  })

  it('업체에게는 오래된 pending 을 숨긴다 (오늘−2일 이전)', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-09-20T03:00:00Z'))
    try {
      loader.map = new Map([['spec', { status: 'pending', at: null }]])
      expect((await (await request()).json()).priceStatuses).toEqual([])
    } finally { vi.useRealTimers() }
  })

  it('상태 조회가 실패해도 정산 조회는 200 이고 기존 필드는 그대로다', async () => {
    loader.fail = true
    const response = await request()
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toMatchObject({ outstanding: 4000, periods: [{ total: 10000 }] })
    expect(body.priceStatuses).toEqual([])
  })
})
