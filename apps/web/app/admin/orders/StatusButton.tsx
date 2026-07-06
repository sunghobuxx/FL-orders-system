'use client'

import { useRouter } from 'next/navigation'
import { useTransition } from 'react'

const NEXT_STATUS: Record<string, { label: string; next: string }> = {
  submitted:  { label: '→ 알림톡 발송', next: 'validated' },
  validated:  { label: '→ 배송중',      next: 'ordered' },
  ordered:    { label: '→ 배송완료',    next: 'dispatched' },
}

export default function StatusButton({ batchId, currentStatus }: { batchId: string; currentStatus: string }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const config = NEXT_STATUS[currentStatus]
  if (!config) return null

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() => startTransition(async () => {
        await fetch('/api/admin/orders/update-status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ batchId, newStatus: config.next }),
        })
        router.refresh()
      })}
      className="text-xs px-2.5 py-1 rounded bg-gray-200 text-gray-700 hover:bg-gray-300 disabled:opacity-50 whitespace-nowrap font-medium"
    >
      {isPending ? '...' : config.label}
    </button>
  )
}
