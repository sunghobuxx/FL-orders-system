/* eslint-disable @typescript-eslint/no-explicit-any */

import { fetchAll } from '@/lib/supabase/fetch-all'

/**
 * 정산서에 담을 명세서를 고른다.
 *
 * 기간으로 가르는 기준이 「명세서의 business_date」 하나였는데,
 * 「business_date + 그 명세서가 이미 확정 정산서에 담겼는지」 둘로 바뀐다.
 *
 * 확정된 정산서는 금액이 잠기므로, 그 뒤에 생긴 명세서는 담길 곳이 없어진다.
 * 그대로 두면 돈이 사라지므로 다음 기간 정산서로 넘긴다.
 * (2026-08-09 할매 천호점 — 7/13 명세서가 열흘 늦게 생겨 211,900 이 떠돌았다)
 *
 * 이월 대상을 찾는 범위는 90일이다. 그보다 오래된 것은 사람이 확인할 문제다.
 */

export type SpecRow = { id: string; business_date: string; total_amount: number }

const CARRY_FORWARD_DAYS = 90

/**
 * 이 날짜보다 앞선 명세서는 이월하지 않는다.
 *
 * 「어느 정산서에도 안 담겼다」를 미청구의 근거로 삼는데, 그 근거가 옛 데이터에는
 * 통하지 않는다. 6월 이전 정산서에는 sales_statement_lines 가 아예 없어서
 * 청구·수금이 끝난 명세서도 「미청구」로 보인다.
 *
 * 그대로 두었더니 2026-08-09 에 5월 명세서들이 그 주 청구서로 딸려 들어갔다 —
 * 4개 업체 2,249,000원. 청북점은 1,010,100 중 824,100 이 5월 것이었다.
 *
 * 사장님 판단: 밀린 옛날 건은 지금 와서 받을 수 없다. 전부 포기한다.
 * 그래서 이 날짜에 선을 긋는다. 앞으로 늦게 생기는 명세서만 이월한다.
 */
const CARRY_FORWARD_FROM = '2026-08-09'

/** 이월해 담아도 되는 명세서인지. 선 이전 것은 포기한 것으로 본다. */
export function isCarryForwardEligible(businessDate: string): boolean {
  return businessDate >= CARRY_FORWARD_FROM
}

/**
 * 담을 명세서를 정한다. db 없이 도는 순수 함수라 그대로 시험할 수 있다.
 *
 * @param inPeriod  이 기간(start~end)의 명세서
 * @param olderUnbilled  기간 이전이면서 어느 정산서에도 안 담긴 명세서
 * @param lockedSpecIds  확정된 정산서에 이미 담긴 명세서 id
 */
export function pickSpecs(
  inPeriod: SpecRow[],
  olderUnbilled: SpecRow[],
  lockedSpecIds: Set<string>,
): SpecRow[] {
  const seen = new Set<string>()
  const out: SpecRow[] = []
  for (const spec of [...olderUnbilled, ...inPeriod]) {
    if (lockedSpecIds.has(spec.id)) continue
    if (seen.has(spec.id)) continue
    seen.add(spec.id)
    out.push(spec)
  }
  return out.sort((a, b) => a.business_date.localeCompare(b.business_date))
}

/** 위 규칙대로 실제 DB 에서 골라 온다. */
export async function selectSpecsForStatement(
  db: any,
  restaurantId: string,
  start: string,
  end: string,
): Promise<SpecRow[]> {
  const carryFrom = new Date(new Date(`${start}T00:00:00Z`).getTime() - CARRY_FORWARD_DAYS * 86400_000)
    .toISOString().slice(0, 10)

  // 이 기간 + 이월 후보 범위를 한 번에 읽는다
  const specs = await fetchAll<SpecRow>(() => db
    .from('daily_specs')
    .select('id, business_date, total_amount')
    .eq('restaurant_id', restaurantId)
    .gte('business_date', carryFrom)
    .lte('business_date', end))

  const inPeriod = specs.filter(s => s.business_date >= start)
  const older = specs.filter(s => s.business_date < start)
  if (!older.length) return pickSpecs(inPeriod, [], new Set())

  // 이미 어느 정산서엔가 담긴 명세서는 이월 대상이 아니다
  const olderIds = older.map(s => s.id)
  const lines = await fetchAll<{ source_doc_id: string; sales_statement_id: string }>(() => db
    .from('sales_statement_lines')
    .select('source_doc_id, sales_statement_id')
    .eq('source_doc_type', 'daily_spec')
    .in('source_doc_id', olderIds))
  const billedIds = new Set(lines.map(l => l.source_doc_id))
  const olderUnbilled = older.filter(
    s => !billedIds.has(s.id) && isCarryForwardEligible(s.business_date))

  // 이 기간 명세서 중 **다른 정산서**에 이미 담긴 것은 뺀다.
  //
  // 예전에는 「확정된」 정산서만 걸렀다. 그래서 주기를 주→월로 바꾸면 옛 주정산
  // 정산서(미확정)가 그대로 남아 있는데 월정산이 같은 명세서를 또 담았다 —
  // 강남·공덕 8/24~25 가 두 정산서에 걸려 이중 청구가 됐다 (2026-08-29).
  // 확정 여부와 상관없이, 지금 만드는 기간이 아닌 정산서에 이미 들어갔으면 뺀다.
  const inPeriodIds = inPeriod.map(s => s.id)
  const lockedSpecIds = new Set<string>()
  if (inPeriodIds.length) {
    const periodLines = await fetchAll<{
      source_doc_id: string
      sales_statement_id: string
      sales_statements: { settlement_periods: { start_date: string; end_date: string } | null } | null
    }>(() => db
      .from('sales_statement_lines')
      .select('source_doc_id, sales_statement_id, sales_statements!inner(settlement_periods!inner(start_date, end_date))')
      .eq('source_doc_type', 'daily_spec')
      .in('source_doc_id', inPeriodIds))
    for (const l of periodLines) {
      const stmt = Array.isArray(l.sales_statements) ? l.sales_statements[0] : l.sales_statements
      const per = Array.isArray(stmt?.settlement_periods) ? stmt?.settlement_periods[0] : stmt?.settlement_periods
      // 지금 만드는 그 기간의 정산서면 건너뛴다 — 라인을 다시 짜는 중이다.
      if (per?.start_date === start && per?.end_date === end) continue
      lockedSpecIds.add(l.source_doc_id)
    }
  }

  return pickSpecs(inPeriod, olderUnbilled, lockedSpecIds)
}
