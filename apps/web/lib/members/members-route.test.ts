import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ from: vi.fn(), createUser: vi.fn(), session: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: mocks.from, auth: { admin: { createUser: mocks.createUser } } }),
}))
vi.mock('@/lib/admin-member-user', () => ({ getAdminSession: mocks.session }))

function table() {
  const chain: Record<string, unknown> = {}
  for (const m of ['insert', 'select', 'upsert']) chain[m] = vi.fn(() => chain)
  chain.single = vi.fn(async () => ({ data: { id: 'new-id' }, error: null }))
  chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data: null, error: null }).then(resolve)
  return chain
}

beforeEach(() => {
  vi.resetModules(); vi.resetAllMocks()
  mocks.session.mockResolvedValue({ user: { id: 'admin' } })
  mocks.from.mockImplementation(() => table())
  mocks.createUser.mockResolvedValue({ data: { user: { id: 'auth-user' } }, error: null })
})

async function post(body: Record<string, unknown>) {
  const { POST } = await import('../../app/api/admin/members/route')
  return POST(new Request('https://example.test', { method: 'POST', body: JSON.stringify(body) }) as never)
}

describe('POST /api/admin/members — 로그인 이메일', () => {
  it('매출 업체를 이메일 없이 등록하면 400, 아무것도 만들지 않는다', async () => {
    const res = await post({ name: '수원대점', org_type: 'restaurant', email: null })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain('이메일')
    expect(mocks.from).not.toHaveBeenCalled()
    expect(mocks.createUser).not.toHaveBeenCalled()
  })

  it('형식이 틀린 이메일도 같은 방식으로 막는다', async () => {
    const res = await post({ name: '수원대점', org_type: 'restaurant', email: 'lsc4407' })
    expect(res.status).toBe(400)
    expect(mocks.from).not.toHaveBeenCalled()
  })

  it('이메일이 있으면 정리된 값(공백 제거·소문자)으로 로그인 계정을 만든다', async () => {
    const res = await post({ name: '수원대점', org_type: 'restaurant', email: ' LSC4407@Gmail.com ' })
    expect(res.status).toBe(200)
    expect(mocks.createUser).toHaveBeenCalledWith(expect.objectContaining({ email: 'lsc4407@gmail.com' }))
  })

  it('매입 공급처는 이메일 없이도 등록된다 — 로그인 계정은 만들지 않는다', async () => {
    const res = await post({ name: '인숙이네', org_type: 'supplier', email: null })
    expect(res.status).toBe(200)
    expect(mocks.from).toHaveBeenCalled()
    expect(mocks.createUser).not.toHaveBeenCalled()
  })

  // 가락시장 매입(2026-10) — 서울 식당 판별에 주소가 필요해 등록 시점부터 받는다
  it('주소를 입력하면 organizations 생성에 포함된다', async () => {
    const orgChain = table()
    mocks.from.mockImplementation((t: string) => (t === 'organizations' ? orgChain : table()))
    await post({ name: '가락점', org_type: 'supplier', address: '서울시 송파구 가락동 123', email: null })
    expect(orgChain.insert).toHaveBeenCalledWith(expect.objectContaining({ address: '서울시 송파구 가락동 123' }))
  })

  it('주소를 비워두면 null 로 저장한다', async () => {
    const orgChain = table()
    mocks.from.mockImplementation((t: string) => (t === 'organizations' ? orgChain : table()))
    await post({ name: '가락점', org_type: 'supplier', address: '  ', email: null })
    expect(orgChain.insert).toHaveBeenCalledWith(expect.objectContaining({ address: null }))
  })
})
