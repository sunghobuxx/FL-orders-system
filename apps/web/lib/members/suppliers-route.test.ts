import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeDb } from '@/lib/testing/fake-db'

const m = vi.hoisted(() => ({ session: vi.fn(), createDb: vi.fn() }))
vi.mock('@/lib/admin-member-user', () => ({ getAdminSession: m.session }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: m.createDb }))

async function post(body: unknown) {
  const { POST } = await import('../../app/api/admin/suppliers/route')
  return POST(new Request('https://x.test', { method: 'POST', body: JSON.stringify(body) }) as never)
}

/**
 * 공급처 등록이 없는 DB 함수(admin_create_organization)를 불러서 늘 실패하고 있었다
 * (2026-10-02 사장님 보고 — 가락시장 등록 시도 중 발견). 회원(식당) 등록 라우트와 같은 방식으로
 * organizations 에 직접 insert 하도록 고친다.
 */
describe('POST /api/admin/suppliers', () => {
  beforeEach(() => vi.clearAllMocks())

  it('공급처명이 없으면 400 — DB 를 건드리지 않는다', async () => {
    m.session.mockResolvedValue({ user: { id: 'admin-1' } })
    const f = fakeDb({})
    m.createDb.mockReturnValue(f.db)
    const res = await post({ name: '' })
    expect(res.status).toBe(400)
    expect(f.writes).toHaveLength(0)
  })

  it('관리자가 아니면 403', async () => {
    m.session.mockResolvedValue(null)
    const res = await post({ name: '가락시장' })
    expect(res.status).toBe(403)
  })

  it('★ RPC 없이 organizations·suppliers 에 직접 insert 해서 등록한다', async () => {
    m.session.mockResolvedValue({ user: { id: 'admin-1' } })
    const f = fakeDb({ organizations: [{ id: 'org-1' }], suppliers: [{ id: 'sup-1' }] })
    m.createDb.mockReturnValue(f.db)

    const res = await post({ name: '가락시장', dispatch_channel: 'kakao', phone: '' })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true, supplierId: 'sup-1' })

    const orgWrite = f.writes.find(w => w.table === 'organizations' && w.op === 'insert')!
    expect(orgWrite.payload).toMatchObject({ name: '가락시장', organization_type: 'supplier', status: 'active' })

    const supWrite = f.writes.find(w => w.table === 'suppliers' && w.op === 'insert')!
    expect(supWrite.payload).toMatchObject({ organization_id: 'org-1', dispatch_channel: 'kakao', status: 'active' })
  })

  it('연락처를 입력하면 contacts 도 생성한다 — 비워두면 안 만든다', async () => {
    m.session.mockResolvedValue({ user: { id: 'admin-1' } })
    const f = fakeDb({ organizations: [{ id: 'org-1' }], suppliers: [{ id: 'sup-1' }] })
    m.createDb.mockReturnValue(f.db)

    await post({ name: '가락시장', phone: '010-1234-5678' })
    const contactWrite = f.writes.find(w => w.table === 'contacts' && w.op === 'insert')!
    expect(contactWrite.payload).toMatchObject({ organization_id: 'org-1', phone: '010-1234-5678', is_primary: true })

    vi.clearAllMocks()
    m.session.mockResolvedValue({ user: { id: 'admin-1' } })
    const f2 = fakeDb({ organizations: [{ id: 'org-2' }], suppliers: [{ id: 'sup-2' }] })
    m.createDb.mockReturnValue(f2.db)
    await post({ name: '가락시장2', phone: '' })
    expect(f2.writes.find(w => w.table === 'contacts')).toBeUndefined()
  })

  it('조직 생성이 실패하면 500 — 이후 단계는 진행하지 않는다', async () => {
    m.session.mockResolvedValue({ user: { id: 'admin-1' } })
    const f = fakeDb({}, { errors: { 'organizations:insert': { message: 'boom' } } })
    m.createDb.mockReturnValue(f.db)
    const res = await post({ name: '가락시장' })
    expect(res.status).toBe(500)
    expect(f.writes.find(w => w.table === 'suppliers')).toBeUndefined()
  })
})
