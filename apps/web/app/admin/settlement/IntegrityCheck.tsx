'use client'

import { useState } from 'react'

interface Item {
  code: string
  label: string
  restaurant: string
  period: string
  detail: string
  amount: number
  settled: boolean
}

interface Result {
  since: string
  openCount: number
  settledCount: number
  items: Item[]
  error?: string
}

/**
 * 정산 정합성 점검 버튼.
 *
 * 맞춰야 하는 것은 명세서 = 정산서 = 미수금 이다.
 * 발주와 명세서가 다른 것은 정상이라 보지 않는다(관리자 수정이 1순위).
 *
 * 완납 건은 소급 청구하지 않기로 했으므로 접어서 따로 보여 준다.
 */
export default function IntegrityCheck({ defaultSince }: { defaultSince: string }) {
  const [since, setSince] = useState(defaultSince)
  const [loading, setLoading] = useState(false)
  const [res, setRes] = useState<Result | null>(null)
  const [showSettled, setShowSettled] = useState(false)

  async function run() {
    setLoading(true)
    setRes(null)
    try {
      const r = await fetch(`/api/admin/settlement/generate?since=${since}`)
      setRes(await r.json() as Result)
    } catch {
      setRes({ since, openCount: 0, settledCount: 0, items: [], error: '점검 중 오류가 발생했습니다' })
    } finally {
      setLoading(false)
    }
  }

  const open = res?.items.filter(i => !i.settled) ?? []
  const settled = res?.items.filter(i => i.settled) ?? []

  const byCode = (list: Item[]) => {
    const m = new Map<string, Item[]>()
    for (const i of list) {
      const a = m.get(i.code)
      if (a) a.push(i)
      else m.set(i.code, [i])
    }
    return [...m.entries()]
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 px-5 py-3 border-b border-gray-100">
        <span className="text-sm font-semibold text-gray-700">정합성 점검</span>
        <span className="text-xs text-gray-400">명세서 = 정산서 = 미수금</span>
        <div className="ml-auto flex items-center gap-2">
          <input
            type="date"
            value={since}
            onChange={e => setSince(e.target.value)}
            className="px-2 py-1 text-xs border border-gray-200 rounded-md text-gray-700"
          />
          <button
            onClick={run}
            disabled={loading}
            className="text-xs px-3 py-1.5 rounded-md bg-brand-600 text-white font-semibold
              hover:bg-brand-700 disabled:opacity-50"
          >
            {loading ? '확인 중…' : '점검'}
          </button>
        </div>
      </div>

      {res?.error && <p className="px-5 py-3 text-sm text-red-600">{res.error}</p>}

      {res && !res.error && (
        <div className="divide-y divide-gray-100">
          <div className="flex items-center gap-4 px-5 py-3">
            <span className={`text-sm font-bold ${open.length ? 'text-red-600' : 'text-green-700'}`}>
              {open.length ? `고쳐야 할 것 ${open.length}건` : '이상 없음'}
            </span>
            {settled.length > 0 && (
              <button
                onClick={() => setShowSettled(v => !v)}
                className="text-xs text-gray-500 underline"
              >
                완납 건 {settled.length}건 {showSettled ? '접기' : '보기'}
              </button>
            )}
          </div>

          {byCode(open).map(([code, list]) => (
            <div key={code} className="px-5 py-3">
              <p className="text-sm font-semibold text-gray-800 mb-1.5">
                {list[0].label}
                <span className="ml-1.5 text-xs text-red-600">{list.length}건</span>
              </p>
              <div className="space-y-1">
                {list.map((i, n) => (
                  <div key={n} className="flex flex-wrap items-baseline gap-2 text-xs">
                    <span className="text-gray-700 min-w-[7rem]">{i.restaurant}</span>
                    <span className="text-gray-400">{i.period}</span>
                    <span className="text-gray-600">{i.detail}</span>
                    {i.amount !== 0 && (
                      <span className={`tabular-nums font-medium ${i.amount > 0 ? 'text-red-600' : 'text-blue-600'}`}>
                        {i.amount > 0 ? '+' : ''}{i.amount.toLocaleString('ko-KR')}원
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}

          {showSettled && byCode(settled).map(([code, list]) => (
            <div key={code} className="px-5 py-3 bg-gray-50">
              <p className="text-sm text-gray-500 mb-1.5">
                {list[0].label}
                <span className="ml-1.5 text-xs">{list.length}건</span>
                <span className="ml-2 text-xs text-gray-400">완납 — 소급 청구하지 않음</span>
              </p>
              <div className="space-y-1">
                {list.map((i, n) => (
                  <div key={n} className="flex flex-wrap items-baseline gap-2 text-xs text-gray-400">
                    <span className="min-w-[7rem]">{i.restaurant}</span>
                    <span>{i.period}</span>
                    <span>{i.detail}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
