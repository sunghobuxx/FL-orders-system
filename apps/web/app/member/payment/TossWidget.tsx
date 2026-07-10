'use client'

import { useState, useRef } from 'react'

export default function TossWidget({
  clientKey,
  customerKey,
  amount,
  orderId,
  orderName,
  customerName,
}: {
  clientKey: string
  customerKey: string
  amount: number
  orderId: string
  orderName: string
  customerName: string
}) {
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const widgetRef = useRef<any>(null)

  const requestPayment = async () => {
    if (!widgetRef.current) return
    try {
      await widgetRef.current.requestPayment({
        orderId,
        orderName,
        customerName,
        successUrl: `${window.location.origin}/member/payment/success`,
        failUrl: `${window.location.origin}/member/payment/fail`,
      })
    } catch (e: any) {
      if (e?.code !== 'USER_CANCEL') setError(e?.message ?? '결제 요청 중 오류가 발생했습니다')
    }
  }

  if (error) return (
    <div className="rounded-xl bg-red-50 border border-red-200 p-6 text-center">
      <p className="text-sm text-red-600 font-semibold">{error}</p>
      <a href="/member/settlement" className="mt-3 inline-block text-sm text-gray-500 hover:text-gray-700">← 돌아가기</a>
    </div>
  )

  return (
    <div className="space-y-4">
      <div id="toss-payment-method" className="min-h-40" />
      <div id="toss-agreement" />
      <div className="flex gap-3 pt-2">
        <a
          href="/member/settlement"
          className="flex-1 text-center rounded-lg border border-gray-300 px-4 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50"
        >
          취소
        </a>
        <button
          type="button"
          onClick={requestPayment}
          disabled={!ready}
          className="flex-1 rounded-lg bg-brand-600 py-3 text-sm font-bold text-white hover:bg-brand-700 disabled:opacity-40"
        >
          {ready ? `${amount.toLocaleString()}원 결제하기` : '위젯 로딩 중...'}
        </button>
      </div>
    </div>
  )
}
