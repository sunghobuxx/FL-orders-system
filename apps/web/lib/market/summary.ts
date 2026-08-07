/* eslint-disable @typescript-eslint/no-explicit-any */

import { fetchAll } from '@/lib/supabase/fetch-all'

/**
 * market_daily_prices 를 읽어 화면이 쓸 형태로 줄인다.
 *
 * 수집은 /api/admin/market/collect 한 곳뿐이고, 여기서는 읽기만 한다.
 * 회원 화면은 반입량(getSupplyTrend), 어드민 화면은 시세(getMarketPrices)만 쓴다.
 * 두 화면이 같은 저장분을 보므로 숫자가 어긋나지 않는다.
 */

export interface DailyRow {
  trade_date: string
  mclsf_name: string
  unit_name: string
  avg_price: number
  total_qty: number
}

async function loadRows(db: any, since: string): Promise<DailyRow[]> {
  return fetchAll<DailyRow>(() => db
    .from('market_daily_prices')
    .select('trade_date, mclsf_name, unit_name, avg_price, total_qty')
    .gte('trade_date', since)
    .order('trade_date', { ascending: false }))
}

/** 품목마다 물량이 가장 많은 단위를 대표로 삼는다. 단위가 섞이면 합계가 뒤틀린다. */
function dominantUnit(rows: DailyRow[]): Map<string, string> {
  const byUnit = new Map<string, number>()
  for (const r of rows) {
    const k = `${r.mclsf_name}|${r.unit_name}`
    byUnit.set(k, (byUnit.get(k) ?? 0) + Number(r.total_qty ?? 0))
  }
  const best = new Map<string, { unit: string; qty: number }>()
  for (const [k, qty] of byUnit) {
    const [name, unit] = k.split('|')
    const cur = best.get(name)
    if (!cur || qty > cur.qty) best.set(name, { unit, qty })
  }
  return new Map([...best].map(([n, v]) => [n, v.unit]))
}

export type SupplyRisk = 'critical' | 'high' | 'watch' | 'safe'

export interface SupplyTrend {
  name: string
  unit: string
  /** 최근 7 거래일 일평균 반입량 */
  recentAvg: number
  /** 그 이전 7 거래일 일평균 반입량 */
  priorAvg: number
  changeRate: number
  risk: SupplyRisk
}

function riskOf(changeRate: number): SupplyRisk {
  if (changeRate <= -40) return 'critical'
  if (changeRate <= -20) return 'high'
  if (changeRate <= -10) return 'watch'
  return 'safe'
}

/**
 * 회원 화면용. 최근 7 거래일과 그 이전 7 거래일의 일평균 반입량을 비교한다.
 * 거래일 기준이라 휴장일이 끼어도 비교가 흔들리지 않는다.
 */
export async function getSupplyTrend(db: any, since: string): Promise<Map<string, SupplyTrend>> {
  const rows = await loadRows(db, since)
  if (!rows.length) return new Map()

  const units = dominantUnit(rows)
  const dates = [...new Set(rows.map(r => r.trade_date))].sort().reverse()
  const recent = new Set(dates.slice(0, 7))
  const prior = new Set(dates.slice(7, 14))
  if (!prior.size) return new Map()

  const acc = new Map<string, { r: number[]; p: number[] }>()
  for (const row of rows) {
    if (units.get(row.mclsf_name) !== row.unit_name) continue
    const cur = acc.get(row.mclsf_name) ?? { r: [], p: [] }
    if (recent.has(row.trade_date)) cur.r.push(Number(row.total_qty ?? 0))
    else if (prior.has(row.trade_date)) cur.p.push(Number(row.total_qty ?? 0))
    acc.set(row.mclsf_name, cur)
  }

  const out = new Map<string, SupplyTrend>()
  for (const [name, v] of acc) {
    if (!v.r.length || !v.p.length) continue
    const recentAvg = v.r.reduce((s, x) => s + x, 0) / v.r.length
    const priorAvg = v.p.reduce((s, x) => s + x, 0) / v.p.length
    if (priorAvg <= 0) continue
    const changeRate = ((recentAvg - priorAvg) / priorAvg) * 100
    out.set(name, {
      name, unit: units.get(name) ?? '',
      recentAvg, priorAvg, changeRate, risk: riskOf(changeRate),
    })
  }
  return out
}

export interface MarketPrice {
  name: string
  unit: string
  /** 최근 7 거래일 가중평균 낙찰가 */
  avgPrice: number
  latestDate: string
}

/**
 * 어드민 화면용. 품목별 최근 7 거래일 가중평균 낙찰가.
 * 하루치만 쓰면 그날 품질·산지에 따라 크게 튄다.
 */
export async function getMarketPrices(db: any, since: string): Promise<Map<string, MarketPrice>> {
  const rows = await loadRows(db, since)
  if (!rows.length) return new Map()

  const units = dominantUnit(rows)
  const dates = [...new Set(rows.map(r => r.trade_date))].sort().reverse()
  const recent = new Set(dates.slice(0, 7))

  const acc = new Map<string, { sum: number; qty: number; latest: string }>()
  for (const row of rows) {
    if (!recent.has(row.trade_date)) continue
    if (units.get(row.mclsf_name) !== row.unit_name) continue
    const qty = Number(row.total_qty ?? 0)
    const price = Number(row.avg_price ?? 0)
    if (qty <= 0 || price <= 0) continue
    const cur = acc.get(row.mclsf_name) ?? { sum: 0, qty: 0, latest: row.trade_date }
    cur.sum += price * qty
    cur.qty += qty
    if (row.trade_date > cur.latest) cur.latest = row.trade_date
    acc.set(row.mclsf_name, cur)
  }

  const out = new Map<string, MarketPrice>()
  for (const [name, v] of acc) {
    out.set(name, {
      name, unit: units.get(name) ?? '',
      avgPrice: Math.round(v.sum / v.qty), latestDate: v.latest,
    })
  }
  return out
}
