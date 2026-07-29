'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

import type { DispatchEditableRow } from '@/lib/dispatch/current-items'

function fmtQty(qty: number) {
  return qty % 1 === 0 ? String(qty) : qty.toFixed(1)
}

function shortName(name: string) {
  const parts = name.trim().split(' ')
  return parts.length > 1 ? parts[parts.length - 1] : name
}

interface Group {
  name: string
  unit: string
  qty: number
  rows: DispatchEditableRow[]
}

/**
 * 발주 문자에 나갈 수량을 업체별로 고친다.
 *
 * 여기서 고친 값은 dispatch_job_items 에만 들어가므로 명세서·정산 금액은 그대로다.
 * 합계는 업체별 값을 더해 만들기 때문에 문자 본문과 항상 같다.
 */
export default function DispatchQtyEditor({ groups }: { groups: Group[] }) {
  const router = useRouter()
  const [edited, setEdited] = useState<Record<string, number>>({})
  const [saving, setSaving] = useState<string | null>(null)
  const [error, setError] = useState('')

  function qtyOf(row: DispatchEditableRow) {
    return edited[row.id] ?? row.qty
  }

  async function save(row: DispatchEditableRow, raw: string) {
    const trimmed = raw.trim()
    const next = trimmed === '' ? null : Number(trimmed)
    if (next !== null && (!Number.isFinite(next) || next < 0)) {
      setError('수량은 0 이상의 숫자여야 합니다')
      return
    }
    if (next !== null && next === qtyOf(row)) return

    setSaving(row.id)
    setError('')
    try {
      const res = await fetch('/api/admin/orders/items', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId: row.id, qty: next }),
      })
      const data = await res.json() as { success?: boolean; qty?: number; error?: string }
      if (data.success) {
        setEdited(prev => ({ ...prev, [row.id]: Number(data.qty) }))
        router.refresh()
      } else {
        setError(data.error ?? '저장 실패')
      }
    } catch {
      setError('오류가 발생했습니다')
    } finally {
      setSaving(null)
    }
  }

  return (
    <div className="divide-y divide-gray-50">
      {error && (
        <p className="px-5 py-2 text-xs text-red-600 bg-red-50">{error}</p>
      )}
      {groups.map(group => {
        const total = group.rows.reduce((sum, row) => sum + qtyOf(row), 0)
        const changed = group.rows.some(row => qtyOf(row) !== row.orderQty)
        return (
          <div key={`${group.name}-${group.unit}`} className="px-5 py-2.5">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-800">
                {group.name}
                {changed && (
                  <span className="ml-1.5 text-[11px] text-amber-600 font-medium">수정됨</span>
                )}
              </span>
              <span className="text-sm text-gray-600 tabular-nums">
                {fmtQty(total)} {group.unit}
              </span>
            </div>
            <div className="mt-1.5 space-y-1">
              {group.rows.map(row => {
                const current = qtyOf(row)
                const isChanged = current !== row.orderQty
                return (
                  <div key={row.id} className="flex items-center gap-2">
                    <span className="text-xs text-gray-400 flex-1 truncate">
                      {shortName(row.restaurantName) || '—'}
                    </span>
                    {isChanged && (
                      <span className="text-[11px] text-gray-300 line-through tabular-nums">
                        {fmtQty(row.orderQty)}
                      </span>
                    )}
                    <input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step="any"
                      defaultValue={current}
                      disabled={saving === row.id}
                      onBlur={e => save(row, e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') e.currentTarget.blur()
                      }}
                      className={`w-16 px-2 py-1 text-xs text-right tabular-nums rounded-md border outline-none
                        focus:border-blue-400 focus:ring-1 focus:ring-blue-200 disabled:opacity-50
                        ${isChanged ? 'border-amber-300 bg-amber-50 text-amber-800' : 'border-gray-200 text-gray-700'}`}
                    />
                    <span className="text-xs text-gray-400 w-10">{row.unit}</span>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
      <p className="px-5 py-2 bg-gray-50 text-[11px] text-gray-400">
        여기서 고친 수량은 발주 문자에만 반영됩니다. 명세서·정산 금액은 그대로입니다.
      </p>
    </div>
  )
}
