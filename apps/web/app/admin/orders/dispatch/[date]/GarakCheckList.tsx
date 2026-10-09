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
  /** 실제 라우팅되는 공급처(공통·가락업체) id — 공급처별 발주 내역과 같은 묶음 기준 */
  supplierId: string
  supplierName: string
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

  // 공급처별 발주 내역과 같은 모양으로 — 업체(공급처) → 품목(+총수량) → 식당별 줄.
  const bySupplier = new Map<string, { name: string; rows: GarakRow[] }>()
  for (const row of rows) {
    const key = row.supplierId || '미지정'
    const g = bySupplier.get(key) ?? { name: row.supplierName || '미지정', rows: [] }
    g.rows.push(row)
    bySupplier.set(key, g)
  }

  return (
    <div className="space-y-2">
      {error && <p className="px-1 text-xs text-red-500">{error}</p>}
      {[...bySupplier.entries()].map(([supplierId, group]) => {
        const byProduct = new Map<string, { name: string; unit: string; total: number; rows: GarakRow[] }>()
        for (const row of group.rows) {
          const key = `${row.name}:${row.unit}`
          const p = byProduct.get(key) ?? { name: row.name, unit: row.unit, total: 0, rows: [] }
          p.total += row.qty
          p.rows.push(row)
          byProduct.set(key, p)
        }
        return (
          <div key={supplierId} className="bg-white rounded-xl border border-amber-200 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 bg-amber-50 border-b border-amber-100">
              <span className="text-sm font-semibold text-amber-800">{group.name}</span>
              <span className="text-xs px-2.5 py-1 rounded-full bg-amber-100 text-amber-700 font-medium">발주 문자 없음</span>
            </div>
            <div className="divide-y divide-gray-50">
              {[...byProduct.values()].map(p => (
                <div key={`${p.name}-${p.unit}`} className="px-5 py-2.5">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm font-medium text-gray-800">{p.name}</span>
                    <span className="text-sm text-gray-600 tabular-nums">{fmtQty(p.total)} {p.unit}</span>
                  </div>
                  <div className="space-y-1.5">
                    {p.rows.map(row => {
                      const required = requiredStageOf(row.batchStatus)
                      const done = (stages[row.id] ?? 0) >= required
                      return (
                        <div key={row.id} className="flex items-center gap-3 pl-1">
                          <span className="flex-1 text-xs text-gray-500 truncate">{row.restaurant}</span>
                          <span className="text-xs text-gray-500 tabular-nums shrink-0">{fmtQty(row.qty)} {row.unit}</span>
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
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
