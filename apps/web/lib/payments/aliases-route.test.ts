import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeDb } from '@/lib/testing/fake-db'

const mocks = vi.hoisted(() => ({ session: vi.fn() }))
vi.mock('@/lib/admin-member-user', () => ({ getAdminSession: mocks.session }))

async function call(method: 'POST' | 'DELETE', db: unknown, body: unknown) {
  mocks.session.mockResolvedValue({ user: { id: 'admin-1' }, db })
  const mod = await import('../../app/api/admin/payments/aliases/route')
  const fn = method === 'POST' ? mod.POST : mod.DELETE
  return fn(new Request('https://x.test', { method, body: JSON.stringify(body) }) as never)
}

describe('POST /api/admin/payments/aliases — 별칭 등록', () => {
  beforeEach(() => vi.clearAllMocks())

  it('★ 정규화한 값으로 저장하고, 원문도 함께 남긴다', async () => {
    const f = fakeDb({})
    ;(f.db as any).from = f.db.from
    const res = await call('POST', f.db, { restaurantId: 'r1', alias: ' (주)할매솥뚜껑 ' })
    expect(res.status).toBe(200)
    const w = f.writes.find(w => w.table === 'depositor_aliases' && w.op === 'insert')!
    expect(w.payload).toMatchObject({ restaurant_id: 'r1', alias_raw: '(주)할매솥뚜껑', alias_norm: '할매솥뚜껑', created_by: 'admin-1' })
  })

  it('정규화한 결과가 빈 문자열이면 400', async () => {
    const res = await call('POST', fakeDb({}).db, { restaurantId: 'r1', alias: '   ' })
    expect(res.status).toBe(400)
  })

  it('업체나 별칭이 없으면 400', async () => {
    expect((await call('POST', fakeDb({}).db, { alias: 'a' })).status).toBe(400)
    expect((await call('POST', fakeDb({}).db, { restaurantId: 'r1' })).status).toBe(400)
  })

  it('같은 업체에 이미 있는 별칭은 409(디비 unique 위반을 사람이 읽을 문구로)', async () => {
    const f = fakeDb({}, { errors: { 'depositor_aliases:insert': { message: 'duplicate key value violates unique constraint', code: '23505' } } })
    const res = await call('POST', f.db, { restaurantId: 'r1', alias: '할매' })
    expect(res.status).toBe(409)
  })

  it('관리자가 아니면 403', async () => {
    mocks.session.mockResolvedValue(null)
    const { POST } = await import('../../app/api/admin/payments/aliases/route')
    const res = await POST(new Request('https://x.test', { method: 'POST', body: JSON.stringify({ restaurantId: 'r1', alias: 'a' }) }) as never)
    expect(res.status).toBe(403)
  })
})

describe('DELETE /api/admin/payments/aliases — 별칭 삭제', () => {
  beforeEach(() => vi.clearAllMocks())

  it('id 로 지운다', async () => {
    const f = fakeDb({})
    const res = await call('DELETE', f.db, { id: 'a1' })
    expect(res.status).toBe(200)
    expect(f.writes.find(w => w.table === 'depositor_aliases' && w.op === 'delete')).toBeTruthy()
  })

  it('id 가 없으면 400', async () => {
    expect((await call('DELETE', fakeDb({}).db, {})).status).toBe(400)
  })
})
