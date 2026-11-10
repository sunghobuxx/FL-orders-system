/* eslint-disable @typescript-eslint/no-explicit-any */
import { normalizeDepositor } from '@/lib/payments/depositor'
import { getJobState, requestJob, searchTransactions } from './easyfinbank'
import { normalizeTransaction, type PopbillTransactionRow } from './normalize'
import type { PopbillClient } from './client'

/**
 * 계좌조회 한 사이클: 수집 요청 → 완료까지 상태 폴링 → 전 페이지 조회 → 저장.
 *
 * 이미 반영된 거래는 DB 의 `unique(account_ref, provider_tid)` 가 걸러낸다(`ignoreDuplicates`) —
 * 겹쳐서 재수집해도 중복 저장되지 않는다. 실패(jobState 4)나 완료됐지만 errorCode 가 1 이 아닌 경우,
 * 정해진 횟수 안에 끝나지 않은 경우는 모두 예외를 던진다 — 이 사이클은 아무것도 저장하지 않은 채 끝나고,
 * 크론이 다음 회차에 같은 기간으로 다시 시도한다(겹쳐 조회하므로 이번 실패로 거래가 빠지지 않는다).
 */

type Client = Pick<PopbillClient, 'request'>

export interface CollectArgs {
  /** 우리 DB 의 account_ref — 팝빌 accountID(내부 계좌 식별자)를 그대로 쓴다. 실제 계좌번호는 저장하지 않는다. */
  accountRef: string
  bankCode: string
  accountNumber: string
  /** yyyyMMdd */
  startDate: string
  endDate: string
}

export interface CollectResult {
  jobId: string
  fetched: number
  saved: number
}

const PER_PAGE = 1000

export async function collectBankTransactions(
  db: any,
  client: Client,
  args: CollectArgs,
  opts: { pollAttempts?: number; pollDelayMs?: number } = {},
): Promise<CollectResult> {
  const pollAttempts = opts.pollAttempts ?? 15
  const pollDelayMs = opts.pollDelayMs ?? 2000

  const jobId = await requestJob(client, {
    bankCode: args.bankCode, accountNumber: args.accountNumber, startDate: args.startDate, endDate: args.endDate,
  })

  let state: { jobState?: number; errorCode?: number; errorReason?: string } = {}
  let settled = false
  for (let i = 0; i < pollAttempts; i++) {
    state = await getJobState(client, jobId) as typeof state
    if (state.jobState === 3 || state.jobState === 4) { settled = true; break }
    if (i < pollAttempts - 1) await new Promise(r => setTimeout(r, pollDelayMs))
  }
  if (!settled) throw new Error(`팝빌 계좌조회 결과 불명(시간 초과): jobID=${jobId}`)
  if (state.jobState === 4 || state.errorCode !== 1) {
    throw new Error(`팝빌 계좌조회 수집 실패: ${state.errorReason ?? '알 수 없는 오류'} (jobID=${jobId})`)
  }

  const rows: PopbillTransactionRow[] = []
  for (let page = 1; ; page++) {
    const res = await searchTransactions(client, jobId, { page, perPage: PER_PAGE, order: 'A' }) as { list?: PopbillTransactionRow[] }
    const list = res.list ?? []
    rows.push(...list)
    if (list.length < PER_PAGE) break
  }

  if (rows.length === 0) return { jobId, fetched: 0, saved: 0 }

  const payload = rows.map(row => {
    const n = normalizeTransaction(row, { accountRef: args.accountRef, bankCode: args.bankCode })
    return {
      account_ref: n.accountRef,
      provider_tid: n.providerTid,
      trdt: n.trdt,
      direction: n.direction,
      amount: n.amount,
      balance: n.balance,
      depositor_raw: n.depositorRaw,
      depositor_norm: n.depositorRaw ? normalizeDepositor(n.depositorRaw) : null,
      raw: n.raw,
    }
  })

  // 같은 거래인데 provider_tid 만 다른 경우를 거른다 — 팝빌 환경이 바뀌거나(테스트→운영, 2026-11-10)
  // 계좌를 다시 등록하면 tid 앞부분이 바뀌어 unique(account_ref, provider_tid) 로는 못 거른다.
  // 시각·입출금·금액·거래후잔액이 모두 같으면 같은 거래로 본다.
  const times = payload.map(p => Date.parse(p.trdt))
  const { data: existing, error: existErr } = await db
    .from('bank_transactions')
    .select('provider_tid, trdt, direction, amount, balance')
    .eq('account_ref', args.accountRef)
    .gte('trdt', new Date(Math.min(...times)).toISOString())
    .lte('trdt', new Date(Math.max(...times)).toISOString())
  if (existErr) throw existErr
  const keyOf = (r: { trdt: string; direction: string; amount: unknown; balance: unknown }) =>
    `${Date.parse(r.trdt)}|${r.direction}|${Number(r.amount)}|${r.balance == null ? '' : Number(r.balance)}`
  const known = new Map<string, string>()
  for (const r of existing ?? []) known.set(keyOf(r), r.provider_tid)
  const fresh = payload.filter(p => {
    const tid = known.get(keyOf(p))
    return tid === undefined || tid === p.provider_tid
  })
  if (fresh.length === 0) return { jobId, fetched: rows.length, saved: 0 }

  const { data, error } = await db
    .from('bank_transactions')
    .upsert(fresh, { onConflict: 'account_ref,provider_tid', ignoreDuplicates: true })
    .select('id')
  if (error) throw error

  return { jobId, fetched: rows.length, saved: (data ?? []).length }
}
