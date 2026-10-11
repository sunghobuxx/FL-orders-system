'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function RestaurantGarakOverrideForm({
  restaurantId,
  rows,
}: {
  restaurantId: string
  rows: { business_date: string; note: string | null }[]
}) {
  const router = useRouter()
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const [date, setDate] = useState(tomorrow)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function add() {
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/admin/restaurant-garak-overrides', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ restaurantId, businessDate: date, note }),
      })
      const data = await res.json() as { error?: string }
      if (!res.ok) throw new Error(data.error ?? '등록 실패')
      setNote('')
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : '등록 실패')
    } finally {
      setBusy(false)
    }
  }

  async function remove(businessDate: string) {
    if (!confirm(`${businessDate} 예외를 지울까요? 그날은 다시 평소대로(가락이 열려 있으면 가락)로 돌아갑니다.`)) return
    setBusy(true)
    setError('')
    try {
      const res = await fetch(
        `/api/admin/restaurant-garak-overrides?restaurantId=${restaurantId}&date=${businessDate}`,
        { method: 'DELETE' },
      )
      const data = await res.json() as { error?: string }
      if (!res.ok) throw new Error(data.error ?? '삭제 실패')
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : '삭제 실패')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <input
          type="date"
          value={date}
          onChange={e => setDate(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
        />
        <input
          type="text"
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder="메모 (예: 가락 매입 전환 전)"
          className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm"
        />
        <button
          type="button"
          onClick={add}
          disabled={busy}
          className="shrink-0 bg-amber-600 text-white rounded-lg px-4 py-2 text-sm font-semibold hover:bg-amber-700 disabled:opacity-50"
        >
          남촌으로 등록
        </button>
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}

      {rows.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-2">등록된 예외가 없습니다</p>
      ) : (
        <div className="divide-y divide-gray-100 border border-gray-100 rounded-lg">
          {rows.map(r => (
            <div key={r.business_date} className="flex items-center justify-between px-3 py-2">
              <div>
                <span className="text-sm font-semibold text-gray-900">{r.business_date}</span>
                {r.note && <span className="text-xs text-gray-400 ml-2">{r.note}</span>}
              </div>
              <button
                type="button"
                onClick={() => remove(r.business_date)}
                disabled={busy}
                className="text-xs px-3 py-1.5 rounded-lg border border-gray-300 text-gray-500 hover:bg-gray-50 disabled:opacity-50"
              >
                취소
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
