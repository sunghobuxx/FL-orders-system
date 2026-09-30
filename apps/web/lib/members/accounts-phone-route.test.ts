import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeDb } from '@/lib/testing/fake-db'

const m = vi.hoisted(() => ({ getDb: vi.fn() }))
vi.mock('@/lib/admin-member-user', () => ({ getAuthorizedAdminDb: m.getDb }))

async function patch(db: unknown, body: unknown) {
  m.getDb.mockResolvedValue(db)
  const { PATCH } = await import('../../app/api/admin/accounts/[userId]/phone/route')
  return PATCH(
    new Request('https://x.test', { method: 'PATCH', body: JSON.stringify(body) }) as never,
    { params: Promise.resolve({ userId: 'u1' }) },
  )
}

/**
 * 관리자 계정(매니저·오너)의 전화번호 입력. 회원 발주확인 화면(모바일)이 이미
 * /api/member/delivery-contact 로 이 값을 불러와 배송 담당자 연락처로 보여준다 —
 * 여기서는 입력만 만든다(2026-09-30).
 */
describe('PATCH /api/admin/accounts/[userId]/phone', () => {
  beforeEach(() => vi.clearAllMocks())

  it('★ 관리자면 전화번호를 저장한다', async () => {
    const f = fakeDb({ users: [{ id: 'u1' }] })
    const res = await patch(f.db, { phone: '010-1234-5678' })
    expect(res.status).toBe(200)
    const w = f.writes.find(w => w.table === 'users' && w.op === 'update')!
    expect(w.payload).toEqual({ phone: '010-1234-5678' })
  })

  it('관리자가 아니면 403', async () => {
    const res = await patch(null, { phone: '010-1234-5678' })
    expect(res.status).toBe(403)
  })

  it('전화번호 형식이 아니면 400 — 저장하지 않는다', async () => {
    const f = fakeDb({ users: [{ id: 'u1' }] })
    const res = await patch(f.db, { phone: '전화주세요' })
    expect(res.status).toBe(400)
    expect(f.writes).toHaveLength(0)
  })

  it('빈 문자열은 전화번호를 지우는 것으로 허용한다', async () => {
    const f = fakeDb({ users: [{ id: 'u1' }] })
    const res = await patch(f.db, { phone: '' })
    expect(res.status).toBe(200)
    const w = f.writes.find(w => w.table === 'users' && w.op === 'update')!
    expect(w.payload).toEqual({ phone: null })
  })
})
