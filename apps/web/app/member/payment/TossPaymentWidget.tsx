'use client'

import { useEffect, useRef, useState } from 'react'
import type { PaymentWidgetInstance } from '@tosspayments/payment-widget-sdk'

interface Props {
  clientKey: string
  amount: number
  orderName: string
  orgName: string
  refId?: string
  refType?: string
}

export default function TossPaymentWidget({ clientKey, amount, orderName, orgName }: Props) {
  const widgetRef = useRef<PaymentWidgetInstance | null>(null)
  const [ready, setReady] = useState(false)
  const orderId = useRef(`ord-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`)

  useEffect(() => {
    let mounted = true
    ;(async () => {
      const { loadPaymentWidget } = await import('@tosspayments/payment-widget-sdk')
      const widget = await loadPaymentWidget(clientKey, '익명')
      if (!mounted) return
      widgetRef.current = widget
      await widget.renderPaymentMethods('#toss-payment-methods', { value: amount, currency: 'KRW', country: 'KR' })
      await widget.renderAgreement('#toss-agreement')
      setReady(true)
    })()
    return () => { mounted = false }
  }, [clientKey, amount])

  async function handlePay() {
    if (!widgetRef.current || !ready) return
    await widgetRef.current.requestPayment({
      orderId: orderId.current,
      orderName,
      customerName: orgName,
      successUrl: `${window.location.origin}/member/payment/success`,
      failUrl: `${window.location.origin}/member/payment/fail`,
    })
  }

  return (
    <div className="w-full max-w-sm space-y-3">
      <div id="toss-payment-methods" />
      <div id="toss-agreement" />
      <button
        type="button"
        onClick={handlePay}
        disabled={!ready}
        className="w-full rounded-xl bg-brand-600 py-3.5 text-sm font-bold text-white hover:bg-brand-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
      >
        {ready ? '결제하기' : '로딩 중...'}
      </button>
    </div>
  )
}
