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

import { isConfirmed } from '@/lib/settlement/confirm'
import { selectSpecsForStatement } from '@/lib/settlement/spec-selection'

export type Cycle = 'daily' | 'weekly' | 'monthly'

/**
 * 해당 영업일이 속한 정산 기간. weekly 는 일요일 시작(일~토).
 *
 * 예전에는 월~일 이었는데, 정산을 토요일에 하기 때문에 토요일에는 그 주가 아직
 * 끝나지 않아 정산할 수 없었다. 일요일 배송은 두 달간 3건뿐이라 토요일이 사실상
 * 마지막 영업일이다. 그래서 마감을 토요일로 옮긴다(2026-08-01 결정).
 */
export function periodRangeFor(cycle: Cycle, businessDate: string): { start: string; end: string } {
  const d = new Date(`${businessDate}T00:00:00Z`)
  if (cycle === 'daily') {
    return { start: businessDate, end: businessDate }
  }
  if (cycle === 'weekly') {
    const dow = d.getUTCDay()               // 0=일 … 6=토
    const start = new Date(d)
    start.setUTCDate(d.getUTCDate() - dow)  // 그 주 일요일로
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
 * skipSettled=true 면 이미 완납된 정산서는 건드리지 않는다. 완납 건은 소급 청구하지
 * 않기로 했으므로, 명세서가 뒤늦게 바뀌어도 청구액을 되살리지 않는다.
 */
export async function generateStatements(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  businessDate: string,
  options: { force?: boolean; restaurantIds?: string[]; skipSettled?: boolean } = {},
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

    // 이 기간의 명세서 + 확정 뒤에 생겨 담길 곳이 없어진 지난 명세서.
    // 그냥 두면 돈이 사라진다 (2026-08-09 천호점 211,900).
    const specs = await selectSpecsForStatement(db, rest.id, start, end)

    if (!specs.length) {
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
      // 확정된 정산서는 금액을 바꾸지 않는다. 거래처에 넘긴 숫자다.
      // 완납(skipSettled)과 다르다 — 부분수금 상태에서도 잠겨야 한다.
      if (await isConfirmed(db, existingStmt.id)) {
        result.skipped++
        result.details.push({
          restaurant: name, cycle, period: `${start}~${end}`,
          amount: Number(existingStmt.total_amount ?? 0), action: '확정건너뜀',
        })
        continue
      }
      if (options.skipSettled) {
        const { data: rs } = await db
          .from('receivables').select('status').eq('statement_id', existingStmt.id)
        if (rs?.length && rs.every((r: { status: string }) => r.status === 'paid')) {
          result.skipped++
          continue
        }
      }
      statementId = existingStmt.id
      // 총액이 같아도 라인은 반드시 다시 만든다.
      // 예전에는 여기서 continue 로 빠져나가 라인 재구성을 건너뛰었다. 그런데
      // 명세서가 새로 만들어져 id 만 바뀌면 금액은 그대로이므로 "변경없음" 이 되어,
      // 정산서가 없어진 명세서를 가리키는 고아 라인이 영원히 남았다.
      // (찬란한 아구 강남 7/20~26 — 고아 435,500 과 미포함 명세서 435,500 이 상쇄)
      const amountChanged = Math.abs(Number(existingStmt.total_amount ?? 0) - total) >= 0.5
      action = amountChanged ? '금액갱신' : '라인정정'
      if (amountChanged) {
        await db.from('sales_statements').update({ total_amount: total }).eq('id', statementId)
      }
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
