import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeDb } from '@/lib/testing/fake-db'

const m = vi.hoisted(() => ({ session: vi.fn(), createDb: vi.fn(), sendSms: vi.fn() }))
vi.mock('@/lib/admin-member-user', () => ({ getAdminSession: m.session }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: m.createDb }))
vi.mock('@/lib/messaging/kakao', () => ({ sendSms: m.sendSms }))

const OLD_ENV = process.env
const CRON_SECRET = 'test-cron-secret'

async function post(body: unknown, headers: Record<string, string> = {}) {
  const { POST } = await import('../../app/api/admin/restaurants/notify/route')
  return POST(new Request('https://x.test', { method: 'POST', body: JSON.stringify(body), headers }) as never)
}

/**
 * 공지사항(send-sms)은 전체 매출업체에 발송하는데, 품절·배송지연처럼 일부 업체에만
 * 알릴 일이 있어 특정 업체 목록에만 보내는 라우트를 추가한다(2026-10-03 미나리 부족 안내).
 */
describe('POST /api/admin/restaurants/notify', () => {
  beforeEach(() => {
    vi.resetModules(); vi.clearAllMocks()
    process.env = { ...OLD_ENV, PUSH_CRON_SECRET: CRON_SECRET }
  })

  it('크론 시크릿도 세션도 없으면 403 — 문자를 보내지 않는다', async () => {
    m.session.mockResolvedValue(null)
    const res = await post({ organizationIds: ['org-1'], message: '안내' })
    expect(res.status).toBe(403)
    expect(m.sendSms).not.toHaveBeenCalled()
  })

  it('PUSH_CRON_SECRET 베어러 토큰이면 세션 없이도 통과한다', async () => {
    m.session.mockResolvedValue(null)
    const f = fakeDb({
      organizations: [{ id: 'org-1', name: '테스트식당' }],
      contacts: [{ organization_id: 'org-1', phone: '010-1234-5678', is_primary: true }],
    })
    m.createDb.mockReturnValue(f.db)
    m.sendSms.mockResolvedValue({ success: true })

    const res = await post({ organizationIds: ['org-1'], message: '안내' }, { Authorization: `Bearer ${CRON_SECRET}` })
    expect(res.status).toBe(200)
    expect(m.sendSms).toHaveBeenCalledWith('01012345678', '안내')
  })

  it('업체 목록이 비어 있으면 400', async () => {
    m.session.mockResolvedValue({ user: { id: 'admin-1' } })
    const res = await post({ organizationIds: [], message: '안내' })
    expect(res.status).toBe(400)
  })

  it('메시지가 비어 있으면 400', async () => {
    m.session.mockResolvedValue({ user: { id: 'admin-1' } })
    const res = await post({ organizationIds: ['org-1'], message: '' })
    expect(res.status).toBe(400)
  })

  it('전화번호 형식이 아니면 그 업체는 건너뛴다(발송 대상에서 제외)', async () => {
    m.session.mockResolvedValue({ user: { id: 'admin-1' } })
    const f = fakeDb({
      organizations: [{ id: 'org-1', name: '번호없는식당' }],
      contacts: [{ organization_id: 'org-1', phone: '02-1234-5678', is_primary: true }],
    })
    m.createDb.mockReturnValue(f.db)

    const res = await post({ organizationIds: ['org-1'], message: '안내' })
    const body = await res.json()
    expect(body.successCount).toBe(0)
    expect(body.results).toHaveLength(0)
    expect(m.sendSms).not.toHaveBeenCalled()
  })

  it('업체당 1건만 보낸다 — 대표번호가 있으면 그걸 우선한다', async () => {
    m.session.mockResolvedValue({ user: { id: 'admin-1' } })
    const f = fakeDb({
      organizations: [{ id: 'org-1', name: '식당' }],
      contacts: [
        { organization_id: 'org-1', phone: '010-1111-1111', is_primary: false },
        { organization_id: 'org-1', phone: '010-2222-2222', is_primary: true },
      ],
    })
    m.createDb.mockReturnValue(f.db)
    m.sendSms.mockResolvedValue({ success: true })

    await post({ organizationIds: ['org-1'], message: '안내' })
    expect(m.sendSms).toHaveBeenCalledTimes(1)
    expect(m.sendSms).toHaveBeenCalledWith('01022222222', '안내')
  })

  it('결과를 업체명과 함께 돌려준다 — 성공/실패 집계 포함', async () => {
    m.session.mockResolvedValue({ user: { id: 'admin-1' } })
    const f = fakeDb({
      organizations: [{ id: 'org-1', name: '성공식당' }, { id: 'org-2', name: '실패식당' }],
      contacts: [
        { organization_id: 'org-1', phone: '010-1111-1111', is_primary: true },
        { organization_id: 'org-2', phone: '010-2222-2222', is_primary: true },
      ],
    })
    m.createDb.mockReturnValue(f.db)
    m.sendSms.mockResolvedValueOnce({ success: true }).mockResolvedValueOnce({ success: false, error: 'failed' })

    const res = await post({ organizationIds: ['org-1', 'org-2'], message: '안내' })
    const body = await res.json()
    expect(body.successCount).toBe(1)
    expect(body.failCount).toBe(1)
    expect(body.results).toEqual(expect.arrayContaining([
      expect.objectContaining({ org: '성공식당', success: true }),
      expect.objectContaining({ org: '실패식당', success: false, error: 'failed' }),
    ]))
  })
})
