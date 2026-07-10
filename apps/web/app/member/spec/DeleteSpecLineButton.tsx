'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function DeleteSpecLineButton({
  lineId,
  specId,
  productName,
}: {
  lineId: string
  specId: string
  productName: string
}) {
  const router = useRouter()
  const [isPending, setIsPending] = useState(false)

  async function handleDelete() {
    if (!confirm(`"${productName}" 품목을 오늘 명세서에서 삭제하시겠습니까?`)) return
    setIsPending(true)
    try {
      const res = await fetch(`/api/member/spec-line?lineId=${lineId}&specId=${specId}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? '삭제 실패')
      router.refresh()
    } catch (e) {
      alert(`삭제 실패: ${e instanceof Error ? e.message : '알 수 없는 오류'}`)
    } finally {
      setIsPending(false)
    }
  }

  return (
    <button
      type="button"
      onClick={handleDelete}
      disabled={isPending}
      className="text-xs text-red-400 hover:text-red-600 px-2 py-1 rounded hover:bg-red-50 disabled:opacity-50 shrink-0"
    >
      {isPending ? '삭제 중...' : '삭제'}
    </button>
  )
}
