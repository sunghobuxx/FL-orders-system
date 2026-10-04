import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({ session: vi.fn(), createDb: vi.fn() }))
vi.mock('@/lib/admin-member-user', () => ({ getAdminSession: m.session }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: m.createDb }))

/** 일요일 배송 발주는 문자를 보내지 않는다 — 자동발송 라우트가 DB 를 건드리기 전에 막는다. */
describe('POST /api/admin/orders/auto-dispatch — 일요일', () => {
  beforeEach(() => {
    vi.resetModules(); vi.clearAllMocks()
    process.env = { ...process.env, PUSH_CRON_SECRET: 'cron-secret' }
  })

  it('일요일 날짜면 문자 발송 없이 0건으로 돌아오고 DB 를 건드리지 않는다', async () => {
    const { POST } = await import('../../app/api/admin/orders/auto-dispatch/route')
    const res = await POST(new Request('https://x.test', {
      method: 'POST',
      headers: { Authorization: 'Bearer cron-secret', 'Content-Type': 'application/json' },
      body: JSON.stringify({ businessDate: '2026-10-04' }),
    }) as never)
    const body = await res.json()
    expect(body.dispatched).toBe(0)
    expect(body.message).toContain('일요일')
    expect(m.createDb).not.toHaveBeenCalled()
  })
})
