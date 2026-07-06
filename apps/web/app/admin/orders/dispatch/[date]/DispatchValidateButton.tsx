'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

export default function DispatchValidateButton({ businessDate }: { businessDate: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function handleClick() {
    if (!confirm(`${businessDate} 발주를 확정하시겠습니까?\n품목 수량 편집이 활성화되고 알림톡은 새벽 2:30 자동 발송됩니다.`)) return
    setLoading(true)
    try {
      const res = await fetch('/api/admin/orders/validate-batches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ businessDate }),
      })
      const data = await res.json() as { success?: boolean; error?: string }
      if (!res.ok) throw new Error(data.error ?? '발주 확정 실패')
      router.refresh()
    } catch (e) {
      alert(e instanceof Error ? e.message : '오류 발생')
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading}
      className="text-sm px-4 py-2 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700 disabled:opacity-50"
    >
      {loading ? '처리 중...' : '발주 확정 (품목 삭제·수량 변경 활성화)'}
    </button>
  )
}
