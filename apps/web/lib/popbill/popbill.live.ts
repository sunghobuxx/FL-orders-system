import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { PopbillClient } from './client'
import { loadPopbillConfig } from './config'
import { EASYFIN_SCOPES, listBankAccounts } from './easyfinbank'

/**
 * 팝빌 **테스트 서버**에 실제로 접속해 보는 읽기 전용 점검. 비밀값은 출력하지 않는다.
 * 실행: cd apps/web && pnpm exec vitest run --config vitest.live.config.ts
 * 필요: .env.local 의 POPBILL_LINK_ID / POPBILL_SECRET_KEY / POPBILL_CORP_NUM / POPBILL_ENVIRONMENT=test
 */
function loadEnvLocal(): Record<string, string> {
  const out: Record<string, string> = {}
  for (const line of readFileSync(new URL('../../.env.local', import.meta.url), 'utf8').split('\n')) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim())
    if (m) out[m[1]] = m[2].replace(/^['"]|['"]$/g, '')
  }
  return out
}

describe('팝빌 테스트 서버 점검(읽기 전용)', () => {
  const config = loadPopbillConfig(loadEnvLocal())

  it('환경은 test 여야 한다(운영을 부르지 않는다)', () => {
    expect(config.environment).toBe('test')
    expect(config.apiBase).toContain('popbill-test')
  })

  it('토큰 발급 + 계좌 목록 조회', async () => {
    const client = new PopbillClient(config)
    const res = await client.request('GET', '/EasyFin/Bank/ListBankAccount', { scopes: EASYFIN_SCOPES })
    const list = Array.isArray(res) ? res : []
    // 계좌번호는 출력하지 않는다: 기관코드와 끝 4자리만.
    const masked = list.map((a: { bankCode?: string; accountNumber?: string; state?: number }) =>
      `${a.bankCode ?? '?'} ****${String(a.accountNumber ?? '').slice(-4)} state=${a.state ?? '?'}`)
    console.log(`[popbill live] 토큰 발급 성공, 등록된 계좌 ${list.length}개`, masked)
    void listBankAccounts
    expect(Array.isArray(res)).toBe(true)
  })
})
