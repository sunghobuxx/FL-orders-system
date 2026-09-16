import { describe, expect, it, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
const mock = vi.hoisted(() => ({ cookie: vi.fn(), verify: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ getSessionUser: mock.cookie }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ auth: { getUser: mock.verify } }) }))
import { getMemberSession } from './member-session'
beforeEach(() => { vi.clearAllMocks(); mock.cookie.mockResolvedValue({ user: { id: 'cookie' } }); mock.verify.mockResolvedValue({ data: { user: null }, error: { message: 'invalid' } }) })
describe('회원 모바일 API 인증', () => {
  it('헤더 없는 웹 요청은 기존 쿠키 인증을 사용한다', async () => {
    expect((await getMemberSession(new NextRequest('http://localhost'))).user?.id).toBe('cookie')
    expect(mock.verify).not.toHaveBeenCalled()
  })
  it('잘못된 토큰은 로그인 쿠키로 우회하지 않는다', async () => {
    for (const authorization of ['Bearer invalid', 'Basic invalid', 'Bearer ']) {
      expect((await getMemberSession(new NextRequest('http://localhost', { headers: { authorization } }))).user).toBeNull()
    }
    expect(mock.cookie).not.toHaveBeenCalled()
  })
  it('검증된 토큰의 사용자만 반환한다', async () => {
    mock.verify.mockResolvedValue({ data: { user: { id: 'verified' } }, error: null })
    expect((await getMemberSession(new NextRequest('http://localhost', { headers: { authorization: 'Bearer token' } }))).user?.id).toBe('verified')
    expect(mock.verify).toHaveBeenCalledWith('token')
  })
})
