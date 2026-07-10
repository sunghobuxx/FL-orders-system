'use client'

import { useRouter } from 'next/navigation'
import { useTransition } from 'react'

const NEXT_STATUS: Record<string, { label: string; next: string; className: string }> = {
  submitted: { label: '→ 알림톡 발송', next: 'validated', className: 'bg-green-600 text-white hover:bg-green-700' },
  validated: { label: '→ 배송중',      next: 'ordered',   className: 'bg-gray-200 text-gray-700 hover:bg-gray-300' },
  ordered:   { label: '→ 배송완료',    next: 'dispatched', className: 'bg-gray-200 text-gray-700 hover:bg-gray-300' },
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
      className={`text-xs px-2.5 py-1 rounded disabled:opacity-50 whitespace-nowrap font-medium ${config.className}`}
    >
      {isPending ? '...' : config.label}
    </button>
  )
}
