'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function GarakClosedDateForm({
  rows,
  today,
}: {
  rows: { business_date: string; note: string | null }[]
  today: string
}) {
  const router = useRouter()
  const [date, setDate] = useState(today)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function add() {
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/admin/garak-closed-dates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ businessDate: date, note }),
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
    if (!confirm(`${businessDate} 휴무 등록을 지울까요? 그날은 다시 평소대로(서울·일산은 가락)로 돌아갑니다.`)) return
    setBusy(true)
    setError('')
    try {
      const res = await fetch(`/api/admin/garak-closed-dates?date=${businessDate}`, { method: 'DELETE' })
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
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
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
            placeholder="메모 (예: 추석 연휴)"
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={add}
            disabled={busy}
            className="shrink-0 bg-amber-600 text-white rounded-lg px-4 py-2 text-sm font-semibold hover:bg-amber-700 disabled:opacity-50"
          >
            휴무로 등록
          </button>
        </div>
        {error && <p className="text-xs text-red-500">{error}</p>}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {rows.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-gray-400">등록된 휴무일이 없습니다</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {rows.map(r => (
              <div key={r.business_date} className="flex items-center justify-between px-5 py-3">
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
    </div>
  )
}
