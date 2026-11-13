'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

// 공급처 연결 해제. 행을 지우지 않고 비활성으로만 돌린다 —
// 업체별 발주·단가 기록은 그대로 남고, 「다시 연결」로 되살릴 수 있다.
export default function DeleteSupplierProductButton({
  supplierProductId,
}: {
  supplierProductId: string
}) {
  const router = useRouter()
  const [confirm, setConfirm] = useState(false)
  const [loading, setLoading] = useState(false)

  async function unlink() {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/products/supplier', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ supplierProductId }),
      })
      const data = await res.json() as { error?: string }
      if (!res.ok) { alert(data.error ?? '해제 실패'); return }
      setConfirm(false)
      router.refresh()
    } catch {
      alert('오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }

  if (confirm) {
    return (
      <span className="inline-flex flex-col items-end gap-1 text-xs">
        <span className="text-gray-500">발주·단가 기록은 그대로 남고, 나중에 다시 연결할 수 있습니다.</span>
        <span className="flex items-center gap-1.5">
          <button
            onClick={unlink}
            disabled={loading}
            className="text-red-600 font-medium hover:underline disabled:opacity-50"
          >
            {loading ? '...' : '해제'}
          </button>
          <button
            onClick={() => setConfirm(false)}
            className="text-gray-400 hover:underline"
          >
            취소
          </button>
        </span>
      </span>
    )
  }

  return (
    <button
      onClick={() => setConfirm(true)}
      className="text-xs text-red-400 hover:text-red-600"
    >
      연결 해제
    </button>
  )
}
