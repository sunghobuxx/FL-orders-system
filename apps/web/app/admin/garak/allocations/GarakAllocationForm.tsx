'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { allocationWarning, type CandidateLine } from '@/lib/garak/allocation'

export interface AllocationGroup {
  productId: string
  productName: string
  purchaseQty: number
  unit: string
  candidates: Array<CandidateLine & { exact: boolean }>
  chosenOrderItemId: string | null
}

export default function GarakAllocationForm({ date, groups }: { date: string; groups: AllocationGroup[] }) {
  const router = useRouter()
  const [choice, setChoice] = useState<Record<string, string | null>>(
    Object.fromEntries(groups.map(g => [g.productId, g.chosenOrderItemId])),
  )
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState('')

  async function save(g: AllocationGroup) {
    const orderItemId = choice[g.productId]
    if (!orderItemId) { setMessage('발주 줄을 고르세요'); return }
    setBusy(g.productId)
    setMessage('')
    try {
      const res = await fetch('/api/admin/garak-allocations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ businessDate: date, productId: g.productId, orderItemId }),
      })
      const data = await res.json() as { error?: string }
      if (!res.ok) throw new Error(data.error ?? '저장 실패')
      router.refresh()
    } catch (e) {
      setMessage(e instanceof Error ? e.message : '저장 실패')
    } finally {
      setBusy(null)
    }
  }

  if (groups.length === 0) {
    return <p className="py-10 text-center text-sm text-gray-400">이 날짜에 가락 매입 기록이 없습니다. 먼저 가락 매입을 적어 주세요.</p>
  }

  return (
    <div className="space-y-4">
      {message && <p className="text-xs text-red-500">{message}</p>}
      {groups.map(g => {
        const picked = g.candidates.find(c => c.orderItemId === choice[g.productId])
        const warn = picked ? allocationWarning(g.purchaseQty, picked.qty) : null
        return (
          <div key={g.productId} className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-gray-800">{g.productName}</div>
              <div className="text-xs text-gray-500">가락 매입 {g.purchaseQty} {g.unit}</div>
            </div>
            {g.candidates.length === 0 ? (
              <p className="text-xs text-gray-400">배정할 서울 외 발주 줄이 없습니다.</p>
            ) : (
              <div className="space-y-1.5">
                {g.candidates.map(c => (
                  <label key={c.orderItemId} className="flex items-center gap-3 text-sm cursor-pointer">
                    <input
                      type="radio"
                      name={`alloc-${g.productId}`}
                      checked={choice[g.productId] === c.orderItemId}
                      onChange={() => setChoice(prev => ({ ...prev, [g.productId]: c.orderItemId }))}
                    />
                    <span className="flex-1">{c.restaurantName}</span>
                    <span className="text-gray-600 tabular-nums">{c.qty} {c.unit}</span>
                    {c.exact && <span className="text-xs text-green-600">수량 일치</span>}
                  </label>
                ))}
              </div>
            )}
            {warn && <p className="text-xs text-amber-600">{warn}</p>}
            <button
              type="button"
              onClick={() => save(g)}
              disabled={busy === g.productId || !choice[g.productId]}
              className="w-full py-2 rounded-lg bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700 disabled:opacity-50"
            >
              {busy === g.productId ? '저장 중...' : '배정 저장'}
            </button>
          </div>
        )
      })}
    </div>
  )
}
