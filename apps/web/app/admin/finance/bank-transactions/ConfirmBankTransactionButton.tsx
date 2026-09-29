'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

export default function ConfirmBankTransactionButton({
  bankTransactionId,
  restaurants,
  recommendedRestaurantId,
}: {
  bankTransactionId: string
  restaurants: Array<{ id: string; name: string }>
  recommendedRestaurantId: string | null
}) {
  const router = useRouter()
  const [restaurantId, setRestaurantId] = useState(recommendedRestaurantId ?? '')
  const [loading, setLoading] = useState(false)

  async function handleConfirm() {
    if (!restaurantId) { alert('업체를 선택하세요.'); return }
    setLoading(true)
    try {
      const res = await fetch('/api/admin/finance/confirm-bank-transaction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bankTransactionId, restaurantId }),
      })
      const data = await res.json() as { success?: boolean; error?: string; applied?: number }
      if (!res.ok) throw new Error(data.error ?? '확정 실패')
      router.refresh()
    } catch (e) {
      alert(e instanceof Error ? e.message : '오류 발생')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex items-center gap-1.5">
      <select
        value={restaurantId}
        onChange={e => setRestaurantId(e.target.value)}
        className={`text-xs border rounded px-1.5 py-1.5 max-w-[9rem] focus:outline-none ${
          recommendedRestaurantId ? 'border-green-400' : 'border-gray-300'
        }`}
      >
        <option value="">업체 선택</option>
        {restaurants.map(r => (
          <option key={r.id} value={r.id}>{r.name}</option>
        ))}
      </select>
      <button
        type="button"
        onClick={handleConfirm}
        disabled={loading || !restaurantId}
        className="text-xs px-3 py-1.5 rounded-lg bg-brand-600 text-white font-semibold hover:bg-brand-700 disabled:opacity-50"
      >
        {loading ? '...' : '확정'}
      </button>
    </div>
  )
}
