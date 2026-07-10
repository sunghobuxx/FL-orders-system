'use client'

import { useRouter } from 'next/navigation'
import { useTransition } from 'react'

export default function DeleteOrderButton({ batchId }: { batchId: string }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  return (
    <button
      type="button"
      onClick={() => {
        if (!confirm('발주를 삭제하시겠습니까?')) return
        startTransition(async () => {
          const res = await fetch(`/api/member/orders/${batchId}`, { method: 'DELETE' })
          const data = await res.json()
          if (!res.ok) { alert(data.error ?? '삭제 실패'); return }
          router.push('/member/order')
          router.refresh()
        })
      }}
      disabled={isPending}
      className="flex-1 text-center rounded-lg border border-red-200 text-red-500 text-sm font-semibold py-3 hover:bg-red-50 disabled:opacity-50"
    >
      {isPending ? '삭제 중...' : '발주 취소'}
    </button>
  )
}
