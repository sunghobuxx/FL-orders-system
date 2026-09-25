/**
 * 당일 단가 확정 상태 로더.
 *
 * price_confirmations(확정 시각)와 price_day_last_change(날짜별 마지막 단가 등록 시각)를 읽어
 * price-status.ts 의 priceStatus 로 상태를 만든다. **service role 클라이언트**를 넘긴다
 * (새 표는 RLS 를 켜고 정책을 두지 않았다).
 *
 * 날짜 수·명세서 수만큼만 조회한다. 시행일 이전 날짜는 조회하지 않는다.
 * 조회 오류는 던진다 — 상태는 부가 정보라서 호출자가 잡고 상태만 생략한다.
 */
import { NO_PRICE_STATUS, PRICE_STATUS_FROM, priceStatus, type PriceStatusResult } from './price-status'

/* eslint-disable @typescript-eslint/no-explicit-any */
type Db = any

export interface SpecRef { id: string; business_date: string }

const CHUNK = 100

function chunks<T>(list: T[], size = CHUNK): T[][] {
  const out: T[][] = []
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size))
  return out
}

interface Raw { confirmedAt: string | null; lastPriceAt: string | null }

async function loadRaw(db: Db, dates: string[]): Promise<Map<string, Raw>> {
  const [conf, last] = await Promise.all([
    db.from('price_confirmations').select('business_date, confirmed_at').in('business_date', dates),
    db.from('price_day_last_change').select('business_date, last_price_at').in('business_date', dates),
  ])
  if (conf.error) throw new Error(`price_confirmations 조회 실패: ${conf.error.message}`)
  if (last.error) throw new Error(`price_day_last_change 조회 실패: ${last.error.message}`)

  const raw = new Map<string, Raw>(dates.map(d => [d, { confirmedAt: null, lastPriceAt: null }]))
  for (const r of conf.data ?? []) raw.get(r.business_date)!.confirmedAt = r.confirmed_at
  for (const r of last.data ?? []) raw.get(r.business_date)!.lastPriceAt = r.last_price_at
  return raw
}

/** 날짜별 상태. 정산서 확정 여부는 보지 않는다(final 없음). 키 = 날짜. */
export async function loadDateStatuses(
  db: Db, dates: string[], from: string = PRICE_STATUS_FROM,
): Promise<Map<string, PriceStatusResult>> {
  const unique = [...new Set(dates)]
  const result = new Map<string, PriceStatusResult>(unique.map(d => [d, NO_PRICE_STATUS]))
  const eligible = unique.filter(d => d >= from)
  if (!eligible.length) return result

  const raw = await loadRaw(db, eligible)
  for (const date of eligible) {
    const r = raw.get(date)!
    result.set(date, priceStatus({ date, ...r, statementConfirmed: false, from }))
  }
  return result
}

/** 명세서별 상태. 그 명세서를 포함한 정산서가 확정됐으면 final. 키 = 명세서 id. */
export async function loadSpecStatuses(
  db: Db, specs: SpecRef[], from: string = PRICE_STATUS_FROM,
): Promise<Map<string, PriceStatusResult>> {
  const result = new Map<string, PriceStatusResult>(specs.map(s => [s.id, NO_PRICE_STATUS]))
  const eligible = specs.filter(s => s.business_date >= from)
  if (!eligible.length) return result

  const raw = await loadRaw(db, [...new Set(eligible.map(s => s.business_date))])

  const finalSpecs = new Set<string>()
  for (const ids of chunks(eligible.map(s => s.id))) {
    const { data, error } = await db
      .from('sales_statement_lines')
      .select('source_doc_id, sales_statements(confirmed_at)')
      .eq('source_doc_type', 'daily_spec')
      .in('source_doc_id', ids)
    if (error) throw new Error(`sales_statement_lines 조회 실패: ${error.message}`)
    for (const row of data ?? []) {
      const stmts = Array.isArray(row.sales_statements) ? row.sales_statements : [row.sales_statements]
      if (stmts.some((s: { confirmed_at: string | null } | null) => s?.confirmed_at)) finalSpecs.add(row.source_doc_id)
    }
  }

  for (const spec of eligible) {
    const r = raw.get(spec.business_date)!
    result.set(spec.id, priceStatus({
      date: spec.business_date, ...r, statementConfirmed: finalSpecs.has(spec.id), from,
    }))
  }
  return result
}
