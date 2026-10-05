'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export interface GarakRow {
  id: string
  name: string
  restaurant: string
  qty: number
  unit: string
  stage: number
  batchStatus: string
}

const RANK: Record<string, number> = { open: 0, submitted: 1, validated: 2, ordered: 3, dispatched: 4, completed: 5 }

/** 배송중(ordered) 이후에는 배송 확인(2단계)을 받는다. 배치 상세 화면과 같은 규칙. */
function requiredStageOf(batchStatus: string) {
  return (RANK[batchStatus] ?? 0) >= RANK.ordered ? 2 : 1
}

function fmtQty(qty: number) {
  return qty % 1 === 0 ? String(qty) : qty.toFixed(1)
}

export default function GarakCheckList({ rows }: { rows: GarakRow[] }) {
  const router = useRouter()
  const [stages, setStages] = useState<Record<string, number>>(Object.fromEntries(rows.map(r => [r.id, r.stage])))
  const [busy, setBusy] = useState<Set<string>>(new Set())
  const [error, setError] = useState('')

  async function toggle(row: GarakRow) {
    if (busy.has(row.id)) return
    const required = requiredStageOf(row.batchStatus)
    const cur = stages[row.id] ?? 0
    const next = cur >= required ? required - 1 : required

    setBusy(prev => new Set(prev).add(row.id))
    setStages(prev => ({ ...prev, [row.id]: next }))
    setError('')
    try {
      const res = await fetch('/api/admin/orders/check-items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemIds: [row.id], stage: next }),
      })
      const data = await res.json() as { error?: string }
      if (!res.ok) throw new Error(data.error ?? '확인 처리 실패')
      router.refresh()
    } catch (e) {
      setStages(prev => ({ ...prev, [row.id]: cur }))
      setError(e instanceof Error ? e.message : '확인 처리 실패')
    } finally {
      setBusy(prev => { const n = new Set(prev); n.delete(row.id); return n })
    }
  }

  return (
    <div className="bg-white rounded-xl border border-amber-200 overflow-hidden">
      {error && <p className="px-5 py-2 text-xs text-red-500 bg-red-50">{error}</p>}
      <div className="divide-y divide-gray-50">
        {rows.map(row => {
          const required = requiredStageOf(row.batchStatus)
          const done = (stages[row.id] ?? 0) >= required
          return (
            <div key={row.id} className="flex items-center gap-3 px-5 py-2.5">
              <div className="flex-1 min-w-0">
                <div className="text-sm text-gray-800 truncate">{row.name}</div>
                <div className="text-xs text-gray-400 truncate">{row.restaurant}</div>
              </div>
              <span className="text-sm text-gray-600 tabular-nums shrink-0">{fmtQty(row.qty)} {row.unit}</span>
              <button
                type="button"
                onClick={() => toggle(row)}
                disabled={busy.has(row.id)}
                className={`shrink-0 w-16 text-xs px-3 py-1.5 rounded-lg font-semibold disabled:opacity-50 ${
                  done ? 'bg-green-500 text-white' : 'bg-brand-600 text-white hover:bg-brand-700'
                }`}
              >
                {done ? '✓' : required === 1 ? '상차' : '배송'}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
