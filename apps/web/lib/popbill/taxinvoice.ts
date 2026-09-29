import type { PopbillClient } from './client'

/**
 * 팝빌 세금계산서(Taxinvoice) 호출. 경로·헤더는 공식 API 레퍼런스로 확인했다
 * (developers.popbill.com/api-reference/taxinvoice/api/issue, 2026-09-29) — Node SDK 소스(popbill 1.64.2)
 * 의 `_executeAction` 도 같다: registIssue/issue 는 실제 HTTP 메서드는 POST 그대로 두고
 * `X-HTTP-Method-Override: ISSUE` 헤더로만 구분한다(BaseService.js:452).
 *
 *   등록+즉시발행   POST /Taxinvoice, 헤더 X-HTTP-Method-Override: ISSUE  (본문 = Taxinvoice 객체)
 *   조회            GET  /Taxinvoice/{KeyType}/{MgtKey}                    (KeyType: SELL/BUY/TRUSTEE)
 *
 * scope 는 세금계산서 110(공식 문서 확인). 이 파일은 등록+즉시발행·조회만 다룬다 —
 * 취소·수정·전송(팩스/이메일) 등은 이 단계 범위 밖이다(2026-09-25 계획서 §4 단계 2).
 */
export const TAXINVOICE_SCOPES = ['110']
type Client = Pick<PopbillClient, 'request'>

const KEY_TYPES = ['SELL', 'BUY', 'TRUSTEE'] as const
type KeyType = (typeof KEY_TYPES)[number]

function assertKeyType(keyType: string): keyType is KeyType {
  if (!(KEY_TYPES as readonly string[]).includes(keyType)) throw new Error('문서번호유형은 SELL/BUY/TRUSTEE 중 하나여야 합니다')
  return true
}

export async function registerAndIssue(client: Client, taxinvoice: Record<string, unknown>): Promise<unknown> {
  return client.request('POST', '/Taxinvoice', {
    scopes: TAXINVOICE_SCOPES,
    body: taxinvoice,
    headers: { 'X-HTTP-Method-Override': 'ISSUE' },
  })
}

export async function getInfo(client: Client, a: { keyType: string; mgtKey: string }): Promise<unknown> {
  assertKeyType(a.keyType)
  return client.request('GET', `/Taxinvoice/${a.keyType}/${a.mgtKey}`, { scopes: TAXINVOICE_SCOPES })
}
