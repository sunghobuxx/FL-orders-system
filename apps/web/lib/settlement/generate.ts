/**
 * 정산서 자동 생성.
 *
 * 지금까지 정산서(settlement_periods / sales_statements / receivables)를 만드는 코드가
 * 아예 없어서 전부 손으로 넣어왔다. 그 결과 업체별 settlement_cycle 이 지켜지지 않아
 * 월정산 업체에 주정산서가 같이 생기고(2026-07-24), 미수금 레코드가 빠진 업체가
 * 18곳이나 됐다. 이 모듈이 그 생성 규칙을 코드로 고정한다.
 *
 * 규칙
 *  - 업체의 settlement_cycle(daily/weekly/monthly)에 해당하는 정산서만 만든다
 *  - 기간 안의 daily_specs 합계를 정산서 금액으로 삼는다 (명세서가 기준)
 *  - 정산서마다 미수금(receivables)을 함께 만든다
 *  - 여러 번 돌려도 결과가 같다 (이미 있으면 갱신, 없으면 생성)
 */

export type Cycle = 'daily' | 'weekly' | 'monthly'

/** 해당 영업일이 속한 정산 기간. weekly 는 월요일 시작(월~일). */
export function periodRangeFor(cycle: Cycle, businessDate: string): { start: string; end: string } {
  const d = new Date(`${businessDate}T00:00:00Z`)
  if (cycle === 'daily') {
    return { start: businessDate, end: businessDate }
  }
  if (cycle === 'weekly') {
    const dow = d.getUTCDay()               // 0=일 … 6=토
    const backToMonday = (dow + 6) % 7      // 월요일까지 며칠 전인지
    const start = new Date(d)
    start.setUTCDate(d.getUTCDate() - backToMonday)
    const end = new Date(start)
    end.setUTCDate(start.getUTCDate() + 6)
    return { start: iso(start), end: iso(end) }
  }
  const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1))
  const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0))
  return { start: iso(start), end: iso(end) }
}

function iso(d: Date) {
  return d.toISOString().slice(0, 10)
}

/** 그 영업일이 정산 기간의 마지막 날인가 (= 정산서를 만들 시점인가) */
export function isPeriodEnd(cycle: Cycle, businessDate: string): boolean {
  return periodRangeFor(cycle, businessDate).end === businessDate
}

export interface GenerateResult {
  businessDate: string
  created: number
  updated: number
  skipped: number
  details: Array<{ restaurant: string; cycle: Cycle; period: string; amount: number; action: string }>
}

/**
 * businessDate 기준으로, 그날 정산 기간이 끝나는 업체들의 정산서를 만든다.
 * force=true 면 기간 종료일이 아니어도 현재까지의 금액으로 만든다(수동 재생성용).
 */
