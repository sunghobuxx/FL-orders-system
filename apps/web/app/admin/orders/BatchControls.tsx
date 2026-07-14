'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

export default function BatchControls({ batchId }: { batchId: string }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [showDateChange, setShowDateChange] = useState(false)
  const todayKst = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const [newDate, setNewDate] = useState(todayKst)

  function handleDelete() {
    if (!confirm('이 발주를 삭제하시겠습니까?\n되돌릴 수 없습니다.')) return
    startTransition(async () => {
      const res = await fetch(`/api/admin/orders/${batchId}`, { method: 'DELETE' })
      const data = await res.json() as { success?: boolean; error?: string }
      if (!data.success) { alert(data.error ?? '삭제 실패'); return }
      router.refresh()
    })
  }

  async function handleDateChange() {
    if (!newDate) return
    const res = await fetch(`/api/admin/orders/${batchId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ businessDate: newDate }),
    })
    const data = await res.json() as { success?: boolean; error?: string }
    if (!data.success) { alert(data.error ?? '날짜 변경 실패'); return }
    setShowDateChange(false)
    router.refresh()
  }

  if (showDateChange) {
    return (
      <div className="flex items-center gap-1.5">
        <input
          type="date"
          value={newDate}
          onChange={e => setNewDate(e.target.value)}
          className="text-xs border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
        <button type="button" onClick={handleDateChange}
          className="text-xs px-2.5 py-1 rounded bg-brand-600 text-white font-medium hover:bg-brand-700">확인</button>
        <button type="button" onClick={() => setShowDateChange(false)}
          className="text-xs px-2.5 py-1 rounded bg-gray-200 text-gray-600 hover:bg-gray-300">취소</button>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-1.5">
      <button type="button" onClick={() => setShowDateChange(true)}
        className="text-xs px-2.5 py-1 rounded bg-gray-100 text-gray-600 hover:bg-gray-200 font-medium">
        날짜 변경
      </button>
      <button type="button" onClick={handleDelete} disabled={isPending}
        className="text-xs px-2.5 py-1 rounded bg-red-50 text-red-500 hover:bg-red-100 font-medium disabled:opacity-50">
        {isPending ? '삭제 중' : '삭제'}
      </button>
    </div>
  )
}
