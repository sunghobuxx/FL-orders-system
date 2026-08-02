/* eslint-disable @typescript-eslint/no-explicit-any */

import { fetchAll } from '@/lib/supabase/fetch-all'

/**
 * 이전 미수금 — 이 정산서 기간이 시작되기 전에 끝난 정산서들의 미납 잔액 합.
 *
 * 같은 값을 화면마다 제각각 계산하고 있었다.
 *   어드민 화면        정산서 총액 - 당기 명세서 합 (역산)
 *   어드민 프린트      항목 자체가 없음
 * 역산은 "정산서 총액에 이월분이 들어 있다" 는 전제인데, generateStatements 는
 * 총액을 당기 명세서 합계로만 만든다. 그래서 차액이 늘 0 이 되어 이전 미수금이
 * 영원히 0 으로 나왔다(2026-08-01 기준 16곳).
 *
 * 미수금의 기준은 receivables.balance 다. 역산하지 않고 그대로 읽는다.
 *
 * **기간을 반드시 본다.** 자기 자신만 빼고 전부 더하면 지난 정산서를 열었을 때
 * 그 뒤에 생긴 정산서까지 "이전 미수금" 으로 잡힌다.
 * (2026-08-02 정직한 푸드 7월 4주에 368,500 원이 떴는데, 전부 그 다음 주들 금액이었다)
 */
export interface Carryover {
  /** 이 기간 시작 전에 끝난 정산서들의 미납 잔액 합 */
  previous: number
  /** 이 정산서의 미수금 */
  current: number
  /** 받아야 할 총액 */
  totalDue: number
}

export async function getCarryover(
  db: any,
  restaurantId: string,
  statementId: string,
  currentOutstanding: number,
  periodStart: string | null,
): Promise<Carryover> {
  const empty = { previous: 0, current: currentOutstanding, totalDue: currentOutstanding }
  if (!periodStart) return empty

  const stmts = await fetchAll<{
    id: string
    settlement_periods: { end_date: string } | null
  }>(() => db
    .from('sales_statements')
    .select('id, settlement_periods(end_date)')
    .eq('restaurant_id', restaurantId))

  // 이 기간이 시작하기 전에 끝난 정산서만 이전분이다.
  const earlier = new Set(
    stmts
      .filter(s => s.id !== statementId)
      .filter(s => {
        const end = (s.settlement_periods as { end_date: string } | null)?.end_date
        return Boolean(end) && end! < periodStart
      })
      .map(s => s.id),
  )
  if (!earlier.size) return empty

  const recv = await fetchAll<{ statement_id: string; balance: number }>(() => db
    .from('receivables')
    .select('statement_id, balance')
    .eq('restaurant_id', restaurantId)
    .in('status', ['unpaid', 'partial', 'overdue']))

  const previous = recv
    .filter(r => earlier.has(r.statement_id))
    .reduce((sum, r) => sum + Number(r.balance ?? 0), 0)

  return { previous, current: currentOutstanding, totalDue: previous + currentOutstanding }
}
