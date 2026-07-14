'use client'

import { useRouter } from 'next/navigation'

export function PrintButton({ date }: { date?: string } = {}) {
  return (
    <button
      type="button"
      onClick={() => {
        const url = `/member/spec/print${date ? `?date=${date}` : ''}`
        window.open(url, '_blank', 'width=800,height=1000')
      }}
      className="flex-1 rounded-lg border border-gray-300 bg-white px-5 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50"
    >
      프린트
    </button>
  )
}

export function PayButton({
  disabled,
  amount,
  orderName,
  refId,
  refType,
}: {
  disabled?: boolean
  amount: number
  orderName?: string
  refId?: string
  refType?: string
}) {
  const router = useRouter()
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => {
        if (disabled || !amount || amount <= 0) return
        const params = new URLSearchParams({
          amount: String(amount),
          ...(orderName ? { orderName } : {}),
          ...(refId ? { refId } : {}),
          ...(refType ? { refType } : {}),
        })
        router.push(`/member/payment?${params.toString()}`)
      }}
      className={`px-4 py-1.5 rounded-lg text-sm font-semibold text-white transition-colors ${
        disabled ? 'bg-gray-300 cursor-not-allowed' : 'bg-brand-600 hover:bg-brand-700'
      }`}
    >
      결제
    </button>
  )
}
