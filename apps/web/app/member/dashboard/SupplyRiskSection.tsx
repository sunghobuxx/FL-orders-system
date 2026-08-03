'use client'

import { useEffect, useState } from 'react'

import type { Forecast, SupplyRisk } from '@/app/api/member/market-prices/route'

/**
 * 수급위험 예측 화면.
 *
 * 2026-06-22 빌드 산출물에서 복원했다. git 을 거치지 않은 배포가 있었고, 그 뒤
 * 복원 과정에서 이 컴포넌트가 통째로 빠져 하드코딩된 문구만 남아 있었다.
 * 데이터는 /api/member/market-prices (가락시장 출하물량 예측)에서 받는다.
 */

const RISK_STYLE: Record<SupplyRisk, { label: string; badge: string; dot: string; border: string; bg: string }> = {
  critical: { label: '매우위험', badge: 'bg-red-600 text-white', dot: 'bg-red-600', border: 'border-red-300', bg: 'bg-red-50' },
  high: { label: '위험', badge: 'bg-red-100 text-red-700', dot: 'bg-red-500', border: 'border-red-200', bg: 'bg-red-50' },
  watch: { label: '주의', badge: 'bg-yellow-100 text-yellow-700', dot: 'bg-yellow-500', border: 'border-yellow-200', bg: 'bg-yellow-50' },
  safe: { label: '안정', badge: 'bg-green-100 text-green-700', dot: 'bg-green-500', border: 'border-green-100', bg: 'bg-green-50' },
}

const RISK_ORDER: SupplyRisk[] = ['critical', 'high', 'watch', 'safe']

interface Meta { rawItemCount?: number; sampleNames?: string[]; errorDetail?: string }

/** 품목명을 예측 데이터의 표준 분류명으로 옮긴다. 못 찾으면 원래 이름을 그대로 쓴다. */
function toStandardName(name: string, forecast: Record<string, Forecast>): string {
  const trimmed = (name ?? '').trim()
  if (!trimmed) return name
  if (forecast[trimmed]) return trimmed
  for (const key of Object.keys(forecast)) {
    if (trimmed.includes(key) || key.includes(trimmed)) return key
  }
  return trimmed
}

