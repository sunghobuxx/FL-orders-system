/* eslint-disable @typescript-eslint/no-explicit-any */
import { computeOutstanding, syncStatementFinance } from '@/lib/settlement-finance'
import { settledSpecIds } from '@/lib/specs/settled'

/**
 * 발주(배치)를 지울 때 그 발주로 만든 명세서 줄과 정산서 금액을 함께 정리한다.
 *
 * 예전 삭제 경로(어드민·회원·배송앱)는 발주만 지우고 명세서 줄의 order_item_id 만 NULL 로 끊었다.
 * 그래서 발주를 지워도 명세서와 정산서 금액이 그대로 남았다 — 킨텍스점 9/21 발주를 지웠는데
 * 깻잎 46,000원이 주정산에 들어 있었다(2026-09-26). 연결을 끊은 것이 「발주 연결이 끊긴 줄」(7월 기준 38%)의 한 원인이기도 하다.
 *
 * 지우는 줄: 그 발주 품목(order_item_id)에 이어진 줄, 그리고 **같은 품목**(product_id) 줄.
 *   명세서는 품목 기준으로 만들어지고 연결이 자주 끊겨 있어서 연결만 보면 지울 줄을 놓친다.
 *   관리자가 손으로 넣은 **다른 품목** 줄은 남긴다.
 * 줄이 하나도 안 남으면 명세서와 그 정산서 줄도 지운다. 남으면 합계만 다시 낸다.
 * 확정됐거나 완납된 정산서에 든 날짜는 청구가 끝난 금액이라 손대지 않는다(status 'settled').
 */
export interface CleanupArgs {
  restaurantId: string
  businessDate: string
  itemIds: string[]
  productIds: string[]
}
export interface CleanupResult {
  status: 'none' | 'settled' | 'cleaned'
  removedLines: number
  removedSpec: boolean
}

export async function cleanSpecAfterBatchDelete(db: any, args: CleanupArgs): Promise<CleanupResult> {
  const none: CleanupResult = { status: 'none', removedLines: 0, removedSpec: false }

  const { data: specs } = await db
    .from('daily_specs').select('id')
    .eq('restaurant_id', args.restaurantId).eq('business_date', args.businessDate)
    .order('created_at', { ascending: true })
  const specId: string | undefined = specs?.[0]?.id
  if (!specId) return none

  const { data: lines } = await db
    .from('daily_spec_lines').select('id, product_id, order_item_id, amount, vat_amount').eq('daily_spec_id', specId)
  type Line = { id: string; product_id: string; order_item_id: string | null; amount: number; vat_amount: number }
  const all = (lines ?? []) as Line[]
  const removing = all.filter(l =>
    (l.order_item_id && args.itemIds.includes(l.order_item_id)) || args.productIds.includes(l.product_id))
  if (!removing.length) return none

  if ((await settledSpecIds(db, [specId])).has(specId)) return { ...none, status: 'settled' }

  const { error: delLinesError } = await db.from('daily_spec_lines').delete().in('id', removing.map(l => l.id))
  if (delLinesError) throw delLinesError

  const remaining = all.filter(l => !removing.includes(l))
  const { data: stmtLines } = await db
    .from('sales_statement_lines').select('id, sales_statement_id')
    .eq('source_doc_type', 'daily_spec').eq('source_doc_id', specId)
  const statementIds = [...new Set((stmtLines ?? []).map((l: { sales_statement_id: string }) => l.sales_statement_id))] as string[]

  if (!remaining.length) {
    if (stmtLines?.length) {
      const { error } = await db.from('sales_statement_lines').delete().in('id', stmtLines.map((l: { id: string }) => l.id))
      if (error) throw error
    }
    const { error } = await db.from('daily_specs').delete().eq('id', specId)
    if (error) throw error
  } else {
    const total = remaining.reduce((s, l) => s + Number(l.amount ?? 0) + Number(l.vat_amount ?? 0), 0)
    const vat = remaining.reduce((s, l) => s + Number(l.vat_amount ?? 0), 0)
    const { error } = await db.from('daily_specs').update({ total_amount: total, vat_amount: vat }).eq('id', specId)
    if (error) throw error
    for (const sl of (stmtLines ?? []) as Array<{ id: string }>) {
      const { error: slError } = await db.from('sales_statement_lines').update({ amount: total }).eq('id', sl.id)
      if (slError) throw slError
    }
  }

  // 정산서 총액(줄 합계) → 미수금 → 정산서 미수금. update-spec-line 과 같은 순서.
  for (const statementId of statementIds) {
    const { data: rows } = await db.from('sales_statement_lines').select('amount').eq('sales_statement_id', statementId)
    const statementTotal = (rows ?? []).reduce((s: number, r: { amount: number }) => s + Number(r.amount ?? 0), 0)
    const outstanding = await computeOutstanding(statementId, statementTotal)
    await syncStatementFinance(statementId, statementTotal, outstanding)
  }

  return { status: 'cleaned', removedLines: removing.length, removedSpec: remaining.length === 0 }
}
