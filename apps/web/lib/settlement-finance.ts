import { createAdminClient } from '@/lib/supabase/admin'

export async function computeOutstanding(
  salesStatementId: string,
  newTotal: number,
): Promise<number> {
  const db = createAdminClient()

  const { data: receivables } = await db
    .from('receivables')
    .select('id')
    .eq('statement_id', salesStatementId)

  if (!receivables?.length) return newTotal

  const receivableIds = receivables.map(r => r.id)
  const { data: payments } = await db
    .from('payments')
    .select('amount')
    .eq('target_type', 'receivable')
    .in('target_id', receivableIds)
    .eq('direction', 'inbound')

  const totalPaid = (payments ?? []).reduce((s, p) => s + Number(p.amount), 0)
  return Math.max(0, newTotal - totalPaid)
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
