import { createAdminClient } from '@/lib/supabase/admin'
import { getSupplyTrend, type SupplyRisk } from '@/lib/market/summary'
import { toMarketName } from '@/lib/market/product-map'

/**
 * 수급위험 — 가락시장 반입량 변화.
 *
 * 최근 7 거래일과 그 이전 7 거래일의 일평균 반입량을 견준다.
 * 물량이 줄면 그만큼 물건 잡기가 어려워지므로 선발주를 권한다.
 *
 * 예전에는 «전자송품장 출하 예측» API 를 썼는데 품목이 7 종뿐이라 우리 발주의 6.8% 밖에
 * 덮지 못했고, 전월 물량이 품목별 값이 아니라 증감 비교 자체가 안 됐다.
 * «실시간 경매정보» 로 바꾸니 중분류 115 종이 잡혀 발주 금액의 76.5% 를 덮는다.
 *
 * 가격은 여기서 다루지 않는다. 시세 비교는 어드민 전체 매출관리에만 둔다.
 */

const STYLE: Record<SupplyRisk, { label: string; badge: string; dot: string; border: string; bg: string }> = {
  critical: { label: '매우위험', badge: 'bg-red-600 text-white', dot: 'bg-red-600', border: 'border-red-300', bg: 'bg-red-50' },
  high: { label: '위험', badge: 'bg-red-100 text-red-700', dot: 'bg-red-500', border: 'border-red-200', bg: 'bg-red-50' },
  watch: { label: '주의', badge: 'bg-yellow-100 text-yellow-700', dot: 'bg-yellow-500', border: 'border-yellow-200', bg: 'bg-yellow-50' },
  safe: { label: '안정', badge: 'bg-green-100 text-green-700', dot: 'bg-green-500', border: 'border-green-100', bg: 'bg-green-50' },
}
const ORDER: SupplyRisk[] = ['critical', 'high', 'watch', 'safe']

function fmtQty(n: number, unit: string) {
  return `${Math.round(n).toLocaleString('ko-KR')}${unit}`
}

export default async function SupplyRiskSection({ products }: { products: { name: string; unit: string }[] }) {
  if (!products.length) return null

  const db = createAdminClient()
  const since = new Date(Date.now() + 9 * 3600_000 - 40 * 86400_000).toISOString().slice(0, 10)
  const trend = await getSupplyTrend(db, since)

  if (!trend.size) {
    return <p className="text-sm text-gray-400">가락시장 반입량 자료를 준비 중입니다.</p>
  }

  const names = new Set(trend.keys())
  // 우리 품목 여러 개가 같은 가락 품목에 붙는다(두절콩나물·일자·곱슬이 → 콩나물).
  // 같은 것을 여러 번 보여 주지 않도록 가락 품목 기준으로 묶고 우리 이름을 함께 적는다.
  const grouped = new Map<string, { ours: string[]; trend: NonNullable<ReturnType<typeof trend.get>> }>()
  for (const p of products) {
    const market = toMarketName(p.name, names)
    if (!market) continue
    const t = trend.get(market)
    if (!t) continue
    const cur = grouped.get(market) ?? { ours: [], trend: t }
    if (!cur.ours.includes(p.name)) cur.ours.push(p.name)
    grouped.set(market, cur)
  }

  const rows = [...grouped.values()].sort(
    (a, b) => ORDER.indexOf(a.trend.risk) - ORDER.indexOf(b.trend.risk) || a.trend.changeRate - b.trend.changeRate,
  )
  if (!rows.length) {
    return <p className="text-sm text-gray-400">주문 품목 중 가락시장 반입량 자료가 있는 품목이 없습니다.</p>
  }

  const risky = rows.filter(r => r.trend.risk !== 'safe')
  const stable = rows.filter(r => r.trend.risk === 'safe')

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 space-y-2">
        <p className="text-xs font-semibold text-gray-600">이번 주 수급위험 브리핑</p>
        {risky.length === 0 ? (
          <p className="text-xs text-green-600 font-medium">✅ 주문 품목 전체 반입량 안정 — 평소 발주량 유지</p>
        ) : (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-1.5">
              {risky.map(r => (
                <span key={r.trend.name} className={`text-xs font-semibold px-2.5 py-1 rounded-full ${STYLE[r.trend.risk].badge}`}>
                  {r.ours[0]} {STYLE[r.trend.risk].label}
                </span>
              ))}
            </div>
            <ul className="space-y-0.5">
              {risky.map(r => (
                <li key={r.trend.name} className="text-xs text-gray-700">
                  · <span className="font-medium">{r.ours.join('·')}</span>{' '}
                  {r.trend.risk === 'critical' || r.trend.risk === 'high' ? '2~3일치 선발주 검토' : '발주 시점 확인 / 재고 확인'}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="space-y-2">
        {rows.map(({ ours, trend: t }) => {
          const s = STYLE[t.risk]
          const width = Math.min(100, Math.max(8, (t.recentAvg / t.priorAvg) * 100))
          const bar = t.risk === 'critical' || t.risk === 'high' ? 'bg-red-400'
            : t.risk === 'watch' ? 'bg-yellow-400' : 'bg-green-400'
          return (
            <div key={t.name} className={`rounded-xl border ${s.border} ${s.bg} p-3 space-y-2`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <div className={`w-2 h-2 rounded-full shrink-0 ${s.dot}`} />
                  <span className="text-sm font-semibold text-gray-800 truncate">{ours.join('·')}</span>
                  <span className="text-xs text-gray-400 shrink-0">{t.name}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`text-xs font-bold ${t.changeRate < 0 ? 'text-red-500' : 'text-blue-500'}`}>
                    {t.changeRate > 0 ? '+' : ''}{t.changeRate.toFixed(1)}%
                  </span>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${s.badge}`}>{s.label}</span>
                </div>
              </div>
              <div className="bg-white bg-opacity-60 rounded-lg px-3 py-2 space-y-1.5">
                <p className="text-xs text-gray-400">서울가락 일평균 반입량 · 최근 7일 vs 직전 7일</p>
                <div className="flex gap-1 items-center">
                  <span className="text-xs text-gray-400 w-10 shrink-0">직전</span>
                  <div className="flex-1 bg-gray-200 rounded-full h-2"><div className="h-full bg-gray-400 rounded-full w-full" /></div>
                  <span className="text-xs text-gray-500 w-24 text-right shrink-0 tabular-nums">{fmtQty(t.priorAvg, t.unit)}</span>
                </div>
                <div className="flex gap-1 items-center">
                  <span className="text-xs text-gray-400 w-10 shrink-0">최근</span>
                  <div className="flex-1 bg-gray-200 rounded-full h-2">
                    <div className={`h-full rounded-full ${bar}`} style={{ width: `${width}%` }} />
                  </div>
                  <span className="text-xs text-gray-700 font-semibold w-24 text-right shrink-0 tabular-nums">{fmtQty(t.recentAvg, t.unit)}</span>
                </div>
              </div>
            </div>
          )
        })}
        {stable.length > 0 && risky.length > 0 && (
          <div className="rounded-xl border border-green-100 bg-green-50 px-3 py-2">
            <p className="text-xs text-green-700">
              <span className="font-semibold">✅ 안정 품목</span> · {stable.map(r => r.ours[0]).join(', ')}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
