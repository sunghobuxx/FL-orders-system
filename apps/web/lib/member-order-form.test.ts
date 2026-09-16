import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
const state = vi.hoisted(() => ({ auth: true, fail: '', batch: null as null | { id: string; business_date: string; status: string }, filters: [] as unknown[][] }))
vi.mock('@/lib/member-session', () => ({ getMemberSession: async () => ({ user: state.auth ? { id: 'user' } : null, supabase: {
  from(table: string) {
    const q: Record<string, any> = {}
    for (const method of ['select','order','limit','in']) q[method] = () => q
    q.eq = (key: string, value: unknown) => { state.filters.push([table, key, value]); return q }
    q.maybeSingle = () => q
    q.then = (resolve: (value: unknown) => void) => resolve({ error: table === state.fail ? { message: 'failed' } : null,
      data: table === 'memberships' ? { organization_id: 'own-org' } : table === 'restaurants' ? { id: 'own-rest' } : table === 'order_batches' ? state.batch : table === 'orders' ? null : table === 'products' ? [{ id: 'p1', standard_name: '양파', status: 'active', default_unit: 'kg' }] : [] })
    return q
  },
} }) }))
import { GET } from '@/app/api/member/order-form/route'
const request = (query = '') => GET(new NextRequest('http://localhost/api/member/order-form' + query))
beforeEach(() => { state.auth = true; state.fail = ''; state.batch = null; state.filters = []; vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-15T05:01:00Z')) })
afterEach(() => vi.useRealTimers())
describe('발주 화면 서버 조회', () => {
  it('오후 2시에는 서버 서울 시간 기준 내일을 기본값으로 반환한다', async () => {
    const response = await request()
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ today: '2026-09-15', businessDate: '2026-09-16', minutes: 841 })
  })
  it('지정 목록이 없으면 전체 활성 품목을 반환한다', async () => {
    expect((await (await request()).json()).products).toHaveLength(1)
    expect(state.filters).toContainEqual(['products', 'status', 'active'])
  })
  it('외부 업체 ID가 와도 자기 업체만 조회한다', async () => {
    await request('?restaurantId=another&date=2026-09-17')
    expect(state.filters).toContainEqual(['order_batches', 'restaurant_id', 'own-rest'])
    expect(state.filters.some(row => row.includes('another'))).toBe(false)
  })
  it('인증·조회 실패를 빈 발주로 반환하지 않는다', async () => {
    state.auth = false; expect((await request()).status).toBe(401)
    state.auth = true; state.fail = 'order_batches'; expect((await request()).status).toBe(500)
  })
  it('잘못된 날짜는 거절한다', async () => { expect((await request('?date=2026-02-30')).status).toBe(400) })
  it('새벽에는 오늘, 처리 완료된 발주이면 내일을 선택한다', async () => {
    vi.setSystemTime(new Date('2026-09-14T18:00:00Z'))
    expect((await (await request()).json()).businessDate).toBe('2026-09-15')
    state.batch = { id: 'batch', business_date: '2026-09-15', status: 'completed' }
    expect((await (await request()).json()).businessDate).toBe('2026-09-16')
  })
})
