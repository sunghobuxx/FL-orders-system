'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

const UNITS = ['kg', 'g', '박스', '팩', '단', '통', '판', '포', '망', 'ea', 'bag', 'pack', 'bottle', 'box']

interface Snapshot {
  id: string
  sale_price: number
  purchase_price: number
  unit: string
  effective_from: string
}

export default function PriceSnapshotForm({
  productId,
  supplierProductId,
  snapshots,
  defaultUnit,
}: {
  productId: string
  supplierProductId: string
  snapshots: Snapshot[]
  defaultUnit: string
}) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [open, setOpen] = useState(true)
  const [listOpen, setListOpen] = useState(false)

  const todayKst = (() => {
    const d = new Date(Date.now() + 9 * 60 * 60 * 1000)
    return d.toISOString().split('T')[0]
  })()

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const d = new FormData(e.currentTarget)
    try {
      const res = await fetch('/api/admin/products/price-snapshots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId,
          supplierProductId,
          sale_price: Number(d.get('sale_price')),
          purchase_price: Number(d.get('purchase_price') || 0),
          unit: d.get('unit'),
          effective_from: d.get('effective_from'),
        }),
      })
      const data = await res.json() as { error?: string }
      if (!res.ok) { setError(data.error ?? '등록 실패'); return }
      setOpen(false)
      router.refresh()
    } catch {
      setError('오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mt-2 space-y-2">
      {snapshots.length > 0 ? (
        <div className="rounded-lg border border-gray-100 overflow-hidden">
          <button
            type="button"
            onClick={() => setListOpen(p => !p)}
            className="w-full flex items-center justify-between px-3 py-2 bg-gray-50 text-xs text-gray-500 hover:bg-gray-100"
          >
            <span>단가 이력 ({snapshots.length}건)</span>
            <span>{listOpen ? '▲' : '▼'}</span>
          </button>
          {listOpen && (
            <table className="w-full text-xs">
              <thead className="bg-gray-50 text-gray-500 border-t border-gray-100">
                <tr>
                  <th className="text-left px-3 py-2">적용일</th>
                  <th className="text-right px-3 py-2">판매단가</th>
                  <th className="text-right px-3 py-2">매입단가</th>
                  <th className="text-left px-3 py-2">단위</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {snapshots.map(s => (
                  <tr key={s.id} className="bg-white">
                    <td className="px-3 py-1.5 text-gray-700">{s.effective_from}</td>
                    <td className="px-3 py-1.5 text-right font-medium text-gray-900">{s.sale_price.toLocaleString('ko-KR')}원</td>
                    <td className="px-3 py-1.5 text-right text-gray-500">{s.purchase_price.toLocaleString('ko-KR')}원</td>
                    <td className="px-3 py-1.5 text-gray-500">{s.unit}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ) : (
        <p className="text-xs text-gray-400">등록된 단가가 없습니다.</p>
      )}

      {open ? (
        <form onSubmit={handleSubmit} className="p-3 rounded-lg border border-gray-200 bg-gray-50 space-y-2">
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs text-gray-500 mb-1">판매단가 (원)*</label>
              <input
                name="sale_price"
                type="number"
                required
                min="0"
                placeholder="0"
                className="w-full rounded border border-gray-200 bg-white px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">매입단가 (원)</label>
              <input
                name="purchase_price"
                type="number"
                min="0"
                placeholder="0"
                className="w-full rounded border border-gray-200 bg-white px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">단위*</label>
              <select
                name="unit"
                required
                defaultValue={defaultUnit}
                className="w-full rounded border border-gray-200 bg-white px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-brand-500"
              >
                {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">적용일*</label>
              <input
                name="effective_from"
                type="date"
                required
                defaultValue={todayKst}
                className="w-full rounded border border-gray-200 bg-white px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="flex-1 rounded border border-gray-300 px-2 py-1.5 text-xs text-gray-700 hover:bg-gray-100"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 rounded bg-brand-600 px-2 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {loading ? '...' : '단가 등록'}
            </button>
          </div>
        </form>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="text-xs text-brand-600 hover:underline"
        >
          + 단가 등록
        </button>
      )}
    </div>
  )
}
