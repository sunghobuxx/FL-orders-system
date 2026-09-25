import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ session: vi.fn(), rpc: vi.fn() }))
vi.mock('@/lib/admin-member-user', () => ({ getAdminSession: mocks.session }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ rpc: mocks.rpc }) }))

beforeEach(() => {
  vi.resetModules(); vi.resetAllMocks()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-09-25T03:00:00Z')) // KST 2026-09-25 12:00
  mocks.session.mockResolvedValue({ user: { id: 'admin-1' } })
  mocks.rpc.mockResolvedValue({ data: '2026-09-25T03:00:00+00:00', error: null })
})
afterEach(() => vi.useRealTimers())

async function post(body: unknown) {
  const { POST } = await import('../../app/api/admin/price-confirmations/route')
  return POST(new Request('https://example.test', { method: 'POST', body: JSON.stringify(body) }) as never)
}

describe('POST /api/admin/price-confirmations', () => {
  it('관리자가 아니면 403, DB 를 건드리지 않는다', async () => {
    mocks.session.mockResolvedValue(null)
    expect((await post({ date: '2026-09-25' })).status).toBe(403)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('날짜가 없거나 형식이 틀리면 400', async () => {
    for (const bad of [undefined, '', '2026-9-25', '2026-13-01', 'abc']) {
      expect((await post({ date: bad })).status).toBe(400)
    }
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('요청 본문이 JSON 이 아니어도 400', async () => {
    const { POST } = await import('../../app/api/admin/price-confirmations/route')
    const res = await POST(new Request('https://example.test', { method: 'POST', body: 'not json' }) as never)
    expect(res.status).toBe(400)
  })

  it('오늘(KST)보다 뒤 날짜는 400 — 오늘까지만 확정할 수 있다', async () => {
    const res = await post({ date: '2026-09-26' })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain('오늘')
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('오늘 날짜를 확정하면 DB 함수를 부르고 확정 시각을 돌려준다', async () => {
    const res = await post({ date: '2026-09-25' })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ date: '2026-09-25', confirmedAt: '2026-09-25T03:00:00+00:00' })
    expect(mocks.rpc).toHaveBeenCalledWith('confirm_price_day', { p_date: '2026-09-25', p_user: 'admin-1' })
  })

  it('지난 날짜도 확정할 수 있다(어제 단가를 오늘 고친 경우)', async () => {
    expect((await post({ date: '2026-09-24' })).status).toBe(200)
  })

  it('DB 오류는 500 이고 오류 내용을 화면에 그대로 내보내지 않는다', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'secret detail' } })
    const res = await post({ date: '2026-09-25' })
    expect(res.status).toBe(500)
    expect(JSON.stringify(await res.json())).not.toContain('secret detail')
  })
})
