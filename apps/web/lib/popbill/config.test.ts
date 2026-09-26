import { describe, expect, it } from 'vitest'
import { loadPopbillConfig } from './config'

const ok = { POPBILL_LINK_ID: 'LINK', POPBILL_SECRET_KEY: 'c2VjcmV0', POPBILL_ENVIRONMENT: 'test', POPBILL_CORP_NUM: '123-45-67890' }

describe('loadPopbillConfig — 환경을 명시하고 실수로 운영을 부르지 않는다', () => {
  it('★ test: 테스트 서버 주소와 서비스 ID, 사업자번호는 하이픈을 뗀 10자리', () => {
    expect(loadPopbillConfig(ok)).toEqual({
      environment: 'test', serviceId: 'POPBILL_TEST',
      authUrl: 'https://auth.linkhub.co.kr', apiBase: 'https://popbill-test.linkhub.co.kr',
      linkId: 'LINK', secretKey: 'c2VjcmV0', corpNum: '1234567890',
    })
  })

  it('★ production 은 POPBILL_ALLOW_PRODUCTION=yes 를 따로 켜야 한다 — 키만 바꿔서 운영이 되지 않게', () => {
    expect(() => loadPopbillConfig({ ...ok, POPBILL_ENVIRONMENT: 'production' })).toThrow(/ALLOW_PRODUCTION/)
    const c = loadPopbillConfig({ ...ok, POPBILL_ENVIRONMENT: 'production', POPBILL_ALLOW_PRODUCTION: 'yes' })
    expect(c).toMatchObject({ environment: 'production', serviceId: 'POPBILL', apiBase: 'https://popbill.linkhub.co.kr' })
  })

  it('환경 값이 test/production 이 아니면(비었거나 오타) 거절한다 — 기본값으로 운영을 고르지 않는다', () => {
    for (const v of [undefined, '', 'prod', 'TEST', 'live']) {
      expect(() => loadPopbillConfig({ ...ok, POPBILL_ENVIRONMENT: v })).toThrow(/POPBILL_ENVIRONMENT/)
    }
  })

  it('빠진 값은 이름만 알려 주고 값은 오류에 넣지 않는다', () => {
    let msg = ''
    try { loadPopbillConfig({ POPBILL_ENVIRONMENT: 'test', POPBILL_SECRET_KEY: 'SUPERSECRETVALUE' }) } catch (e) { msg = String(e) }
    expect(msg).toContain('POPBILL_LINK_ID')
    expect(msg).toContain('POPBILL_CORP_NUM')
    expect(msg).not.toContain('SUPERSECRETVALUE')
  })

  it('사업자번호가 10자리 숫자가 아니면 거절한다', () => {
    for (const v of ['123', '12345678901', 'abcdefghij', '123-45-6789']) {
      expect(() => loadPopbillConfig({ ...ok, POPBILL_CORP_NUM: v })).toThrow(/POPBILL_CORP_NUM/)
    }
  })
})
