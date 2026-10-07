'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

const fmt = (n: number) => `${Math.round(n).toLocaleString()}원`

export default function ConfirmBankTransactionButton({
  bankTransactionId,
  amount,
  restaurants,
  recommendedRestaurantId,
}: {
  bankTransactionId: string
  amount: number
  restaurants: Array<{ id: string; name: string; balance: number }>
  recommendedRestaurantId: string | null
}) {
  const router = useRouter()
  const [restaurantId, setRestaurantId] = useState(recommendedRestaurantId ?? '')
  const [loading, setLoading] = useState(false)

  const selected = restaurants.find(r => r.id === restaurantId)
  // 입금액이 미수금보다 많으면 [확정] 은 거절된다 — 그 초과분을 보여주고, 원하면 따로 적립 처리한다.
  const excess = selected ? Math.max(0, amount - selected.balance) : 0

  async function call(url: string, body: Record<string, unknown>) {
    setLoading(true)
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const data = await res.json() as { success?: boolean; error?: string }
      if (!res.ok) throw new Error(data.error ?? '처리 실패')
      router.refresh()
    } catch (e) {
      alert(e instanceof Error ? e.message : '오류 발생')
    } finally {
      setLoading(false)
    }
  }

  async function handleConfirm() {
    if (!restaurantId) { alert('업체를 선택하세요.'); return }
    await call('/api/admin/finance/confirm-bank-transaction', { bankTransactionId, restaurantId })
  }

  async function handleConfirmWithCredit() {
    if (!restaurantId || !selected) { alert('업체를 선택하세요.'); return }
    const appliedPart = Math.min(amount, selected.balance)
    const msg = appliedPart > 0
      ? `미수금 ${fmt(appliedPart)}은 입금 처리하고, 나머지 ${fmt(excess)}은 적립금으로 넣습니다. 계속할까요?`
      : `이 업체는 지금 미수금이 없습니다. 입금 ${fmt(amount)} 전액을 적립금으로 넣습니다. 계속할까요?`
    if (!confirm(msg)) return
    await call('/api/admin/finance/confirm-bank-transaction', { bankTransactionId, restaurantId, allowCredit: true })
  }

  async function handleDismiss() {
    if (!confirm('이미 다른 방식(현금·계좌이체 직접 입력 등)으로 처리된 입금이면 목록에서만 지웁니다. 미수금은 바뀌지 않습니다. 계속할까요?')) return
    await call('/api/admin/finance/dismiss-bank-transaction', { bankTransactionId })
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-1.5 flex-wrap justify-end">
        <div className="flex flex-col items-end">
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
          {/* 선택한 업체의 지금 미수금. 입금액과 다르면 [확정] 이 막히는 이유를 누르기 전에 알 수 있다. */}
          {selected && (
            <span className="text-[10px] text-gray-400 mt-0.5">미수금 {selected.balance.toLocaleString()}원</span>
          )}
        </div>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={loading || !restaurantId}
          className="text-xs px-3 py-1.5 rounded-lg bg-brand-600 text-white font-semibold hover:bg-brand-700 disabled:opacity-50"
        >
          {loading ? '...' : '확정'}
        </button>
        <button
          type="button"
          onClick={handleDismiss}
          disabled={loading}
          className="text-xs px-2.5 py-1.5 rounded-lg border border-gray-300 text-gray-500 hover:bg-gray-50 disabled:opacity-50"
          title="이미 손으로 입력해 둔 입금이면 목록에서만 지웁니다"
        >
          이미 처리됨
        </button>
      </div>
      {/* 초과분이 있을 때만 보인다 — 기본 [확정] 은 계속 거절하고, 적립은 이 버튼을 따로 눌러야만 된다. */}
      {selected && excess > 0 && (
        <button
          type="button"
          onClick={handleConfirmWithCredit}
          disabled={loading}
          className="text-[11px] px-2.5 py-1 rounded border border-blue-300 text-blue-700 hover:bg-blue-50 disabled:opacity-50"
          title="초과분을 적립금으로 넣고 입금 처리합니다"
        >
          초과분 {fmt(excess)} 적립 처리
        </button>
      )}
    </div>
  )
}
