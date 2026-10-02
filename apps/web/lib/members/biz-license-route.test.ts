import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({ session: vi.fn(), createDb: vi.fn() }))
vi.mock('@/lib/admin-member-user', () => ({ getAdminSession: m.session }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: m.createDb }))

async function get(id: string) {
  const { GET } = await import('../../app/api/admin/members/[id]/biz-license/route')
  return GET(new Request('https://x.test') as never, { params: Promise.resolve({ id }) })
}

function dbWith(bizLicensePath: string | null, signedUrlResult: { data: { signedUrl: string } | null; error: unknown }) {
  const createSignedUrl = vi.fn().mockResolvedValue(signedUrlResult)
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: { biz_license_path: bizLicensePath } }),
        }),
      }),
    }),
    storage: { from: () => ({ createSignedUrl }) },
    createSignedUrl,
  }
}

describe('GET /api/admin/members/[id]/biz-license', () => {
  beforeEach(() => vi.clearAllMocks())

  it('관리자가 아니면 403', async () => {
    m.session.mockResolvedValue(null)
    const res = await get('org-1')
    expect(res.status).toBe(403)
  })

  it('등록된 파일이 없으면 404', async () => {
    m.session.mockResolvedValue({ user: { id: 'admin-1' } })
    m.createDb.mockReturnValue(dbWith(null, { data: null, error: null }))
    const res = await get('org-1')
    expect(res.status).toBe(404)
  })

  it('파일이 있으면 서명된 URL을 돌려준다', async () => {
    m.session.mockResolvedValue({ user: { id: 'admin-1' } })
    const db = dbWith('org-1/123_license.pdf', { data: { signedUrl: 'https://signed.example/x' }, error: null })
    m.createDb.mockReturnValue(db)
    const res = await get('org-1')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ url: 'https://signed.example/x' })
    expect(db.createSignedUrl).toHaveBeenCalledWith('org-1/123_license.pdf', 60)
  })

  it('서명 생성이 실패하면 500', async () => {
    m.session.mockResolvedValue({ user: { id: 'admin-1' } })
    m.createDb.mockReturnValue(dbWith('org-1/123_license.pdf', { data: null, error: { message: 'boom' } }))
    const res = await get('org-1')
    expect(res.status).toBe(500)
  })
})
