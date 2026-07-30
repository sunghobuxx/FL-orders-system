/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * 명세서 → 정산서 → 미수금 정합성 점검. 읽기만 한다.
 *
 * 맞춰야 하는 것은 **명세서 = 정산서 = 미수금** 이다.
 * 발주와 명세서가 다른 것은 정상이다 — 관리자가 수량·금액을 고치는 게 1순위 규칙이다.
 * 그래서 발주는 보지 않는다.
 *
 * 이미 입금이 끝난(완납) 건은 소급 청구하지 않기로 했으므로 `settled` 로 따로 센다.
 * 마감 전에 고쳐야 하는 것은 `open` 쪽이다.
 */

export interface IntegrityItem {
  code: string
  label: string
  restaurant: string
  period: string
  detail: string
  amount: number
  settled: boolean
}

export interface IntegrityResult
  extends Record<string, unknown> {
  checkedAt: string
  openCount: number
  settledCount: number
  items: IntegrityItem[]
}

const LABEL: Record<string, string> = {
  SPEC_TOTAL: '명세서 총액 ≠ 라인 합',
  ZERO_PRICE: '명세서 단가 0원',
  NOT_BILLED: '명세서가 정산서에 미포함',
  AMOUNT_DIFF: '정산서 청구액 ≠ 명세서 총액',
  ORPHAN: '정산서가 없어진 명세서 참조',
  STMT_TOTAL: '정산서 총액 ≠ 라인 합',
  NO_RECEIVABLE: '마감 기간인데 미수금 없음',
  DOUBLE_BILLED: '한 명세서가 정산서 두 곳에 청구',
}

/** PostgREST 는 한 번에 1000행까지만 준다. */
async function all(db: any, table: string, select: string, tweak?: (q: any) => any) {
  const rows: any[] = []
  for (let from = 0; ; from += 1000) {
    let q = db.from(table).select(select).range(from, from + 999)
    if (tweak) q = tweak(q)
    const { data, error } = await q
    if (error) throw error
    rows.push(...(data ?? []))
    if ((data?.length ?? 0) < 1000) return rows
  }
}