export function SupplyRiskSection({ products }: { products: { name: string; unit: string }[] }) {
  const [forecast, setForecast] = useState<Record<string, Forecast> | null>(null)
  const [meta, setMeta] = useState<Meta | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    fetch('/api/member/market-prices')
      .then(r => r.json())
      .then((d: { forecast?: Record<string, Forecast>; debug?: Meta }) => {
        if (!alive) return
        setForecast(d.forecast ?? {})
        setMeta(d.debug ?? null)
      })
      .catch(() => { if (alive) setError('조회 실패') })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])

  if (products.length === 0) return null

  const matched = !forecast ? [] : products.flatMap(p => {
    const fc = forecast[toStandardName(p.name, forecast)]
    return fc ? [{ name: p.name, unit: p.unit, fc }] : []
  }).sort((a, b) => RISK_ORDER.indexOf(a.fc.supplyRisk) - RISK_ORDER.indexOf(b.fc.supplyRisk))

  const risky = matched.filter(m => m.fc.supplyRisk !== 'safe')
  const stable = matched.filter(m => m.fc.supplyRisk === 'safe')

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 space-y-2">
        <p className="text-xs font-semibold text-gray-600">이번 주 수급위험 브리핑</p>

        {loading && <p className="text-xs text-gray-400">가락시장 예측 데이터 조회 중...</p>}

        {error && !loading && (
          <p className="text-xs text-red-500">예측 데이터 조회 실패: 공공데이터 서버 지연 또는 오류가 발생했습니다.</p>
        )}

        {!loading && !error && risky.length === 0 && matched.length > 0 && (
          <p className="text-xs text-green-600 font-medium">✅ 주문 품목 전체 공급 안정 — 평소 발주량 유지</p>
        )}

        {!loading && !error && matched.length === 0 && forecast && (
          <div className="space-y-1">
            <p className="text-xs text-gray-500">주문 품목 중 가락시장 출하 예측 데이터가 있는 품목이 없습니다.</p>
            {meta && (
              <p className="text-xs text-gray-400">
                API 반환 품목 수: {meta.rawItemCount ?? 0}개
                {meta.sampleNames && meta.sampleNames.length > 0 && <> · 샘플: {meta.sampleNames.slice(0, 15).join(', ')}</>}
                {meta.errorDetail && <> · 오류: {meta.errorDetail}</>}
              </p>
            )}
          </div>
        )}

        {!loading && !error && risky.length > 0 && (
          <div className="space-y-2">
            <div>
              <p className="text-xs text-gray-500 mb-1">위험 품목</p>
              <div className="flex flex-wrap gap-1.5">
                {risky.map(({ name, fc }) => (
                  <span key={name} className={`text-xs font-semibold px-2.5 py-1 rounded-full ${RISK_STYLE[fc.supplyRisk].badge}`}>
                    {name} {RISK_STYLE[fc.supplyRisk].label}
                  </span>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-1">추천 액션</p>
              <ul className="space-y-0.5">
                {risky.map(({ name, fc }) => (
                  <li key={name} className="text-xs text-gray-700">
                    · <span className="font-medium">{name}</span>{' '}
                    {fc.supplyRisk === 'critical' || fc.supplyRisk === 'high' ? '2~3일치 선발주 검토' : '발주 시점 확인 / 재고 확인'}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>

      {!loading && !error && matched.length > 0 && (
        <div className="space-y-2">
          {matched.map(({ name, fc }) => {
            const style = RISK_STYLE[fc.supplyRisk]
            const width = fc.changeRate !== null && fc.prvmmQty > 0
              ? Math.min(100, Math.max(8, (fc.predcQty / fc.prvmmQty) * 100)) : 100
            const barColor = fc.supplyRisk === 'critical' || fc.supplyRisk === 'high'
              ? 'bg-red-400' : fc.supplyRisk === 'watch' ? 'bg-yellow-400' : 'bg-green-400'
            return (
              <div key={name} className={`rounded-xl border ${style.border} ${style.bg} p-3 space-y-2`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${style.dot}`} />
                    <span className="text-sm font-semibold text-gray-800">{name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {fc.changeRate !== null && (
                      <span className={`text-xs font-bold ${fc.changeRate < 0 ? 'text-red-500' : 'text-blue-500'}`}>
                        {fc.changeRate > 0 ? '+' : ''}{fc.changeRate.toFixed(1)}%
                      </span>
                    )}
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${style.badge}`}>
                      {fc.changeRate === null ? '비교 불가' : style.label}
                    </span>
                  </div>
                </div>
                {/* 전월 물량을 못 믿을 때는 막대그래프를 그리지 않는다. 잘못된 비교로 보인다. */}
                {fc.changeRate !== null && (
                <div className="bg-white bg-opacity-60 rounded-lg px-3 py-2 space-y-1.5">
                  <p className="text-xs text-gray-400">서울가락 출하 예측 vs 전월</p>
                  <div className="flex gap-1 items-center">
                    <span className="text-xs text-gray-400 w-10 shrink-0">전월</span>
                    <div className="flex-1 bg-gray-200 rounded-full h-2">
                      <div className="h-full bg-gray-400 rounded-full w-full" />
                    </div>
                  </div>
                  <div className="flex gap-1 items-center">
                    <span className="text-xs text-gray-400 w-10 shrink-0">예측</span>
                    <div className="flex-1 bg-gray-200 rounded-full h-2">
                      <div className={`h-full rounded-full ${barColor}`} style={{ width: `${width}%` }} />
                    </div>
                  </div>
                </div>
                )}
                <p className="text-xs text-gray-700 leading-relaxed">{fc.advice}</p>
              </div>
            )
          })}
          {stable.length > 0 && (
            <div className="rounded-xl border border-green-100 bg-green-50 px-3 py-2">
              <p className="text-xs text-green-700">
                <span className="font-semibold">✅ 안정 품목</span> · {stable.map(s => s.name).join(', ')}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
