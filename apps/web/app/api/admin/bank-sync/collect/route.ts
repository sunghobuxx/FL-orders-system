export const runtime = 'edge'

import { NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-member-user'
import { createAdminClient } from '@/lib/supabase/admin'
import { PopbillClient } from '@/lib/popbill/client'
import { loadPopbillConfig } from '@/lib/popbill/config'
import { listBankAccounts } from '@/lib/popbill/easyfinbank'
import { collectBankTransactions } from '@/lib/popbill/collect'
import { getKstDateOffset, getKstToday } from '@/lib/date-kst'

/**
 * 계좌조회 수집 크론. 30~60분마다 pg_cron 이 부른다(등록은 별도 마이그레이션).
 * 크론: Authorization: Bearer <PUSH_CRON_SECRET>, 사람은 로그인 세션으로도 부를 수 있다.
 *
 * 겹쳐서 재조회한다 — 지연 반영되는 거래를 잡기 위해 매번 최근 며칠을 다시 훑는다.
 * 이미 반영된 거래는 `bank_transactions` 의 unique(account_ref, provider_tid) 가 걸러낸다.
 * 계좌 하나가 실패해도 나머지 계좌는 계속 수집한다(부분 실패가 전체를 막지 않는다).
 */
const CRON_SECRET = process.env.PUSH_CRON_SECRET
const LOOKBACK_DAYS = 3

export async function POST(req: Request) {
  const isCron = Boolean(CRON_SECRET) && req.headers.get('Authorization') === `Bearer ${CRON_SECRET}`
  if (!isCron) {
    const session = await getAdminSession()
    if (!session) return NextResponse.json({ error: '권한이 없습니다' }, { status: 403 })
  }

  const config = loadPopbillConfig(process.env as Record<string, string | undefined>)
  const client = new PopbillClient(config)
  // ListBankAccount 응답에는 내부 식별자가 없다(2026-09-29 실접속으로 확인 — accountID 는 거래 조회 결과에만 있다).
  // 계좌번호 원문은 우리 DB 에 저장하지 않으므로(마이그레이션 주석), 은행코드 + 계좌번호 끝 4자리를 account_ref 로 쓴다.
  const accounts = await listBankAccounts(client) as Array<{ bankCode: string; accountNumber: string; state: number }>
  const active = accounts
    .filter(a => a.state === 1)
    .map(a => ({ ...a, accountRef: `${a.bankCode}-${a.accountNumber.slice(-4)}` }))

  const db = createAdminClient()
  const startDate = getKstDateOffset(-LOOKBACK_DAYS).replace(/-/g, '')
  const endDate = getKstToday().replace(/-/g, '')

  const results: Array<{ accountRef: string; jobId: string | null; fetched: number; saved: number; error: string | null }> = []
  for (const acc of active) {
    try {
      const r = await collectBankTransactions(db, client, {
        accountRef: acc.accountRef, bankCode: acc.bankCode, accountNumber: acc.accountNumber, startDate, endDate,
      })
      results.push({ accountRef: acc.accountRef, jobId: r.jobId, fetched: r.fetched, saved: r.saved, error: null })
    } catch (e) {
      console.error('[bank-sync/collect] 계좌 수집 실패', acc.accountRef, e)
      results.push({ accountRef: acc.accountRef, jobId: null, fetched: 0, saved: 0, error: e instanceof Error ? e.message : String(e) })
    }
  }

  return NextResponse.json({ success: true, results })
}
