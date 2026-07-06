'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

export default function RecordPaymentButton({
  restaurantId,
  restaurantName,
}: {
  restaurantId: string
  restaurantName: string
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState('cash')
  const [loading, setLoading] = useState(false)

  async function handleSubmit() {
    const n = parseInt(amount.replace(/,/g, ''), 10)
    if (!n || n <= 0) { alert('금액을 입력하세요'); return }
    setLoading(true)
    try {
      const res = await fetch('/api/admin/finance/record-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ restaurantId, amount: n, method }),
      })
      const data = await res.json() as { success?: boolean; error?: string; applied?: number }
      if (!res.ok) throw new Error(data.error ?? '기록 실패')
      alert(`${data.applied?.toLocaleString()}원 입금 처리 완료`)
      setOpen(false)
      setAmount('')
      router.refresh()
    } catch (e) {
      alert(e instanceof Error ? e.message : '오류 발생')
    } finally {
      setLoading(false)
    }
  }

  if (open) {
    return (
      <div className="flex items-center gap-1.5 flex-wrap justify-center">
        <input
          type="text"
          placeholder="금액"
          value={amount}
          onChange={e => setAmount(e.target.value)}
          className="w-24 text-sm border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
        <select
          value={method}
          onChange={e => setMethod(e.target.value)}
          className="text-xs border border-gray-300 rounded px-1.5 py-1 focus:outline-none"
        >
          <option value="cash">현금</option>
          <option value="transfer">계좌이체</option>
          <option value="card">카드</option>
        </select>
        <button type="button" onClick={handleSubmit} disabled={loading}
          className="text-xs px-2.5 py-1 rounded bg-brand-600 text-white font-medium hover:bg-brand-700 disabled:opacity-50">
          {loading ? '...' : '기록'}
        </button>
        <button type="button" onClick={() => setOpen(false)}
          className="text-xs px-2.5 py-1 rounded bg-gray-200 text-gray-600 hover:bg-gray-300">
          취소
        </button>
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className="text-xs px-3 py-1.5 rounded-lg bg-brand-600 text-white font-semibold hover:bg-brand-700"
    >
      입금
    </button>
  )
}
