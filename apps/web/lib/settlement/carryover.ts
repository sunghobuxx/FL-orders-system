/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * 이전 미수금.
 *
 * 같은 값을 화면마다 제각각 계산하고 있었다.
 *   어드민 화면        정산서 총액 − 당기 명세서 합 (역산)
 *   어드민 프린트      항목 자체가 없음
 *   회원 앱 정산       다른 정산서의 receivables.balance 합  ← 이것만 옳다
 *
 * 역산은 "정산서 총액에 이월분이 들어 있다" 는 전제인데, generateStatements 는
 * 총액을 당기 명세서 합계로만 만든다. 그래서 차액이 늘 0 이 되어 이전 미수금이
 * 영원히 0 으로 나왔다. 2026-08-01 기준 16곳이 이 상태였다(월미당 38,500 등).
 *
 * 미수금의 기준은 receivables.balance 다. 역산하지 않고 그대로 읽는다.
 */
export interface Carryover {
  /** 이 정산서를 뺀 나머지 미납 잔액 합 */
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
): Promise<Carryover> {
  const { data } = await db
    .from('receivables')
    .select('balance')
    .eq('restaurant_id', restaurantId)
    .in('status', ['unpaid', 'partial', 'overdue'])
    .neq('statement_id', statementId)

  const previous = (data ?? []).reduce(
    (sum: number, r: { balance: unknown }) => sum + Number(r.balance ?? 0), 0)

  return { previous, current: currentOutstanding, totalDue: previous + currentOutstanding }
}
