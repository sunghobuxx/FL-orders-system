import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeDb } from '@/lib/testing/fake-db'

const m = vi.hoisted(() => ({ session: vi.fn(), createDb: vi.fn() }))
vi.mock('@/lib/admin-member-user', () => ({ getAdminSession: m.session }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: m.createDb }))

async function put(id: string, body: unknown) {
  const { PUT } = await import('../../app/api/admin/members/[id]/route')
  return PUT(
    new Request('https://x.test', { method: 'PUT', body: JSON.stringify(body) }) as never,
    { params: Promise.resolve({ id }) }
  )
}

/**
 * 주소·사업자등록증은 restaurants 가 아니라 organizations 에 있다
 * (식당·공급처 공용, 2026-10-02 가락시장 매입 시작 — 서울 식당 판별에 주소가 필요해 추가).
 */
describe('PUT /api/admin/members/[id]', () => {
  beforeEach(() => vi.clearAllMocks())

  it('관리자가 아니면 403 — DB를 건드리지 않는다', async () => {
    m.session.mockResolvedValue(null)
    const res = await put('org-1', { address: '서울시 송파구' })
    expect(res.status).toBe(403)
  })

  it('주소를 organizations.address 로 저장한다', async () => {
    m.session.mockResolvedValue({ user: { id: 'admin-1' } })
    const f = fakeDb({})
    m.createDb.mockReturnValue(f.db)

    const res = await put('org-1', { address: '서울시 송파구 가락동 123' })
    expect(res.status).toBe(200)
    const orgWrite = f.writes.find(w => w.table === 'organizations' && w.op === 'update')!
    expect(orgWrite.payload).toMatchObject({ address: '서울시 송파구 가락동 123' })
  })

  it('빈 문자열로 저장하면 null 로 정리한다', async () => {
    m.session.mockResolvedValue({ user: { id: 'admin-1' } })
    const f = fakeDb({})
    m.createDb.mockReturnValue(f.db)

    await put('org-1', { address: '  ' })
    const orgWrite = f.writes.find(w => w.table === 'organizations' && w.op === 'update')!
    expect(orgWrite.payload).toMatchObject({ address: null })
  })

  it('사업자등록증 경로를 organizations.biz_license_path 로 저장한다', async () => {
    m.session.mockResolvedValue({ user: { id: 'admin-1' } })
    const f = fakeDb({})
    m.createDb.mockReturnValue(f.db)

    await put('org-1', { biz_license_path: 'org-1/123_license.pdf' })
    const orgWrite = f.writes.find(w => w.table === 'organizations' && w.op === 'update')!
    expect(orgWrite.payload).toMatchObject({ biz_license_path: 'org-1/123_license.pdf' })
  })

  it('biz_no·정산주기는 그대로 restaurants 테이블에 저장된다 (회귀)', async () => {
    m.session.mockResolvedValue({ user: { id: 'admin-1' } })
    const f = fakeDb({ restaurants: [{ id: 'rest-1' }] })
    m.createDb.mockReturnValue(f.db)

    await put('org-1', { biz_no: '000-00-00000', settlement_cycle: 'monthly' })
    const restWrite = f.writes.find(w => w.table === 'restaurants' && w.op === 'update')!
    expect(restWrite.payload).toMatchObject({ biz_no: '000-00-00000', settlement_cycle: 'monthly' })
  })

  it('아무 필드도 없으면 organizations 를 쓰지 않는다', async () => {
    m.session.mockResolvedValue({ user: { id: 'admin-1' } })
    const f = fakeDb({})
    m.createDb.mockReturnValue(f.db)

    await put('org-1', {})
    expect(f.writes.find(w => w.table === 'organizations')).toBeUndefined()
  })
})
