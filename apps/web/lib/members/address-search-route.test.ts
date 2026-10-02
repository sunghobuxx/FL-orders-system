import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({ session: vi.fn(), search: vi.fn() }))
vi.mock('@/lib/admin-member-user', () => ({ getAdminSession: m.session }))
vi.mock('@/lib/kakao-local', () => ({ searchKakaoAddress: m.search }))

async function get(q?: string) {
  const { GET } = await import('../../app/api/admin/members/address-search/route')
  const url = q !== undefined ? `https://x.test?q=${encodeURIComponent(q)}` : 'https://x.test'
  return GET(new Request(url) as never)
}

describe('GET /api/admin/members/address-search', () => {
  beforeEach(() => vi.clearAllMocks())

  it('관리자가 아니면 403', async () => {
    m.session.mockResolvedValue(null)
    const res = await get('가락시장')
    expect(res.status).toBe(403)
    expect(m.search).not.toHaveBeenCalled()
  })

  it('검색어가 없으면 400', async () => {
    m.session.mockResolvedValue({ user: { id: 'admin-1' } })
    const res = await get()
    expect(res.status).toBe(400)
  })

  it('검색 결과를 그대로 돌려준다', async () => {
    m.session.mockResolvedValue({ user: { id: 'admin-1' } })
    m.search.mockResolvedValue([{ placeName: '가락시장', address: '서울 송파구 양재대로 932' }])
    const res = await get('가락시장')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ candidates: [{ placeName: '가락시장', address: '서울 송파구 양재대로 932' }] })
    expect(m.search).toHaveBeenCalledWith('가락시장')
  })

  it('검색이 실패하면 500 — 메시지를 그대로 보여준다', async () => {
    m.session.mockResolvedValue({ user: { id: 'admin-1' } })
    m.search.mockRejectedValue(new Error('KAKAO_LOCAL_API_KEY 가 설정되지 않았습니다'))
    const res = await get('가락시장')
    expect(res.status).toBe(500)
    expect((await res.json()).error).toContain('KAKAO_LOCAL_API_KEY')
  })
})
