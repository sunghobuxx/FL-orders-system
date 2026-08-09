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
  const olderUnbilled = older.filter(s => !billedIds.has(s.id))

  // 이 기간 명세서 중 확정 정산서에 이미 담긴 것은 뺀다
  const inPeriodIds = inPeriod.map(s => s.id)
  const lockedSpecIds = new Set<string>()
  if (inPeriodIds.length) {
    const periodLines = await fetchAll<{ source_doc_id: string; sales_statement_id: string }>(() => db
      .from('sales_statement_lines')
      .select('source_doc_id, sales_statement_id')
      .eq('source_doc_type', 'daily_spec')
      .in('source_doc_id', inPeriodIds))
    const stmtIds = [...new Set(periodLines.map(l => l.sales_statement_id))]
    if (stmtIds.length) {
      const { confirmedStatementIds } = await import('@/lib/settlement/confirm')
      const confirmed = await confirmedStatementIds(db, stmtIds)
      for (const l of periodLines) {
        if (confirmed.has(l.sales_statement_id)) lockedSpecIds.add(l.source_doc_id)
      }
    }
  }

  return pickSpecs(inPeriod, olderUnbilled, lockedSpecIds)
}
