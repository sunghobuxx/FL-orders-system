import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeDb } from '@/lib/testing/fake-db'

const m = vi.hoisted(() => ({ session: vi.fn(), createDb: vi.fn() }))
vi.mock('@/lib/admin-member-user', () => ({ getAdminSession: m.session }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: m.createDb }))

async function put(body: unknown) {
  const { PUT } = await import('../../app/api/admin/suppliers/[id]/route')
  return PUT(new Request('https://x.test', { method: 'PUT', body: JSON.stringify(body) }) as never, {
    params: Promise.resolve({ id: 'sup-1' }),
  })
}

describe('PUT /api/admin/suppliers/[id] — 발주 구분', () => {
  beforeEach(() => vi.clearAllMocks())

  it('허용되지 않은 발주 구분은 400, DB를 건드리지 않는다', async () => {
    m.session.mockResolvedValue({ user: { id: 'admin' } })
    const f = fakeDb({ suppliers: [{ organization_id: 'org-1' }] })
    m.createDb.mockReturnValue(f.db)
    const res = await put({ dispatch_group: 'bogus' })
    expect(res.status).toBe(400)
    expect(f.writes).toHaveLength(0)
  })

  it('common·garak 은 suppliers 에 저장한다', async () => {
    m.session.mockResolvedValue({ user: { id: 'admin' } })
    const f = fakeDb({ suppliers: [{ organization_id: 'org-1' }] })
    m.createDb.mockReturnValue(f.db)
    const res = await put({ dispatch_channel: 'kakao', status: 'active', dispatch_group: 'common' })
    expect(res.status).toBe(200)
    const w = f.writes.find(x => x.table === 'suppliers' && x.op === 'update')!
    expect(w.payload).toMatchObject({ dispatch_group: 'common' })
  })
})
