'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

// 해제했던 공급처를 다시 연결한다. 품목명·매입단위·단가 기록이 해제 전 그대로 돌아오고,
// 이 공급처가 해당 품목의 발주를 우선해서 받는다.
export default function ReconnectSupplierProductButton({
  supplierProductId,
}: {
  supplierProductId: string
}) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function reconnect() {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/products/supplier', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ supplierProductId }),
      })
      const data = await res.json() as { error?: string }
      if (!res.ok) { alert(data.error ?? '연결 실패'); return }
      router.refresh()
    } catch {
      alert('오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={reconnect}
      disabled={loading}
      className="text-xs font-medium text-brand-600 hover:underline disabled:opacity-50"
    >
      {loading ? '...' : '다시 연결'}
    </button>
  )
}
