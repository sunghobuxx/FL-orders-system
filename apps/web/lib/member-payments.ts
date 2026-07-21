import { createAdminClient } from '@/lib/supabase/admin'

type PaymentResult = { ok: true; appliedAmount: number } | { ok: false; error: string }

export async function recordMemberReceivablePayment({
  userId,
  organizationId,
  amount,
  paymentKey,
  preferredReceivableId,
}: {
  userId: string
  organizationId: string
  amount: number
  paymentKey: string
  preferredReceivableId?: string | null
}): Promise<PaymentResult> {
  const db = createAdminClient()
  const receiptPath = `toss:${paymentKey}`

  const { data: duplicate } = await db
    .from('payments')
    .select('id')
    .eq('receipt_path', receiptPath)
    .limit(1)
  if ((duplicate ?? []).length > 0) return { ok: true, appliedAmount: amount }

  const { data: restaurants } = await db
    .from('restaurants')
    .select('id')
    .eq('organization_id', organizationId)
  const restaurantIds = (restaurants ?? []).map(row => row.id)
  if (restaurantIds.length === 0) return { ok: false, error: '식당 정보를 확인할 수 없습니다.' }

  const { data: rows, error: receivableError } = await db
    .from('receivables')
    .select('id, balance, due_date, status')
    .in('restaurant_id', restaurantIds)
    .neq('status', 'paid')
    .gt('balance', 0)
    .order('due_date', { ascending: true })
  if (receivableError) return { ok: false, error: receivableError.message }

  const receivables = [...(rows ?? [])]
  if (preferredReceivableId) {
    const preferredIndex = receivables.findIndex(row => row.id === preferredReceivableId)
    if (preferredIndex < 0) return { ok: false, error: '결제 대상 미수금을 확인할 수 없습니다.' }
    const [preferred] = receivables.splice(preferredIndex, 1)
    receivables.unshift(preferred)
  }

  const outstanding = receivables.reduce((sum, row) => sum + Number(row.balance), 0)
  if (!Number.isFinite(amount) || amount <= 0 || amount > outstanding) {
    return { ok: false, error: '결제 금액이 현재 미수금과 일치하지 않습니다.' }
  }

  let remaining = amount
  for (const receivable of receivables) {
    if (remaining <= 0) break
    const balance = Number(receivable.balance)
    const applied = Math.min(balance, remaining)
    const nextBalance = balance - applied

    const { error: paymentError } = await db.from('payments').insert({
      target_type: 'receivable',
      target_id: receivable.id,
      amount: applied,
      direction: 'inbound',
      method: 'card',
      paid_at: new Date().toISOString(),
      receipt_path: receiptPath,
      created_by: userId,
    })
    if (paymentError) return { ok: false, error: paymentError.message }

    const { error: updateError } = await db
      .from('receivables')
      .update({ balance: nextBalance, status: nextBalance === 0 ? 'paid' : 'partial' })
      .eq('id', receivable.id)
    if (updateError) return { ok: false, error: updateError.message }
    remaining -= applied
  }

  return { ok: true, appliedAmount: amount - remaining }
}
