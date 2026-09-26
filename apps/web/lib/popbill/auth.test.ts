import { describe, expect, it } from 'vitest'
import { buildTokenRequest } from './auth'

// 기대값은 구현과 별개로 파이썬(hashlib/hmac)으로 계산한 값이다.
//  StringToSign = POST \n bodyDigest \n requestDT \n * \n 2.0 \n /{serviceID}/Token , 키 = base64 디코딩한 SecretKey
const SECRET_B64 = 'dGVzdC1zZWNyZXQta2V5LTAxMjM0NTY3ODlhYmNkZWY='
const base = {
  linkId: 'TESTLINK', secretKey: SECRET_B64, corpNum: '1234567890', scopes: ['180', 'member'],
  serviceId: 'POPBILL_TEST' as const, date: new Date('2026-09-26T05:00:00Z'),
}

describe('buildTokenRequest — 팝빌 토큰 발급 요청 규격(공식 문서 2026-09-26)', () => {
  it('★ 테스트 환경: 주소·본문·서명이 규격과 같다', async () => {
    const r = await buildTokenRequest(base)
    expect(r.url).toBe('https://auth.linkhub.co.kr/POPBILL_TEST/Token')
    expect(r.body).toBe('{"access_id":"1234567890","scope":["180","member"]}')
    expect(r.headers).toEqual({
      'Content-Type': 'application/json',
      'X-LH-Version': '2.0',
      'X-LH-Date': '2026-09-26T05:00:00Z',
      'X-LH-Forwarded': '*',
      Authorization: 'LINKHUB TESTLINK tx9ZkS1bYFLcZF9WiLNTylk29eTg6T62IOF9ru0Wvs0=',
    })
  })

  it('운영 환경은 주소와 서명 대상(URI)이 다르다', async () => {
    const r = await buildTokenRequest({ ...base, serviceId: 'POPBILL' })
    expect(r.url).toBe('https://auth.linkhub.co.kr/POPBILL/Token')
    expect(r.headers.Authorization).toBe('LINKHUB TESTLINK KZ/HyNIw85eXvxjOn1FFd/ST0016nJP+YcUD1QLZwk0=')
  })

  it('요청 시각의 밀리초는 버린다(yyyy-MM-ddTHH:mm:ssZ)', async () => {
    const r = await buildTokenRequest({ ...base, date: new Date('2026-09-26T05:00:00.987Z') })
    expect(r.headers['X-LH-Date']).toBe('2026-09-26T05:00:00Z')
    expect(r.headers.Authorization).toContain('tx9ZkS1bYFLcZF9WiLNTylk29eTg6T62IOF9ru0Wvs0=')
  })

  it('범위(scope)의 순서를 그대로 지킨다 — 본문이 달라지면 서명도 달라진다', async () => {
    const a = await buildTokenRequest(base)
    const b = await buildTokenRequest({ ...base, scopes: ['member', '180'] })
    expect(b.body).toBe('{"access_id":"1234567890","scope":["member","180"]}')
    expect(b.headers.Authorization).not.toBe(a.headers.Authorization)
  })

  it('SecretKey 가 base64 가 아니어도 예외 대신 명확한 오류를 낸다(값은 오류 문구에 넣지 않는다)', async () => {
    await expect(buildTokenRequest({ ...base, secretKey: '%%%not-base64%%%' })).rejects.toThrow(/SecretKey/)
    await expect(buildTokenRequest({ ...base, secretKey: '%%%not-base64%%%' })).rejects.not.toThrow(/not-base64/)
  })
})
