import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeDb } from '@/lib/testing/fake-db'

const m = vi.hoisted(() => ({ session: vi.fn(), registerAndIssue: vi.fn() }))
vi.mock('@/lib/admin-member-user', () => ({ getAdminSession: m.session }))
vi.mock('@/lib/popbill/taxinvoice', () => ({ registerAndIssue: m.registerAndIssue, TAXINVOICE_SCOPES: ['110'] }))
vi.mock('@/lib/popbill/config', () => ({ loadPopbillConfig: () => ({ environment: 'test', corpNum: '1234567890', apiBase: 'https://x', linkId: 'l', secretKey: 's', serviceId: 'POPBILL_TEST', authUrl: 'https://a' }) }))
vi.mock('@/lib/popbill/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/popbill/client')>()
  return { ...actual, PopbillClient: class { constructor() {} } }
})

const OLD_ENV = process.env
async function post(db: unknown, body: unknown) {
  m.session.mockResolvedValue({ user: { id: 'admin-1' }, db })
  const { POST } = await import('../../app/api/admin/finance/tax-invoices/issue/route')
  return POST(new Request('https://x.test', { method: 'POST', body: JSON.stringify(body) }) as never)
}

const restaurantRow = (over: Record<string, unknown> = {}) => ({
  id: 'r1', biz_no: '1112223334', organization_id: 'org1', organizations: { name: '할매솥뚜껑삼겹살 별내점' }, ...over,
})
// 공급받는자 대표자성명은 회원 수정 화면의 "대표자"(contacts.name, is_primary) 를 쓴다.
const contactRow = { organization_id: 'org1', is_primary: true, name: '홍길동' }

