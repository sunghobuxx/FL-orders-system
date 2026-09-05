'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface DeleteResult {
  needsConfirm?: boolean
  orderItemCount?: number
  priceSnapshotCount?: number
  error?: string
}

export default function DeleteSupplierProductButton({
  supplierProductId,
}: {
  supplierProductId: string
}) {
  const router = useRouter()
  const [confirm, setConfirm] = useState(false)
  const [loading, setLoading] = useState(false)
  // 발주 이력이 걸려 있으면 몇 건인지 보여주고 한 번 더 묻는다.
  const [pending, setPending] = useState<DeleteResult | null>(null)

  async function callDelete(force: boolean) {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/products/supplier', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ supplierProductId, force }),
      })
      const data = await res.json() as DeleteResult
      if (!res.ok) { alert(data.error ?? '삭제 실패'); return }

      // 확인이 필요하면 건수를 띄우고 멈춘다
      if (data.needsConfirm) {
        if ((data.orderItemCount ?? 0) === 0 && (data.priceSnapshotCount ?? 0) === 0) {
          await callDelete(true)   // 걸린 게 없으면 바로 지운다
          return
        }
        setPending(data)
        return
      }

      setPending(null)
      setConfirm(false)
      router.refresh()
    } catch {
      alert('오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }

  // 발주·단가가 걸려 있을 때의 안내
  if (pending) {
    const orders = pending.orderItemCount ?? 0
    const snaps = pending.priceSnapshotCount ?? 0
    return (
      <span className="inline-flex flex-col gap-1 text-xs">
        <span className="text-amber-700">
          {orders > 0 && <>발주 {orders}건에 연결돼 있습니다. </>}
          {snaps > 0 && <>단가 {snaps}건도 함께 지워집니다. </>}
          <span className="text-gray-500">발주 기록은 지우지 않고 연결만 끊습니다.</span>
        </span>
        <span className="flex items-center gap-1.5">
          <button
            onClick={() => callDelete(true)}
            disabled={loading}
            className="text-red-600 font-medium hover:underline disabled:opacity-50"
          >
            {loading ? '...' : '그래도 해제'}
          </button>
          <button
            onClick={() => { setPending(null); setConfirm(false) }}
            className="text-gray-400 hover:underline"
          >
            취소
          </button>
        </span>
      </span>
    )
  }

  if (confirm) {
    return (
      <span className="flex items-center gap-1.5">
        <button
          onClick={() => callDelete(false)}
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
