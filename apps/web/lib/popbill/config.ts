import type { PopbillServiceId } from './auth'

/**
 * 팝빌 설정. 환경(test/production)은 **반드시 명시**한다 — 팝빌은 같은 키를 테스트·운영에 둘 다 쓸 수 있어서
 * 키만으로는 어느 환경인지 알 수 없다(공식 문서). 값이 비었거나 오타면 기본값으로 운영을 고르지 않고 거절한다.
 * production 은 POPBILL_ALLOW_PRODUCTION=yes 를 따로 켜야 한다(키를 바꾸다 실수로 운영을 부르는 것을 막는다).
 * 오류 문구에는 변수 이름만 넣고 값은 넣지 않는다.
 */
export interface PopbillConfig {
  environment: 'test' | 'production'
  serviceId: PopbillServiceId
  authUrl: string
  apiBase: string
  linkId: string
  secretKey: string
  corpNum: string
}

type Env = Record<string, string | undefined>

export function loadPopbillConfig(env: Env): PopbillConfig {
  const environment = env.POPBILL_ENVIRONMENT
  if (environment !== 'test' && environment !== 'production') {
    throw new Error('POPBILL_ENVIRONMENT 는 test 또는 production 이어야 합니다')
  }
  if (environment === 'production' && env.POPBILL_ALLOW_PRODUCTION !== 'yes') {
    throw new Error('운영(production) 환경은 POPBILL_ALLOW_PRODUCTION=yes 를 함께 설정해야 사용할 수 있습니다')
  }

  const missing = ['POPBILL_LINK_ID', 'POPBILL_SECRET_KEY', 'POPBILL_CORP_NUM'].filter(k => !env[k]?.trim())
  if (missing.length) throw new Error(`팝빌 설정이 비어 있습니다: ${missing.join(', ')}`)

  const corpNum = env.POPBILL_CORP_NUM!.trim().replace(/-/g, '')
  if (!/^\d{10}$/.test(corpNum) || env.POPBILL_CORP_NUM!.trim().replace(/[\d-]/g, '') !== '' ) {
    throw new Error('POPBILL_CORP_NUM 은 사업자번호 10자리 숫자여야 합니다')
  }

  const test = environment === 'test'
  return {
    environment,
    serviceId: test ? 'POPBILL_TEST' : 'POPBILL',
    authUrl: 'https://auth.linkhub.co.kr',
    apiBase: test ? 'https://popbill-test.linkhub.co.kr' : 'https://popbill.linkhub.co.kr',
    linkId: env.POPBILL_LINK_ID!.trim(),
    secretKey: env.POPBILL_SECRET_KEY!.trim(),
    corpNum,
  }
}
