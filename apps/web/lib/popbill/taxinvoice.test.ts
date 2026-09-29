import { describe, expect, it, vi } from 'vitest'
import { TAXINVOICE_SCOPES, getInfo, registerAndIssue } from './taxinvoice'

const fake = (result: unknown = {}) => ({ request: vi.fn().mockResolvedValue(result) })
const asClient = (f: ReturnType<typeof fake>) => f as never

/**
 * 세금계산서 등록+즉시발행(RegistIssue) 호출. 경로·X-HTTP-Method-Override 는 공식 API 레퍼런스로 확인했다
 * (developers.popbill.com/api-reference/taxinvoice/api/issue, 2026-09-29) — POST /Taxinvoice 에
 * 실제 HTTP 메서드는 POST 그대로 두고 X-HTTP-Method-Override: ISSUE 헤더로 구분한다(Node SDK 소스와 일치).
 */
describe('팝빌 세금계산서 호출', () => {
  it('범위(scope)는 세금계산서 110', () => {
    expect(TAXINVOICE_SCOPES).toEqual(['110'])
  })

  it('★ 등록+즉시발행: POST /Taxinvoice, X-HTTP-Method-Override: ISSUE', async () => {
    const f = fake({ ntsconfirmNum: '123' })
    const taxinvoice = { invoicerMgtKey: 'abc' }
    const result = await registerAndIssue(asClient(f), taxinvoice)
    expect(result).toEqual({ ntsconfirmNum: '123' })
    expect(f.request).toHaveBeenCalledWith('POST', '/Taxinvoice', {
      scopes: ['110'], body: taxinvoice, headers: { 'X-HTTP-Method-Override': 'ISSUE' },
    })
  })

  it('★ 조회: GET /Taxinvoice/{keyType}/{mgtKey}', async () => {
    const f = fake({ stateCode: '400' })
    const result = await getInfo(asClient(f), { keyType: 'SELL', mgtKey: 'abc123' })
    expect(result).toEqual({ stateCode: '400' })
    expect(f.request).toHaveBeenCalledWith('GET', '/Taxinvoice/SELL/abc123', { scopes: ['110'] })
  })

  it('조회는 keyType 이 SELL/BUY/TRUSTEE 가 아니면 거절한다', async () => {
    const f = fake()
    await expect(getInfo(asClient(f), { keyType: 'BOGUS', mgtKey: 'abc' })).rejects.toThrow()
    expect(f.request).not.toHaveBeenCalled()
  })
})
