'use client'

import { useRouter } from 'next/navigation'
import { useRef, useState, useTransition } from 'react'

export function PaymentForm({
  restaurantId,
  totalBalance,
}: {
  restaurantId: string
  totalBalance: number
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [method, setMethod] = useState<'cash' | 'card'>('cash')
  const inputRef = useRef<HTMLInputElement>(null)

  function handleCashSubmit() {
    const amount = Number(inputRef.current?.value ?? 0)
    if (!amount || amount <= 0) {
      setError('입금액을 입력하세요.')
      return
    }
    setError(null)
    startTransition(async () => {
      const res = await fetch('/api/admin/finance/record-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ restaurantId, amount, method: 'cash' }),
      })
      const data = await res.json()
      if (data.error) {
        setError(data.error)
      } else {
        if (inputRef.current) inputRef.current.value = ''
        router.refresh()
      }
    })
  }

  return (
    <div className="space-y-3">
      {/* 방법 선택 */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => { setMethod('cash'); setError(null) }}
          className={`flex-1 py-2.5 rounded-lg text-sm font-semibold border transition-colors ${
            method === 'cash'
              ? 'bg-gray-800 text-white border-gray-800'
              : 'text-gray-600 border-gray-300 hover:bg-gray-50'
          }`}
        >
          현금·이체
        </button>
        <button
          type="button"
          onClick={() => { setMethod('card'); setError(null) }}
          className={`flex-1 py-2.5 rounded-lg text-sm font-semibold border transition-colors ${
            method === 'card'
              ? 'bg-brand-600 text-white border-brand-600'
              : 'text-gray-600 border-gray-300 hover:bg-gray-50'
          }`}
        >
          카드 (Toss)
        </button>
      </div>

      {/* 현금·이체 */}
      {method === 'cash' && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">₩</span>
              <input
                ref={inputRef}
                type="number"
                min="1"
                placeholder="입금액"
                className="w-full border border-gray-200 rounded-lg pl-8 pr-3 py-2.5 text-sm focus:outline-none focus:border-gray-400"
                onKeyDown={e => e.key === 'Enter' && handleCashSubmit()}
              />
            </div>
            <button
              type="button"
              onClick={handleCashSubmit}
              disabled={isPending}
              className="bg-brand-600 text-white rounded-lg px-6 py-2.5 text-sm font-semibold hover:bg-brand-700 disabled:opacity-50 whitespace-nowrap"
            >
              {isPending ? '처리 중...' : '확인'}
            </button>
          </div>
          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>
      )}

      {/* 카드 (Toss) */}
      {method === 'card' && (
        <div className="rounded-lg border border-brand-200 bg-brand-50 px-5 py-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600">결제 금액</span>
            <span className="text-base font-bold text-gray-900">
              {totalBalance.toLocaleString()}원
            </span>
          </div>
          <button
            type="button"
            disabled
            className="w-full rounded-lg bg-gray-300 text-gray-500 py-3 text-sm font-semibold cursor-not-allowed"
          >
            Toss 카드결제 준비중
          </button>
          <p className="text-xs text-gray-400 text-center">
            Toss 결제 키 등록 후 활성화됩니다
          </p>
        </div>
      )}
    </div>
  )
}
