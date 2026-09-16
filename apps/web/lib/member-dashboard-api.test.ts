import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
const state = vi.hoisted(() => ({ authenticated: true, member: true, failedTable: '', filters: [] as Array<[string, string, unknown]> }))
vi.mock('@/lib/specs/sync', () => ({ buildPriceMapByProduct: async () => ({ priceMap: {} }) }))
vi.mock('@/lib/market/summary', () => ({ getSupplyTrend: async () => new Map() }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({
  auth: { getUser: async () => ({ data: { user: state.authenticated ? { id: 'member' } : null }, error: null }) },
  from: (table: string) => {
    const query: Record<string, any> = {}
    let single = false
    for (const method of ['select', 'order', 'limit', 'gte', 'lte', 'in']) query[method] = () => query
    query.eq = (key: string, value: unknown) => { state.filters.push([table, key, value]); return query }
    query.maybeSingle = () => { single = true; return query }
    query.then = (resolve: (value: unknown) => void) => resolve({ data: table === 'memberships' ? state.member ? { organization_id: 'own-org' } : null : table === 'restaurants' ? { id: 'own-restaurant', organization_id: 'own-org' } : single ? null : [], error: table === state.failedTable ? { message: 'failed' } : null })
    return query
  },
}) }))
import { GET } from '@/app/api/member/dashboard-analysis/route'
const request = (token = true) => GET(new NextRequest('http://localhost/api/member/dashboard-analysis?restaurantId=someone-else', { headers: token ? { Authorization: 'Bearer test' } : {} }))
beforeEach(() => { state.authenticated = true; state.member = true; state.failedTable = ''; state.filters = [] })
describe('모바일 대시보드 인증·실패 처리', () => {
  it('인증되지 않은 요청을 거절한다', async () => {
    expect((await request(false)).status).toBe(401)
    state.authenticated = false
    expect((await request()).status).toBe(401)
  })
  it('회원 업체 없이 데이터를 읽지 않는다', async () => {
    state.member = false
    expect((await request()).status).toBe(403)
  })
  it('요청 업체 ID가 아닌 로그인 회원 업체로 제한한다', async () => {
    const response = await request()
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect((await response.json()).webDashboard.trend).toBeNull()
    expect(state.filters).toContainEqual(['inquiries', 'organization_id', 'own-org'])
    expect(state.filters).toContainEqual(['receivables', 'restaurant_id', 'own-restaurant'])
    expect(state.filters.some(([, , value]) => value === 'someone-else')).toBe(false)
  })
  it('조회 실패를 미수금 0원이나 빈 문의로 표시하지 않는다', async () => {
    state.failedTable = 'receivables'
    expect((await request()).status).toBe(500)
  })
})