describe('POST /api/admin/finance/tax-invoices/issue', () => {
  beforeEach(() => {
    vi.resetModules(); vi.clearAllMocks()
    process.env = { ...OLD_ENV, TAX_INVOICE_ISSUE_ENABLED: 'true' }
    m.registerAndIssue.mockResolvedValue({ ntsconfirmNum: 'nts-1' })
  })

  it('기능이 꺼져 있으면(기본값) 403 — DB 를 건드리지 않는다', async () => {
    process.env.TAX_INVOICE_ISSUE_ENABLED = 'false'
    const f = fakeDb({})
    const res = await post(f.db, { restaurantId: 'r1', month: '2026-09' })
    expect(res.status).toBe(403)
    expect(f.writes).toHaveLength(0)
  })

  it('필수 값이 없으면 400', async () => {
    const f = fakeDb({})
    expect((await post(f.db, { restaurantId: 'r1' })).status).toBe(400)
    expect((await post(f.db, { month: '2026-09' })).status).toBe(400)
  })

  it('month 형식이 아니면 400', async () => {
    const f = fakeDb({})
    expect((await post(f.db, { restaurantId: 'r1', month: '2026/09' })).status).toBe(400)
  })

  it('관리자가 아니면 403', async () => {
    m.session.mockResolvedValue(null)
    const { POST } = await import('../../app/api/admin/finance/tax-invoices/issue/route')
    const res = await POST(new Request('https://x.test', { method: 'POST', body: JSON.stringify({ restaurantId: 'r1', month: '2026-09' }) }) as never)
    expect(res.status).toBe(403)
  })

  it('업체를 찾을 수 없으면 404', async () => {
    const f = fakeDb({ tax_invoices: [], restaurants: [] })
    const res = await post(f.db, { restaurantId: 'r1', month: '2026-09' })
    expect(res.status).toBe(404)
  })

  it('사업자번호가 없으면 400 — 팝빌을 부르지 않는다', async () => {
    const f = fakeDb({ tax_invoices: [], restaurants: [restaurantRow({ biz_no: null })] })
    const res = await post(f.db, { restaurantId: 'r1', month: '2026-09' })
    expect(res.status).toBe(400)
    expect(m.registerAndIssue).not.toHaveBeenCalled()
  })

  it('이 달에 거래 내역이 없으면 404', async () => {
    const f = fakeDb({ tax_invoices: [], restaurants: [restaurantRow()], contacts: [contactRow], daily_specs: [] })
    const res = await post(f.db, { restaurantId: 'r1', month: '2026-09' })
    expect(res.status).toBe(404)
  })

  it('이미 발행됐으면(status=issued) 다시 부르지 않고 그대로 성공 응답', async () => {
    const f = fakeDb({
      tax_invoices: [{ id: 'tx1', status: 'issued', nts_confirm_num: 'nts-old' }],
      restaurants: [restaurantRow()], contacts: [contactRow], daily_specs: [{ total_amount: 10000, vat_amount: 1000 }],
    })
    const res = await post(f.db, { restaurantId: 'r1', month: '2026-09' })
    expect(res.status).toBe(200)
    expect((await res.json())).toEqual({ success: true, alreadyIssued: true, ntsConfirmNum: 'nts-old' })
    expect(m.registerAndIssue).not.toHaveBeenCalled()
  })

  it('결과 불명(status=unknown)으로 남아 있으면 409 — 자동 재시도하지 않는다(조회로 먼저 확인)', async () => {
    const f = fakeDb({
      tax_invoices: [{ id: 'tx1', status: 'unknown', nts_confirm_num: null }],
      restaurants: [restaurantRow()], contacts: [contactRow], daily_specs: [{ total_amount: 10000, vat_amount: 1000 }],
    })
    const res = await post(f.db, { restaurantId: 'r1', month: '2026-09' })
    expect(res.status).toBe(409)
    expect(m.registerAndIssue).not.toHaveBeenCalled()
  })

  it('★ 그 달 daily_specs 총액·세액을 더해 발행하고 결과를 tax_invoices 에 기록한다(작성일자=말일)', async () => {
    const f = fakeDb({
      tax_invoices: [], restaurants: [restaurantRow()], contacts: [contactRow],
      daily_specs: [{ total_amount: 55000, vat_amount: 5000 }, { total_amount: 55000, vat_amount: 5000 }],
    })
    const res = await post(f.db, { restaurantId: 'r1', month: '2026-09' })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true, ntsConfirmNum: 'nts-1' })

    expect(m.registerAndIssue).toHaveBeenCalledTimes(1)
    const payload = m.registerAndIssue.mock.calls[0][1]
    expect(payload).toMatchObject({
      writeDate: '20260930', taxTotal: '10000', supplyCostTotal: '100000', totalAmount: '110000',
      invoiceeCorpNum: '1112223334', invoiceeCorpName: '할매솥뚜껑삼겹살 별내점', invoiceeCEOName: '홍길동',
    })

    const w = f.writes.find(w => w.table === 'tax_invoices' && w.op === 'upsert')!
    expect(w.payload).toMatchObject({
      restaurant_id: 'r1', invoice_month: '2026-09-01', status: 'issued',
      supply_cost_total: 100000, tax_total: 10000, total_amount: 110000, nts_confirm_num: 'nts-1', created_by: 'admin-1',
    })
  })

  it('공급받는자 대표자성명이 없으면(2곳뿐, 아직 미입력) 빈 문자열로 발행한다', async () => {
    const f = fakeDb({
      tax_invoices: [], restaurants: [restaurantRow()], contacts: [],
      daily_specs: [{ total_amount: 10000, vat_amount: 1000 }],
    })
    await post(f.db, { restaurantId: 'r1', month: '2026-09' })
    const payload = m.registerAndIssue.mock.calls[0][1]
    expect(payload).toMatchObject({ invoiceeCEOName: '' })
  })

  it('팝빌이 거절하면(rejected) 400 이고 tax_invoices 에 rejected 로 남는다', async () => {
    const { PopbillError } = await import('@/lib/popbill/client')
    m.registerAndIssue.mockRejectedValue(new PopbillError('사업자번호 오류', 400, 'E001', 'rejected'))
    const f = fakeDb({
      tax_invoices: [], restaurants: [restaurantRow()], contacts: [contactRow],
      daily_specs: [{ total_amount: 10000, vat_amount: 1000 }],
    })
    const res = await post(f.db, { restaurantId: 'r1', month: '2026-09' })
    expect(res.status).toBe(400)
    const w = f.writes.find(w => w.table === 'tax_invoices' && w.op === 'upsert')!
    expect(w.payload).toMatchObject({ status: 'rejected' })
  })

  it('결과가 불명(unknown, 예: 네트워크 오류)이면 502 이고 tax_invoices 에 unknown 으로 남는다 — 이후 재시도는 막힌다', async () => {
    const { PopbillError } = await import('@/lib/popbill/client')
    m.registerAndIssue.mockRejectedValue(new PopbillError('시간 초과', null, null, 'unknown'))
    const f = fakeDb({
      tax_invoices: [], restaurants: [restaurantRow()], contacts: [contactRow],
      daily_specs: [{ total_amount: 10000, vat_amount: 1000 }],
    })
    const res = await post(f.db, { restaurantId: 'r1', month: '2026-09' })
    expect(res.status).toBe(502)
    const w = f.writes.find(w => w.table === 'tax_invoices' && w.op === 'upsert')!
    expect(w.payload).toMatchObject({ status: 'unknown' })
  })
})
