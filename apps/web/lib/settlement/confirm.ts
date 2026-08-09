/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * 정산서 확정(잠금) 판정.
 *
 * 확정된 정산서는 금액을 바꾸지 않는다. 거래처에 넘긴 숫자가 나중에 달라지면
 * 시스템 계산을 믿지 못하게 된다.
 *
 * 완납(skipSettled)과는 다르다. 완납은 「돈을 다 받았다」이고 확정은 「금액을 넘겼다」다.
 * 부분수금 상태에서도 잠겨야 한다 — 천호점이 그 틈으로 샜다.
 */

export async function isConfirmed(db: any, statementId: string): Promise<boolean> {
  if (!statementId) return false
  const { data } = await db
    .from('sales_statements')
    .select('confirmed_at')
    .eq('id', statementId)
    .maybeSingle()
  return Boolean(data?.confirmed_at)
}

/** 여러 건을 한 번에 판정한다. 정산서마다 조회하면 확정 화면이 느려진다. */
export async function confirmedStatementIds(
  db: any,
  statementIds: string[],
): Promise<Set<string>> {
  if (!statementIds.length) return new Set()
  const { data } = await db
    .from('sales_statements')
    .select('id, confirmed_at')
    .in('id', statementIds)
  return new Set(
    (data ?? [])
      .filter((r: { confirmed_at: string | null }) => Boolean(r.confirmed_at))
      .map((r: { id: string }) => r.id),
  )
}
