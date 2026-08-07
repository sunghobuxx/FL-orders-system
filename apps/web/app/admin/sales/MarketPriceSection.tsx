import { createAdminClient } from '@/lib/supabase/admin'
import { fetchAll } from '@/lib/supabase/fetch-all'
import { getMarketPrices } from '@/lib/market/summary'
import { toMarketName } from '@/lib/market/product-map'

/**
 * 시세 추이 — 우리 납품 단가 vs 가락시장 평균 낙찰가.
 *
 * 어느 품목에서 마진이 나고 어디서 역마진인지 한눈에 보려는 것이다.
 * 반입량은 여기서 다루지 않는다. 수급위험은 회원 화면에만 둔다.
 *
 * 단위가 다르면(우리 box, 가락 kg) 그대로 견주면 안 되므로 따로 모아 보여 준다.
 */

interface Row {
  product: string
  market: string
  ourPrice: number
  ourUnit: string
  marketPrice: number
  marketUnit: string
  diff: number
  rate: number
}

function fmt(n: number) { return `${Math.round(n).toLocaleString('ko-KR')}원` }

export default async function MarketPriceSection() {
  const db = createAdminClient()
  const since = new Date(Date.now() + 9 * 3600_000 - 40 * 86400_000).toISOString().slice(0, 10)
  const prices = await getMarketPrices(db, since)
  if (!prices.size) return null

  // 우리 현재 판매단가 — 품목별 가장 최근 등록 단가
  const [products, sps, snaps] = await Promise.all([
    fetchAll<{ id: string; standard_name: string }>(() => db
      .from('products').select('id, standard_name').eq('status', 'active')),
    fetchAll<{ id: string; product_id: string }>(() => db
      .from('supplier_products').select('id, product_id').eq('status', 'active')),
    fetchAll<{ supplier_product_id: string; sale_price: number; unit: string; effective_from: string }>(() => db
      .from('price_snapshots').select('supplier_product_id, sale_price, unit, effective_from')
      .order('effective_from', { ascending: false })),
  ])

  const spToProduct = new Map(sps.map(r => [r.id, r.product_id]))
  const latest = new Map<string, { price: number; unit: string }>()
  for (const s of snaps) {
    const pid = spToProduct.get(s.supplier_product_id)
    if (!pid || latest.has(pid)) continue
    const price = Number(s.sale_price ?? 0)
    if (price > 0) latest.set(pid, { price, unit: (s.unit ?? '').trim() })
  }

  const names = new Set(prices.keys())
  const same: Row[] = []
  const diffUnit: Row[] = []
  for (const p of products) {
    const ours = latest.get(p.id)
    if (!ours) continue
    const marketName = toMarketName(p.standard_name, names)
    if (!marketName) continue
    const m = prices.get(marketName)!
    const row: Row = {
      product: p.standard_name, market: marketName,
      ourPrice: ours.price, ourUnit: ours.unit,
      marketPrice: m.avgPrice, marketUnit: m.unit,
      diff: ours.price - m.avgPrice,
      rate: m.avgPrice > 0 ? ((ours.price - m.avgPrice) / m.avgPrice) * 100 : 0,
    }
    ;(ours.unit && m.unit && ours.unit === m.unit ? same : diffUnit).push(row)
  }
  if (!same.length && !diffUnit.length) return null
  same.sort((a, b) => a.rate - b.rate)

  const latestDate = [...prices.values()].reduce((d, v) => (v.latestDate > d ? v.latestDate : d), '')

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-5 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
        <span className="text-sm font-semibold text-gray-700">시세 추이 — 우리 단가 vs 가락시장</span>
        <span className="text-xs text-gray-400">서울가락 최근 7거래일 평균 · ~{latestDate}</span>
      </div>

      {same.length > 0 && (
        <div className="divide-y divide-gray-100">
          <div className="grid grid-cols-[1fr_auto_auto_auto] gap-3 px-5 py-2 bg-gray-50 text-xs font-semibold text-gray-500">
            <span>품목</span>
            <span className="w-24 text-right">우리 단가</span>
            <span className="w-24 text-right">가락 평균</span>
            <span className="w-24 text-right">차이</span>
          </div>
          {same.map(r => (
            <div key={r.product} className="grid grid-cols-[1fr_auto_auto_auto] gap-3 items-center px-5 py-2.5">
              <span className="text-sm text-gray-800 truncate">
                {r.product}
                <span className="ml-1.5 text-xs text-gray-400">{r.market}</span>
              </span>
              <span className="w-24 text-right text-sm text-gray-700 tabular-nums">{fmt(r.ourPrice)}</span>
              <span className="w-24 text-right text-sm text-gray-500 tabular-nums">{fmt(r.marketPrice)}</span>
              <span className={`w-24 text-right text-sm font-semibold tabular-nums ${r.diff < 0 ? 'text-red-600' : 'text-blue-600'}`}>
                {r.diff > 0 ? '+' : ''}{Math.round(r.rate)}%
              </span>
            </div>
          ))}
        </div>
      )}

      {diffUnit.length > 0 && (
        <div className="px-5 py-3 border-t border-gray-100 bg-gray-50 space-y-1">
          <p className="text-xs font-semibold text-gray-500">단위가 달라 직접 비교가 어려운 품목</p>
          <p className="text-xs text-gray-500 leading-relaxed">
            {diffUnit.map(r => `${r.product} ${fmt(r.ourPrice)}/${r.ourUnit || '?'} · 가락 ${fmt(r.marketPrice)}/${r.marketUnit}`).join('  |  ')}
          </p>
        </div>
      )}

      <div className="px-5 py-2 bg-gray-50 border-t border-gray-100 text-[11px] text-gray-400">
        가락 평균은 낙찰 총액 ÷ 총 물량입니다. 우리 단가는 품목별 최근 등록 판매단가입니다.
        빨간색은 가락 평균보다 우리가 싸게 파는 품목입니다.
      </div>
    </div>
  )
}