export async function generateStatements(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  businessDate: string,
  options: { force?: boolean; restaurantIds?: string[] } = {},
): Promise<GenerateResult> {
  const result: GenerateResult = { businessDate, created: 0, updated: 0, skipped: 0, details: [] }

  let restQuery = db
    .from('restaurants')
    .select('id, settlement_cycle, organization_id, organizations(name)')
    .eq('status', 'active')
  if (options.restaurantIds?.length) restQuery = restQuery.in('id', options.restaurantIds)
  const { data: restaurants } = await restQuery
  if (!restaurants?.length) return result

  for (const rest of restaurants) {
    const cycle = (rest.settlement_cycle ?? 'weekly') as Cycle
    const org = Array.isArray(rest.organizations) ? rest.organizations[0] : rest.organizations
    const name: string = org?.name ?? '알 수 없음'

    if (!options.force && !isPeriodEnd(cycle, businessDate)) {
      result.skipped++
      continue
    }

    const { start, end } = periodRangeFor(cycle, businessDate)

    // 이 기간의 명세서 합계 — 명세서가 청구의 기준이다
    const { data: specs } = await db
      .from('daily_specs')
      .select('id, total_amount')
      .eq('restaurant_id', rest.id)
      .gte('business_date', start)
      .lte('business_date', end)

    if (!specs?.length) {
      result.skipped++
      continue
    }
    const total = specs.reduce((s: number, x: { total_amount: number }) => s + Number(x.total_amount ?? 0), 0)
    if (total <= 0) {
      result.skipped++
      continue
    }

    // 정산 기간 (유형+기간이 unique)
    let periodId: string | null = null
    const { data: existingPeriod } = await db
      .from('settlement_periods')
      .select('id')
      .eq('period_type', cycle).eq('start_date', start).eq('end_date', end)
      .maybeSingle()
    if (existingPeriod) {
      periodId = existingPeriod.id
    } else {
      const { data: newPeriod, error } = await db
        .from('settlement_periods')
        .insert({ period_type: cycle, start_date: start, end_date: end, status: 'open' })
        .select('id').single()
      if (error || !newPeriod) { result.skipped++; continue }
      periodId = newPeriod.id
    }

    // 정산서 (기간+업체가 unique)
    const { data: existingStmt } = await db
      .from('sales_statements')
      .select('id, total_amount')
      .eq('settlement_period_id', periodId).eq('restaurant_id', rest.id)
      .maybeSingle()

    let statementId: string
    let action: string
    if (existingStmt) {
      statementId = existingStmt.id
      action = Math.abs(Number(existingStmt.total_amount ?? 0) - total) < 0.5 ? '변경없음' : '금액갱신'
      if (action === '변경없음') {
        result.skipped++
        result.details.push({ restaurant: name, cycle, period: `${start}~${end}`, amount: total, action })
        continue
      }
      await db.from('sales_statements').update({ total_amount: total }).eq('id', statementId)
      result.updated++
    } else {
      const { data: newStmt, error } = await db
        .from('sales_statements')
        .insert({ settlement_period_id: periodId, restaurant_id: rest.id, total_amount: total, outstanding_amount: total })
        .select('id').single()
      if (error || !newStmt) { result.skipped++; continue }
      statementId = newStmt.id
      action = '생성'
      result.created++
    }

    // 정산서 라인 = 기간 내 명세서들
    await db.from('sales_statement_lines').delete().eq('sales_statement_id', statementId)
    await db.from('sales_statement_lines').insert(
      specs.map((sp: { id: string; total_amount: number }) => ({
        sales_statement_id: statementId,
        source_doc_type: 'daily_spec',
        source_doc_id: sp.id,
        amount: Number(sp.total_amount ?? 0),
      })),
    )

    // 미수금 — 이미 있으면 입금분을 지키기 위해 총액 변동분만 반영한다
    const { data: existingRecv } = await db
      .from('receivables').select('id, balance, status').eq('statement_id', statementId)

    if (!existingRecv?.length) {
      await db.from('receivables').insert({
        restaurant_id: rest.id,
        statement_id: statementId,
        due_date: end,
        balance: total,
        status: 'unpaid',
      })
      await db.from('sales_statements').update({ outstanding_amount: total }).eq('id', statementId)
    } else {
      const prevTotal = Number(existingStmt?.total_amount ?? total)
      const delta = total - prevTotal
      const cur = existingRecv.reduce((s: number, r: { balance: number }) => s + Number(r.balance ?? 0), 0)
      const next = Math.max(0, cur + delta)
      const target = existingRecv.find((r: { status: string }) => r.status !== 'paid') ?? existingRecv[0]
      await db.from('receivables')
        .update({ balance: next, status: next === 0 ? 'paid' : (next < total ? 'partial' : 'unpaid') })
        .eq('id', target.id)
      await db.from('sales_statements').update({ outstanding_amount: next }).eq('id', statementId)
    }

    result.details.push({ restaurant: name, cycle, period: `${start}~${end}`, amount: total, action })
  }

  return result
}
