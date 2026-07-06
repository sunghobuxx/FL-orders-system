'use client'

import { useRouter } from 'next/navigation'
import { useTransition } from 'react'

export default function DeliveryConfirmButton({ batchId }: { batchId: string }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() => startTransition(async () => {
        const res = await fetch('/api/admin/orders/update-status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ batchId, newStatus: 'dispatched' }),
        })
        const data = await res.json() as { error?: string }
        if (!data.error) router.push('/admin/orders')
      })}
      className="rounded-lg bg-brand-600 text-white px-6 py-2.5 text-sm font-semibold hover:bg-brand-700 disabled:opacity-50"
    >
      {isPending ? '처리 중...' : '② 하차 확인'}
    </button>
  )
}
