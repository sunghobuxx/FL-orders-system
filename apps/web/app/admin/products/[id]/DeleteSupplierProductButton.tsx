'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function DeleteSupplierProductButton({
  supplierProductId,
}: {
  supplierProductId: string
}) {
  const router = useRouter()
  const [confirm, setConfirm] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleDelete() {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/products/supplier', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ supplierProductId }),
      })
      if (res.ok) {
        router.refresh()
      } else {
        const data = await res.json() as { error?: string }
        alert(data.error ?? '삭제 실패')
      }
    } catch {
      alert('오류가 발생했습니다.')
    } finally {
      setLoading(false)
      setConfirm(false)
    }
  }

  if (confirm) {
    return (
      <span className="flex items-center gap-1.5">
        <button
          onClick={handleDelete}
          disabled={loading}
          className="text-xs text-red-600 font-medium hover:underline disabled:opacity-50"
        >
          {loading ? '...' : '확인'}
        </button>
        <button
          onClick={() => setConfirm(false)}
          className="text-xs text-gray-400 hover:underline"
        >
          취소
        </button>
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
