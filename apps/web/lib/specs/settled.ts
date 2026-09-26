/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * 확정됐거나 완납된 정산서에 들어 있는 명세서 id.
 *
 * 그런 명세서는 청구가 끝난 금액이라 발주가 바뀌거나 지워져도 소급해서 고치지 않는다
 * (받은 돈·확정한 금액은 그때 청구한 값이다). 「발주 기준 재생성」 이 지난 날짜를 덮어쓰거나,
 * 발주를 지우면서 명세서를 함께 정리할 때 이 함수로 건너뛸 것을 가린다.
 *
 * 완납 = 그 정산서의 미수금 행이 하나 이상 있고 전부 paid. 부분입금은 아직 고칠 수 있다(미수금이 차액을 따라간다).
 */
export async function settledSpecIds(db: any, specIds: string[]): Promise<Set<string>> {
  if (!specIds.length) return new Set()

  const { data: lines } = await db
    .from('sales_statement_lines').select('sales_statement_id, source_doc_id')
    .eq('source_doc_type', 'daily_spec').in('source_doc_id', specIds)
  const stmtIds = [...new Set((lines ?? []).map((l: { sales_statement_id: string }) => l.sales_statement_id))] as string[]
  if (!stmtIds.length) return new Set()

  const [{ data: stmts }, { data: recvs }] = await Promise.all([
    db.from('sales_statements').select('id, confirmed_at').in('id', stmtIds),
    db.from('receivables').select('statement_id, status').in('statement_id', stmtIds),
  ])

  const settledStmt = new Set<string>(
    (stmts ?? []).filter((s: { confirmed_at: string | null }) => s.confirmed_at).map((s: { id: string }) => s.id))
  const byStmt = new Map<string, string[]>()
  for (const r of (recvs ?? []) as Array<{ statement_id: string; status: string }>) {
    byStmt.set(r.statement_id, [...(byStmt.get(r.statement_id) ?? []), r.status])
  }
  for (const [id, statuses] of byStmt) {
    if (statuses.length > 0 && statuses.every(s => s === 'paid')) settledStmt.add(id)
  }

  const out = new Set<string>()
  for (const l of (lines ?? []) as Array<{ sales_statement_id: string; source_doc_id: string }>) {
    if (settledStmt.has(l.sales_statement_id)) out.add(l.source_doc_id)
  }
  return out
}
