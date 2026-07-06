'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

interface Line {
  id: string
  product_name: string
  qty: number
  unit: string
  unit_price: number
  vat_amount: number
  taxable_flag: boolean
}

export default function SpecEditPanel({ specId, lines }: { specId: string; lines: Line[] }) {
  const router = useRouter()
  const [isSaving, setIsSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')

  const [editQtys, setEditQtys] = useState<Record<string, string>>(
    Object.fromEntries(lines.map(l => [l.id, String(l.qty)]))
  )
  const [editPrices, setEditPrices] = useState<Record<string, string>>(
    Object.fromEntries(lines.map(l => [l.id, String(l.unit_price)]))
  )

  const linesKey = lines.map(l => `${l.id}:${l.qty}:${l.unit_price}`).join('|')
  useEffect(() => {
    setEditQtys(Object.fromEntries(lines.map(l => [l.id, String(l.qty)])))
    setEditPrices(Object.fromEntries(lines.map(l => [l.id, String(l.unit_price)])))
    setSaveMsg('')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linesKey])

  const fmt = (n: number) => n.toLocaleString()

  function calcAmount(lineId: string, line: Line) {
    const qty = parseFloat(editQtys[lineId] ?? String(line.qty)) || 0
    const price = parseInt(editPrices[lineId] ?? String(line.unit_price), 10) || 0
    const base = qty * price
    const vat = line.taxable_flag ? Math.round(base * 0.1) : 0
    return base + vat
  }

  const totalAmount = lines.reduce((s, l) => s + calcAmount(l.id, l), 0)

  async function handleSave() {
    setIsSaving(true)
    setSaveMsg('')
    try {
      const updatedLines = lines.map(l => ({
        id: l.id,
        qty: parseFloat(editQtys[l.id] ?? String(l.qty)) || l.qty,
        unit_price: parseInt(editPrices[l.id] ?? String(l.unit_price), 10) || 0,
      }))
      const res = await fetch('/api/admin/settlement/update-spec-line', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ specId, lines: updatedLines }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? '저장 실패')
      setSaveMsg('✅ 저장됐습니다')
      router.refresh()
    } catch (err: unknown) {
      setSaveMsg(err instanceof Error ? err.message : '저장 실패')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="rounded-lg bg-blue-50 border border-blue-200 px-4 py-2.5 text-sm text-blue-700">
        수량·단가 수정 후 <strong>수정 저장</strong>을 누르면 정산 금액에 즉시 반영됩니다. 수동 입력된 단가는 자동 재계산 시에도 유지됩니다.
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="grid grid-cols-[2fr_1fr_1.2fr_1.2fr] gap-2 px-5 py-3 bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500">
          <span>품목</span>
          <span className="text-center">수량</span>
          <span className="text-center">단가 (원)</span>
          <span className="text-right">금액 (원)</span>
        </div>
        <div className="divide-y divide-gray-100">
          {lines.map(line => (
            <div key={line.id} className="grid grid-cols-[2fr_1fr_1.2fr_1.2fr] gap-2 items-center px-5 py-3">
              <span className="text-sm text-gray-800 bg-gray-100 px-3 py-1.5 rounded truncate">
                {line.product_name}
                {line.taxable_flag && (
                  <span className="ml-1 text-xs text-gray-400">(과세)</span>
                )}
              </span>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  value={editQtys[line.id] ?? line.qty}
                  onChange={e => setEditQtys(prev => ({ ...prev, [line.id]: e.target.value }))}
                  min="0.1"
                  step="0.1"
                  className="w-full text-sm text-center border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
                <span className="text-xs text-gray-500 shrink-0">{line.unit}</span>
              </div>
              <input
                type="number"
                value={editPrices[line.id] ?? line.unit_price}
                onChange={e => setEditPrices(prev => ({ ...prev, [line.id]: e.target.value }))}
                min="0"
                step="100"
                placeholder="단가"
                className="w-full text-sm text-center border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
              <span className="text-sm text-right font-semibold text-gray-800 tabular-nums">
                {fmt(calcAmount(line.id, line))}
              </span>
            </div>
          ))}
        </div>
        <div className="flex justify-end gap-3 px-5 py-3 bg-gray-50 border-t border-gray-200">
          <span className="text-sm text-gray-500">합계</span>
          <span className="text-sm font-bold text-gray-900 tabular-nums">{fmt(totalAmount)}원</span>
        </div>
      </div>

      <div className="flex items-center gap-3 justify-end">
        {saveMsg && (
          <span className={`text-sm ${saveMsg.startsWith('✅') ? 'text-green-600' : 'text-red-500'}`}>
            {saveMsg}
          </span>
        )}
        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving}
          className="rounded-lg bg-gray-800 text-white px-6 py-2.5 text-sm font-semibold hover:bg-gray-700 disabled:opacity-50"
        >
          {isSaving ? '저장 중...' : '수정 저장'}
        </button>
      </div>
    </div>
  )
}
