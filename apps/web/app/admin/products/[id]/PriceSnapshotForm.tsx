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
  productUnits,
}: {
  productId: string
  supplierProductId: string
  snapshots: Snapshot[]
  defaultUnit: string
  /** 이 품목이 쓰는 단위들 (품목 마스터의 기본 단위 + 허용 단위) */
  productUnits: string[]
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

  // 단위별 현재 단가 — 적용일이 가장 늦은 것 하나씩.
  //
  // 단위가 둘인 품목은 단위마다 값이 달라야 하는데, 이력만 보면 어느 단위가 비어 있는지
  // 알 수 없었다. 양파는 bag 단가가 6/15 에 멈춰 있었고 kg 단가만 계속 갱신됐다.
  const currentByUnit = new Map<string, Snapshot>()
  for (const s of [...snapshots].sort((a, b) => a.effective_from.localeCompare(b.effective_from))) {
    currentByUnit.set(s.unit, s)
  }
  const showUnitTable = productUnits.length > 1

  return (
    <div className="mt-2 space-y-2">
      {showUnitTable && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
          <p className="text-xs font-semibold text-amber-800 mb-1.5">단위별 현재 단가</p>
          <div className="space-y-1">
            {productUnits.map(u => {
              const cur = currentByUnit.get(u)
              return (
                <div key={u} className="flex items-center justify-between text-xs">
                  <span className="text-gray-700">{u}{u === defaultUnit ? ' (기본)' : ''}</span>
                  {cur ? (
                    <span className="tabular-nums text-gray-900">
                      {cur.sale_price.toLocaleString('ko-KR')}원
                      <span className="ml-1.5 text-gray-400">{cur.effective_from}</span>
                    </span>
                  ) : (
                    <span className="text-red-600 font-medium">단가 없음 → 기본 단가로 청구됨</span>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

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
                {productUnits.length > 0 && (
                  <optgroup label="이 품목의 단위">
                    {productUnits.map(u => <option key={`p-${u}`} value={u}>{u}</option>)}
                  </optgroup>
                )}
                <optgroup label="그 외">
                  {UNITS.filter(u => !productUnits.includes(u))
                    .map(u => <option key={u} value={u}>{u}</option>)}
                </optgroup>
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
