/**
 * 팝빌(Linkhub) 토큰 발급 요청을 만든다. 규격은 공식 문서(developers.popbill.com 의 각 서비스 getting-started/authorization 페이지, 2026-09-26 확인).
 *
 *   POST https://auth.linkhub.co.kr/{POPBILL_TEST|POPBILL}/Token
 *   본문   {"access_id": 사업자번호, "scope": [...]}
 *   서명   Authorization: LINKHUB {LinkID} {Signature}
 *     StringToSign = POST \n base64(sha256(본문)) \n X-LH-Date \n X-LH-Forwarded \n 2.0 \n /{serviceID}/Token
 *     Signature    = base64(HMAC-SHA256(key = base64 디코딩한 SecretKey, StringToSign))
 *
 * 엣지 런타임(Cloudflare)에서 돌도록 Web Crypto 만 쓴다(Node SDK 를 쓰지 않는다).
 * X-LH-Forwarded 는 항상 `*` 로 보낸다 — Cloudflare 는 고정 IP 가 없다(문서: `*` 는 모든 IP 허용).
 */

export type PopbillServiceId = 'POPBILL_TEST' | 'POPBILL'

export interface TokenRequestInput {
  linkId: string
  /** 팝빌이 준 SecretKey(base64 문자열 그대로) */
  secretKey: string
  /** 팝빌 회원 사업자번호(하이픈 없는 10자리) */
  corpNum: string
  scopes: string[]
  serviceId: PopbillServiceId
  date: Date
}

const enc = new TextEncoder()
const toBase64 = (bytes: ArrayBuffer | Uint8Array) => {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  let s = ''
  for (const b of arr) s += String.fromCharCode(b)
  return btoa(s)
}

function decodeSecret(secretKey: string): Uint8Array<ArrayBuffer> {
  try {
    const bin = atob(secretKey)
    const out = new Uint8Array(new ArrayBuffer(bin.length))
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
    return out
  } catch {
    // 값은 오류 문구에 넣지 않는다.
    throw new Error('SecretKey(POPBILL_SECRET_KEY) 가 base64 형식이 아닙니다')
  }
}

export async function buildTokenRequest(i: TokenRequestInput): Promise<{ url: string; headers: Record<string, string>; body: string }> {
  const body = JSON.stringify({ access_id: i.corpNum, scope: i.scopes })
  const digest = toBase64(await crypto.subtle.digest('SHA-256', enc.encode(body)))
  const requestDT = i.date.toISOString().replace(/\.\d{3}Z$/, 'Z')
  const forwarded = '*'
  const stringToSign = ['POST', digest, requestDT, forwarded, '2.0', `/${i.serviceId}/Token`].join('\n')

  const key = await crypto.subtle.importKey('raw', decodeSecret(i.secretKey), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const signature = toBase64(await crypto.subtle.sign('HMAC', key, enc.encode(stringToSign)))

  return {
    url: `https://auth.linkhub.co.kr/${i.serviceId}/Token`,
    body,
    headers: {
      'Content-Type': 'application/json',
      'X-LH-Version': '2.0',
      'X-LH-Date': requestDT,
      'X-LH-Forwarded': forwarded,
      Authorization: `LINKHUB ${i.linkId} ${signature}`,
    },
  }
}
