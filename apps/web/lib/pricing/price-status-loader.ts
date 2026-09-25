/**
 * 당일 단가 확정 상태 로더.
 *
 * price_confirmations(확정 시각)와 price_day_last_change(적용일별 마지막 단가 등록 시각)를 읽어
 * price-status.ts 의 priceStatus 로 상태를 만든다. **service role 클라이언트**를 넘긴다
 * (새 표는 RLS 를 켜고 정책을 두지 않았다).
 *
 * 날짜 수·명세서 수만큼만 조회한다. 시행일 이전 날짜는 조회하지 않는다.
 * 조회 오류는 던진다 — 상태는 부가 정보라서 호출자가 잡고 상태만 생략한다.
 */
import { NO_PRICE_STATUS, PRICE_STATUS_FROM, priceStatus, type PriceStatusResult } from './price-status'

/* eslint-disable @typescript-eslint/no-explicit-any */
type Db = any

export interface SpecRef {
  id: string
  business_date: string
  /** 월정산 업체의 명세서 — 시행일 이후 날짜는 전부 확정으로 본다 */
  monthly?: boolean
}

const CHUNK = 100

function chunks<T>(list: T[], size = CHUNK): T[][] {
  const out: T[][] = []
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size))
  return out
}

interface Raw { confirmedAt: string | null; lastPriceAt: string | null }

const ms = (iso: string) => new Date(iso).getTime()

/**
 * 날짜별 확정 시각과, **확정 뒤에 등록된 단가의 마지막 등록 시각**을 읽는다.
 *
 * 「수정됨」 판정은 그 날짜(D)의 단가만 보면 안 된다. 단가 등록은 effective_from **이후의 모든 날짜**
 * 명세서를 덮어쓰므로(price-snapshots 라우트), 어제 날짜로 단가를 넣으면 오늘 명세서 금액도 바뀐다.
 * 사장님이 실제로 하시는 방식이다(2026-09-24 에 9/23 단가를 12건 입력). 그래서 D 의 lastPriceAt 은
 * **적용일이 D 이하인 단가**의 마지막 등록 시각이다.
 *
 * 뷰(price_day_last_change)는 적용일별 마지막 등록 시각이라, 가장 이른 확정 시각보다 뒤에 등록된
 * 행만 읽으면 된다 — 행 수가 날짜 수와 무관하게 작다(뷰 전체를 읽지 않는다).
 */
async function loadRaw(db: Db, dates: string[]): Promise<Map<string, Raw>> {
  const conf = await db.from('price_confirmations').select('business_date, confirmed_at').in('business_date', dates)
  if (conf.error) throw new Error(`price_confirmations 조회 실패: ${conf.error.message}`)

  const raw = new Map<string, Raw>(dates.map(d => [d, { confirmedAt: null, lastPriceAt: null }]))
  const confirmed: Array<{ date: string; at: string }> = []
  for (const r of conf.data ?? []) {
    raw.get(r.business_date)!.confirmedAt = r.confirmed_at
    confirmed.push({ date: r.business_date, at: r.confirmed_at })
  }
  // 확정된 날짜가 없으면 「수정됨」을 따질 일이 없다.
  if (!confirmed.length) return raw

  const earliest = confirmed.map(c => c.at).sort((a, b) => ms(a) - ms(b))[0]
  const last = await db.from('price_day_last_change').select('business_date, last_price_at').gt('last_price_at', earliest)
  if (last.error) throw new Error(`price_day_last_change 조회 실패: ${last.error.message}`)

  const changes = (last.data ?? []) as Array<{ business_date: string; last_price_at: string }>
  for (const c of confirmed) {
    let latest: string | null = null
    for (const ch of changes) {
      if (ch.business_date <= c.date && (latest === null || ms(ch.last_price_at) > ms(latest))) latest = ch.last_price_at
    }
    raw.get(c.date)!.lastPriceAt = latest
  }
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
      date: spec.business_date, ...r, statementConfirmed: finalSpecs.has(spec.id), monthly: spec.monthly, from,
    }))
  }
  return result
}