export async function checkIntegrity(db: any, since: string): Promise<IntegrityResult> {
  const [orgRows, restRows, specRows, lineRows, periodRows, stmtRows, stmtLineRows, recvRows] =
    await Promise.all([
      all(db, 'organizations', 'id, name'),
      all(db, 'restaurants', 'id, organization_id'),
      all(db, 'daily_specs', 'id, restaurant_id, business_date, total_amount'),
      all(db, 'daily_spec_lines', 'daily_spec_id, product_id, unit_price, amount, vat_amount'),
      all(db, 'settlement_periods', 'id, start_date, end_date, period_type'),
      all(db, 'sales_statements', 'id, restaurant_id, settlement_period_id, total_amount'),
      all(db, 'sales_statement_lines', 'sales_statement_id, source_doc_type, source_doc_id, amount'),
      all(db, 'receivables', 'id, statement_id, balance, status'),
    ])

  const orgName = new Map(orgRows.map(o => [o.id, o.name]))
  const restName = new Map(restRows.map(r => [r.id, orgName.get(r.organization_id) ?? '?']))
  const specById = new Map(specRows.map(s => [s.id, s]))
  const periodById = new Map(periodRows.map(p => [p.id, p]))

  const specLines = new Map<string, any[]>()
  for (const l of lineRows) {
    const arr = specLines.get(l.daily_spec_id)
    if (arr) arr.push(l)
    else specLines.set(l.daily_spec_id, [l])
  }
  const stmtLines = new Map<string, any[]>()
  for (const l of stmtLineRows) {
    const arr = stmtLines.get(l.sales_statement_id)
    if (arr) arr.push(l)
    else stmtLines.set(l.sales_statement_id, [l])
  }
  const recvByStmt = new Map<string, any[]>()
  for (const r of recvRows) {
    const arr = recvByStmt.get(r.statement_id)
    if (arr) arr.push(r)
    else recvByStmt.set(r.statement_id, [r])
  }
  const isSettled = (stmtId: string) => {
    const rs = recvByStmt.get(stmtId) ?? []
    return rs.length > 0 && rs.every(r => r.status === 'paid')
  }

  const items: IntegrityItem[] = []
  const push = (code: string, restaurant: string, period: string, detail: string,
                amount: number, settled: boolean) =>
    items.push({ code, label: LABEL[code], restaurant, period, detail, amount, settled })

  const today = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10)

  // 명세서 → 어느 정산서에 물렸는지 (중복 청구 판별에도 쓴다)
  const stmtsOfSpec = new Map<string, string[]>()
  for (const st of stmtRows) {
    for (const l of stmtLines.get(st.id) ?? []) {
      if (l.source_doc_type !== 'daily_spec') continue
      const arr = stmtsOfSpec.get(l.source_doc_id)
      if (arr) arr.push(st.id)
      else stmtsOfSpec.set(l.source_doc_id, [st.id])
    }
  }

  for (const s of specRows) {
    if (s.business_date < since) continue
    const name = restName.get(s.restaurant_id) ?? '?'
    if (name === '테스트 식당') continue
    const ls = specLines.get(s.id) ?? []
    const sum = ls.reduce((a, l) => a + Number(l.amount ?? 0) + Number(l.vat_amount ?? 0), 0)
    const total = Number(s.total_amount ?? 0)
    const settled = (stmtsOfSpec.get(s.id) ?? []).some(isSettled)
    if (Math.abs(sum - total) > 0.5) {
      push('SPEC_TOTAL', name, s.business_date,
           `총액 ${total.toLocaleString('ko-KR')} / 라인 ${sum.toLocaleString('ko-KR')}`,
           sum - total, settled)
    }
    const zero = ls.filter(l => Number(l.unit_price ?? 0) === 0).length
    if (zero > 0) {
      push('ZERO_PRICE', name, s.business_date, `${zero}개 품목`, 0, settled)
    }
  }

  for (const [specId, stmtIds] of stmtsOfSpec) {
    if (stmtIds.length < 2) continue
    const sp = specById.get(specId)
    if (!sp || sp.business_date < since) continue
    const name = restName.get(sp.restaurant_id) ?? '?'
    if (name === '테스트 식당') continue
    push('DOUBLE_BILLED', name, sp.business_date,
         `정산서 ${stmtIds.length}곳`, Number(sp.total_amount ?? 0),
         stmtIds.some(isSettled))
  }

  const specsByRest = new Map<string, any[]>()
  for (const s of specRows) {
    const arr = specsByRest.get(s.restaurant_id)
    if (arr) arr.push(s)
    else specsByRest.set(s.restaurant_id, [s])
  }

  for (const st of stmtRows) {
    const p = periodById.get(st.settlement_period_id)
    if (!p || p.end_date < since) continue
    const name = restName.get(st.restaurant_id) ?? '?'
    if (name === '테스트 식당') continue
    const period = `${p.start_date}~${p.end_date}`
    const settled = isSettled(st.id)
    const ls = stmtLines.get(st.id) ?? []
    const total = Number(st.total_amount ?? 0)

    const lineSum = ls.reduce((a, l) => a + Number(l.amount ?? 0), 0)
    if (Math.abs(lineSum - total) > 0.5) {
      push('STMT_TOTAL', name, period,
           `총액 ${total.toLocaleString('ko-KR')} / 라인 ${lineSum.toLocaleString('ko-KR')}`,
           lineSum - total, settled)
    }

    const covered = new Set<string>()
    for (const l of ls) {
      if (l.source_doc_type !== 'daily_spec') continue
      covered.add(l.source_doc_id)
      const sp = specById.get(l.source_doc_id)
      if (!sp) {
        push('ORPHAN', name, period, `${Number(l.amount ?? 0).toLocaleString('ko-KR')}원`,
             Number(l.amount ?? 0), settled)
      } else if (Math.abs(Number(l.amount ?? 0) - Number(sp.total_amount ?? 0)) > 0.5) {
        push('AMOUNT_DIFF', name, sp.business_date,
             `청구 ${Number(l.amount ?? 0).toLocaleString('ko-KR')} / 명세서 ${Number(sp.total_amount ?? 0).toLocaleString('ko-KR')}`,
             Number(sp.total_amount ?? 0) - Number(l.amount ?? 0), settled)
      }
    }

    const mine = (specsByRest.get(st.restaurant_id) ?? [])
      .filter(s => s.business_date >= p.start_date && s.business_date <= p.end_date)
    const missing = mine.filter(s => !covered.has(s.id))
    if (missing.length) {
      const amt = missing.reduce((a, s) => a + Number(s.total_amount ?? 0), 0)
      push('NOT_BILLED', name, period,
           `${missing.length}건 (${missing.map(s => s.business_date.slice(5)).sort().join(', ')})`,
           amt, settled)
    }

    if (p.end_date < today && (recvByStmt.get(st.id) ?? []).length === 0 && total > 0) {
      push('NO_RECEIVABLE', name, period, `${total.toLocaleString('ko-KR')}원`, total, false)
    }
  }

  items.sort((a, b) => Number(a.settled) - Number(b.settled)
    || a.restaurant.localeCompare(b.restaurant, 'ko') || a.period.localeCompare(b.period))

  return {
    checkedAt: new Date().toISOString(),
    openCount: items.filter(i => !i.settled).length,
    settledCount: items.filter(i => i.settled).length,
    items,
  }
}
