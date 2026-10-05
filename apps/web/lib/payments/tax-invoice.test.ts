import { describe, expect, it } from 'vitest'
import { buildTaxinvoicePayload, generateMgtKey } from './tax-invoice'

describe('generateMgtKey', () => {
  it('업체·정산기간이 같으면 항상 같은 키를 낸다(재시도해도 이중 발행을 만들지 않는다)', async () => {
    const a = await generateMgtKey('r1', 'p1')
    const b = await generateMgtKey('r1', 'p1')
    expect(a).toBe(b)
  })

  it('업체나 정산기간이 다르면 다른 키를 낸다', async () => {
    const a = await generateMgtKey('r1', 'p1')
    const b = await generateMgtKey('r2', 'p1')
    const c = await generateMgtKey('r1', 'p2')
    expect(a).not.toBe(b)
    expect(a).not.toBe(c)
  })

  it('★ 24자, 팝빌이 허용하는 문자(영문·숫자·-·_)만 쓴다', async () => {
    const key = await generateMgtKey('r1', 'p1')
    expect(key).toHaveLength(24)
    expect(key).toMatch(/^[A-Za-z0-9_-]{24}$/)
  })
})

describe('buildTaxinvoicePayload', () => {
  const base = {
    mgtKey: 'abc123def456abc123def456',
    writeDate: '20260929',
    invoicer: { corpNum: '1234567890', corpName: '커넥티드', ceoName: '김성호', addr: '인천 남동구', tel: '010-0000-0000' },
    invoicee: { corpNum: '0987654321', corpName: '할매솥뚜껑삼겹살 별내점', ceoName: '홍길동' },
    supplyCostTotal: 100000,
    taxTotal: 10000,
  }

  it('★ 정발행·정과금·청구 고정값과 금액·업체 정보를 그대로 담는다', () => {
    const payload = buildTaxinvoicePayload(base)
    expect(payload).toMatchObject({
      invoicerMgtKey: 'abc123def456abc123def456',
      writeDate: '20260929',
      issueType: '정발행',
      chargeDirection: '정과금',
      purposeType: '청구',
      taxType: '과세',
      supplyCostTotal: '100000',
      taxTotal: '10000',
      totalAmount: '110000',
      invoicerType: '사업자',
      invoicerCorpNum: '1234567890',
      invoicerCorpName: '커넥티드',
      invoicerCEOName: '김성호',
      invoiceeType: '사업자',
      invoiceeCorpNum: '0987654321',
      invoiceeCorpName: '할매솥뚜껑삼겹살 별내점',
      invoiceeCEOName: '홍길동',
    })
  })

  it('세액이 0 이면 면세로 분류한다', () => {
    const payload = buildTaxinvoicePayload({ ...base, taxTotal: 0 })
    expect(payload.taxType).toBe('면세')
    expect(payload.totalAmount).toBe('100000')
  })

  it('공급받는자 대표자명이 없으면 빈 문자열로 둔다(아직 안 채워진 업체가 있다)', () => {
    const payload = buildTaxinvoicePayload({ ...base, invoicee: { ...base.invoicee, ceoName: undefined } })
    expect(payload.invoiceeCEOName).toBe('')
  })

  it('음수·NaN 금액은 거절한다', () => {
    expect(() => buildTaxinvoicePayload({ ...base, supplyCostTotal: -1 })).toThrow()
    expect(() => buildTaxinvoicePayload({ ...base, taxTotal: NaN })).toThrow()
  })
})
