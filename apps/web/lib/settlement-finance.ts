import { createAdminClient } from '@/lib/supabase/admin'
import { isConfirmed } from '@/lib/settlement/confirm'

/**
 * 정산서 총액이 바뀌었을 때의 새 미수금을 구한다.
 *
 * 미수금의 ground truth 는 `receivables.balance` 다. payments 로 다시 계산하면 안 된다 —
 * 입금 레코드 없이 잔액만 0으로 정리한 이력이 있어서, 재계산하면 이미 완납된 정산서에
 * 유령 미수금이 되살아난다. (2026-07-26 실제로 발생)
 *
 * 그래서 총액이 움직인 만큼(delta)만 기존 잔액에 반영한다.
 */
export async function computeOutstanding(
  salesStatementId: string,
  newTotal: number,
): Promise<number> {
  const db = createAdminClient()

  const [{ data: stmt }, { data: receivables }] = await Promise.all([
    db.from('sales_statements').select('total_amount').eq('id', salesStatementId).maybeSingle(),
    db.from('receivables').select('balance').eq('statement_id', salesStatementId),
  ])

  // 미수금 레코드가 없으면 아직 정산 전 — 총액이 그대로 미수금이다.
  if (!receivables?.length) return newTotal

  const currentBalance = receivables.reduce((s, r) => s + Number(r.balance ?? 0), 0)
  const delta = newTotal - Number(stmt?.total_amount ?? newTotal)
  return Math.max(0, currentBalance + delta)
}

/**
 * 정산서 총액과 미수금을 맞춘다.
 *
 * **확정된 정산서는 건드리지 않는다.** 거래처에 넘긴 금액이 나중에 바뀌면 안 된다.
 * 이 함수를 경유하는 9곳(단가 재적용·명세서 라인 수정·발주 품목 삭제 등)이 여기서
 * 함께 막힌다. 라우트마다 검사를 흩어 놓으면 새 라우트가 생길 때 또 뚫린다.
 *
 * 여기서는 에러를 던지지 않고 조용히 건너뛴다. 04:00 크론처럼 여러 업체를 한 번에
 * 도는 흐름이 확정 건 하나 때문에 통째로 죽으면 안 되기 때문이다.
 * 그래도 뚫리는 경로가 있으면 DB 트리거가 마지막으로 막는다
 * (migration 20260810010000_lock_confirmed_statement_total).
 *
 * @param db 테스트에서 가짜 객체를 넣기 위한 것. 운영에서는 생략한다.
 * @returns 실제로 반영했으면 true, 확정되어 건너뛰었으면 false
 */
export async function syncStatementFinance(
  salesStatementId: string,
  newTotal: number,
  outstanding: number,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any = createAdminClient(),
): Promise<boolean> {
  if (await isConfirmed(db, salesStatementId)) {
    console.log('[syncStatementFinance] 확정된 정산서라 건너뜀', salesStatementId)
    return false
  }

  await db
    .from('sales_statements')
    .update({ total_amount: newTotal, outstanding_amount: outstanding })
    .eq('id', salesStatementId)

  const { data: receivables } = await db
    .from('receivables')
    .select('id, status')
    .eq('statement_id', salesStatementId)

  if (!receivables?.length) return true

  const status = outstanding === 0 ? 'paid' : (outstanding < newTotal ? 'partial' : 'unpaid')

  if (receivables.length === 1) {
    await db
      .from('receivables')
      .update({ balance: outstanding, status })
      .eq('id', receivables[0].id)
  } else {
    // 미납 receivable 중 첫 번째 업데이트
    const unpaid = receivables.find((r: { status: string }) => r.status !== 'paid')
    if (unpaid) {
      await db
        .from('receivables')
        .update({ balance: outstanding, status })
        .eq('id', unpaid.id)
    }
  }
  return true
}
