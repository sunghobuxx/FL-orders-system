'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

const UNITS = ['kg', 'g', '박스', '팩', '단', '통', '판', '포', '망', 'ea', 'bag', 'pack', 'bottle', 'box']

interface SupplierOption {
  id: string
  name: string
}

export default function AddSupplierProductForm({
  productId,
  suppliers,
}: {
  productId: string
  suppliers: SupplierOption[]
}) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [open, setOpen] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const d = new FormData(e.currentTarget)
    try {
      const res = await fetch('/api/admin/products/supplier', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId,
          supplierId: d.get('supplierId'),
          supplierName: d.get('supplierName'),
          purchaseUnit: d.get('purchaseUnit'),
        }),
      })
      const data = await res.json() as { error?: string }
      if (!res.ok) { setError(data.error ?? '추가 실패'); return }
      setOpen(false)
      router.refresh()
    } catch {
      setError('오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg border border-brand-300 px-3 py-1.5 text-xs font-medium text-brand-600 hover:bg-brand-50"
      >
        + 공급처 연결
      </button>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="mt-3 p-4 rounded-lg border border-gray-200 bg-gray-50 space-y-3">
      <p className="text-xs font-semibold text-gray-700">공급처 연결 추가</p>
      {error && <p className="text-xs text-red-600">{error}</p>}

      <div>
        <label className="block text-xs text-gray-500 mb-1">공급처</label>
        <select
          name="supplierId"
          required
          className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        >
          <option value="">선택하세요</option>
          {suppliers.map(s => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-xs text-gray-500 mb-1">공급처 품목명 (공급처가 부르는 명칭)</label>
        <input
          name="supplierName"
          placeholder="예: 대파"
          className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
      </div>

      <div>
        <label className="block text-xs text-gray-500 mb-1">매입 단위</label>
        <select
          name="purchaseUnit"
          required
          className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        >
          <option value="">선택하세요</option>
          {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
        </select>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-100"
        >
          취소
        </button>
        <button
          type="submit"
          disabled={loading}
          className="flex-1 rounded-lg bg-brand-600 px-3 py-2 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {loading ? '추가 중...' : '추가'}
        </button>
      </div>
    </form>
  )
}
