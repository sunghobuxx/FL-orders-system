import { createAdminClient } from '@/lib/supabase/admin'

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

export async function syncStatementFinance(
  salesStatementId: string,
  newTotal: number,
  outstanding: number,
): Promise<void> {
  const db = createAdminClient()

  await db
    .from('sales_statements')
    .update({ total_amount: newTotal, outstanding_amount: outstanding })
    .eq('id', salesStatementId)

  const { data: receivables } = await db
    .from('receivables')
    .select('id, status')
    .eq('statement_id', salesStatementId)

  if (!receivables?.length) return

  const status = outstanding === 0 ? 'paid' : (outstanding < newTotal ? 'partial' : 'unpaid')

  if (receivables.length === 1) {
    await db
      .from('receivables')
      .update({ balance: outstanding, status })
      .eq('id', receivables[0].id)
  } else {
    // 미납 receivable 중 첫 번째 업데이트
    const unpaid = receivables.find(r => r.status !== 'paid')
    if (unpaid) {
      await db
        .from('receivables')
        .update({ balance: outstanding, status })
        .eq('id', unpaid.id)
    }
  }
}
