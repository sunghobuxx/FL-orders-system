import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ from: vi.fn(), submit: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: mocks.from }) }))
vi.mock('@/lib/push-delivery', async importOriginal => ({
  ...await importOriginal<typeof import('./push-delivery')>(), submitExpoPush: mocks.submit,
}))

function query(data: unknown, error: unknown = null) {
  const chain: Record<string, unknown> = {}
  for (const method of ['select', 'eq', 'in', 'is', 'update']) chain[method] = vi.fn(() => chain)
  chain.then = (resolve: (value: unknown) => unknown) => Promise.resolve({ data, error }).then(resolve)
  return chain
}

beforeEach(() => {
  vi.resetModules(); vi.resetAllMocks()
  vi.stubEnv('PUSH_CRON_SECRET', 'test-secret')
  mocks.submit.mockResolvedValue({ accepted: 1, requested: 1, ticketIds: ['ticket'], errors: [] })
})

async function post(authorized = true) {
  const { POST } = await import('../app/api/admin/push/send/route')
  return POST(new Request('https://example.test', { method: 'POST', headers: authorized ? { Authorization: 'Bearer test-secret' } : {} }))
}

function arrange(claimed = true) {
  const now = new Date(Date.now() + 9 * 3600000).toISOString().slice(11, 16)
  const queries = [
    query([{ id: 's', title: 'title', body: 'body', send_time: now, last_sent_at: null }]),
    query([{ organization_id: 'org' }]), query([{ user_id: 'user' }]), query([{ token: 'token' }]),
    query(claimed ? [{ id: 's' }] : []), query(null),
  ]
  for (const q of queries) mocks.from.mockReturnValueOnce(q)
  return queries
}

describe('scheduled push route', () => {
  it('rejects unauthenticated requests before DB access', async () => {
    expect((await post(false)).status).toBe(401)
    expect(mocks.from).not.toHaveBeenCalled()
  })
  it('reports query failure instead of silently reporting no schedules', async () => {
    mocks.from.mockReturnValueOnce(query(null, { message: 'failed' }))
    expect((await post()).status).toBe(500)
    expect(mocks.submit).not.toHaveBeenCalled()
  })
  it('only sends after acquiring the optimistic claim', async () => {
    arrange(false)
    expect((await post()).status).toBe(200)
    expect(mocks.submit).not.toHaveBeenCalled()
  })
  it('returns accepted tickets without claiming device delivery', async () => {
    arrange()
    const response = await post()
    expect(await response.json()).toMatchObject({ accepted: 1, ticketIds: ['ticket'] })
    expect(mocks.submit).toHaveBeenCalledWith(['token'], 'title', 'body')
  })
  it('releases claim on complete rejection and exposes failure', async () => {
    const q = arrange()
    mocks.submit.mockResolvedValue({ accepted: 0, requested: 1, ticketIds: [], errors: ['InvalidCredentials'] })
    expect((await post()).status).toBe(502)
    expect(q[5].update).toHaveBeenCalledWith({ last_sent_at: null })
  })
  it('does not retry the entire batch after partial acceptance', async () => {
    arrange()
    mocks.submit.mockResolvedValue({ accepted: 1, requested: 2, ticketIds: ['ticket'], errors: ['DeviceNotRegistered'] })
    expect((await post()).status).toBe(502)
    expect(mocks.from).toHaveBeenCalledTimes(5)
  })
})
