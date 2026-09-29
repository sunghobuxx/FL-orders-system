import { normalizeDepositor } from './depositor'

/**
 * 은행 거래를 특정 업체의 입금으로 반영하는 핵심 로직. 「입금 확인」 화면의 수동 확정(confirm-bank-transaction
 * 라우트)과 auto-match 배치(자동확정)가 여기를 똑같이 부른다 — 둘 다 record_receivable_payment RPC 호출과
 * 성공 시 입금자 별칭 자동 등록을 그대로 반복하면 한쪽만 고치고 잊는 사고가 나기 쉽다(2026-09-29 리팩터).
 *
 * 실제 반영·행 잠금·거래 멱등은 `record_receivable_payment` DB 함수가 한다. 여기서는 그 함수를 부르고
 * 결과를 판별하기 쉬운 모양으로 바꾸는 것과, 성공했을 때만 별칭을 남기는 것까지만 한다.
 * HTTP 상태 코드 매핑(400/404/409 등)은 호출하는 쪽(라우트)의 몫이다 — 여기서는 원인만 돌려준다.
 */

export type ApplyMatchResult =
  | { ok: true; alreadyPosted: boolean; applied: number; updatedCount: number }
  | { ok: false; reason: 'NOT_FOUND' }
  | { ok: false; reason: 'NOT_INBOUND' }
  | { ok: false; reason: 'ALREADY_POSTED_OTHER' }
  | { ok: false; reason: 'RPC_ERROR'; message: string; details?: string }

export async function applyMatch(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  { bankTransactionId, restaurantId, createdBy }: { bankTransactionId: string; restaurantId: string; createdBy: string | null },
): Promise<ApplyMatchResult> {
  const { data: tx } = await db
    .from('bank_transactions')
    .select('id, direction, amount, trdt, posted_at, posted_restaurant_id, depositor_raw, depositor_norm')
    .eq('id', bankTransactionId)
    .maybeSingle()
  if (!tx) return { ok: false, reason: 'NOT_FOUND' }
  if (tx.direction !== 'in') return { ok: false, reason: 'NOT_INBOUND' }
  // 이미 다른 업체로 반영된 거래는 자동으로 바꾸지 않는다(2026-09-26 리뷰 지적). 같은 업체로 다시 부른 건
  // 중복(재확정)으로 보고 record_receivable_payment 의 already_posted 로 넘긴다.
  if (tx.posted_at && tx.posted_restaurant_id !== restaurantId) return { ok: false, reason: 'ALREADY_POSTED_OTHER' }

  const { data, error } = await db.rpc('record_receivable_payment', {
    p_restaurant_id: restaurantId,
    p_amount: tx.amount,
    p_method: 'transfer',
    p_paid_at: tx.trdt,
    p_created_by: createdBy,
    p_bank_transaction_id: bankTransactionId,
  })
  if (error) return { ok: false, reason: 'RPC_ERROR', message: error.message, details: error.details }

  // 처음 확정될 때(중복 클릭/재실행이 아닐 때)만 입금자명을 업체 별칭으로 남긴다.
  if (!data?.already_posted) {
    const alias = normalizeDepositor(tx.depositor_raw)
    if (alias) {
      const { error: aliasError } = await db
        .from('depositor_aliases')
        .insert({ restaurant_id: restaurantId, alias_raw: tx.depositor_raw, alias_norm: alias, created_by: createdBy })
      if (aliasError && aliasError.code !== '23505' && !/duplicate key/.test(aliasError.message ?? '')) {
        console.error('[apply-match] 별칭 자동 등록 실패', aliasError)
      }
    }
  }

  return { ok: true, alreadyPosted: Boolean(data?.already_posted), applied: data?.applied ?? 0, updatedCount: data?.updated_count ?? 0 }
}
