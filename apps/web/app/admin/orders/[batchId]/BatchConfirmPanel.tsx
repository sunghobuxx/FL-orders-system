'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

interface Item {
  id: string
  product_name: string
  qty: number
  unit: string
  unit_price_snapshot: number
}

const ALREADY_DONE = ['dispatched', 'completed']
const CONFIRMED_KEY = (batchId: string) => `confirmed_${batchId}`

export function BatchConfirmPanel({
  batchId,
  items,
  currentStatus,
}: {
  batchId: string
  items: Item[]
  currentStatus: string
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const isDone = ALREADY_DONE.includes(currentStatus)

  // 확인 상태 — localStorage에 유지, 배송완료 이후엔 비워짐
  const [confirmed, setConfirmed] = useState<Set<string>>(() => {
    if (typeof window === 'undefined' || isDone) return new Set()
    try {
      const saved = localStorage.getItem(CONFIRMED_KEY(batchId))
      return saved ? new Set(JSON.parse(saved) as string[]) : new Set()
    } catch { return new Set() }
  })
  const [done, setDone] = useState(isDone)
  const [isSaving, setIsSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [saveMsg, setSaveMsg] = useState('')

  // 확인 상태 변경될 때 localStorage 업데이트
  useEffect(() => {
    if (done) {
      localStorage.removeItem(CONFIRMED_KEY(batchId))
    } else {
      localStorage.setItem(CONFIRMED_KEY(batchId), JSON.stringify([...confirmed]))
    }
  }, [confirmed, done, batchId])

  // 수량·단가는 상태와 무관하게 언제든 수정 가능 (수정 시 정산 금액에 즉시 반영)
  const canEdit = true
  const [editQtys, setEditQtys] = useState<Record<string, string>>(
    Object.fromEntries(items.map(i => [i.id, String(i.qty)]))
  )
  const [editPrices, setEditPrices] = useState<Record<string, string>>(
    Object.fromEntries(items.map(i => [i.id, String(i.unit_price_snapshot)]))
  )

  // ⚠️ router.refresh() 후 items prop 이 새로 들어왔는데 state 는 옛 값이 남아
  const itemsKey = items.map(i => `${i.id}:${i.qty}:${i.unit_price_snapshot}`).join('|')
  useEffect(() => {
    setEditQtys(Object.fromEntries(items.map(i => [i.id, String(i.qty)])))
    setEditPrices(Object.fromEntries(items.map(i => [i.id, String(i.unit_price_snapshot)])))
    setDone(ALREADY_DONE.includes(currentStatus))
    setSaveMsg('')
    // 배송완료 이상이면 확인 상태 초기화
    if (ALREADY_DONE.includes(currentStatus)) {
      setConfirmed(new Set())
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemsKey, currentStatus])

  const total = items.length
  const confirmedCount = confirmed.size
  const allConfirmed = confirmedCount === total && total > 0
  const fmt = (n: number) => n.toLocaleString()

  async function handleDeleteItem(itemId: string, productName: string) {
    if (!confirm(`"${productName}" 품목을 삭제하시겠습니까?\n(명세서·정산 금액도 함께 수정됩니다)`)) return
    setDeletingId(itemId)
    try {
      const res = await fetch(`/api/admin/orders/items?itemId=${itemId}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? '삭제 실패')
      // 삭제된 항목 확인 상태에서도 제거
      setConfirmed(prev => { const next = new Set(prev); next.delete(itemId); return next })
      router.refresh()
    } catch (err: unknown) {
      setSaveMsg(err instanceof Error ? err.message : '삭제 실패')
    } finally {
      setDeletingId(null)
    }
  }

  async function handleSave() {
    setIsSaving(true)
    setSaveMsg('')
    try {
      const updatedItems = items.map(item => ({
        id: item.id,
        qty: parseFloat(editQtys[item.id] ?? String(item.qty)) || item.qty,
        unit_price_snapshot: parseInt(editPrices[item.id] ?? String(item.unit_price_snapshot), 10) || 0,
      }))
      const res = await fetch('/api/admin/orders/update-items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batchId, items: updatedItems }),
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

  async function toggleItem(itemId: string) {
    const next = new Set(confirmed)
    if (next.has(itemId)) {
      next.delete(itemId)
    } else {
      next.add(itemId)
      if (
        next.size === 1 &&
        !['ordered', 'dispatched', 'completed'].includes(currentStatus)
      ) {
        await fetch('/api/admin/orders/update-status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ batchId, newStatus: 'ordered' }),
        })
      }
    }
    setConfirmed(next)
  }

  function handleBottomButton() {
    if (!allConfirmed || done) return
    startTransition(async () => {
      const res = await fetch('/api/admin/orders/update-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batchId, newStatus: 'dispatched' }),
      })
      const data = await res.json() as { error?: string }
      if (!data.error) {
        setDone(true)
        router.refresh()
      }
    })
  }

  return (
    <div className="space-y-4">
      {/* 수정 안내 */}
      <div className="rounded-lg bg-blue-50 border border-blue-200 px-4 py-2.5 text-sm text-blue-700">
        수량·단가는 언제든 수정 가능합니다. <strong>수정 저장</strong> 시 명세서·정산 금액에 즉시 반영됩니다.
      </div>

      {/* 품목 목록 */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="grid grid-cols-[1.3fr_1.3fr_1fr_auto_auto] gap-2 sm:gap-3 px-3 sm:px-5 py-3 bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500">
          <span>품목</span>
          <span className="text-center">수량</span>
          <span className="text-center">단가 (원)</span>
          <span className="w-14 sm:w-16 text-center">① 확인</span>
          <span></span>
        </div>
        <div className="divide-y divide-gray-100">
          {items.map(item => {
            const isConfirmed = confirmed.has(item.id)
            return (
              <div key={item.id} className="grid grid-cols-[1.3fr_1.3fr_1fr_auto_auto] gap-2 sm:gap-3 items-center px-3 sm:px-5 py-3">
                <span className="text-xs sm:text-sm text-gray-800 bg-gray-100 px-2 sm:px-3 py-1.5 rounded truncate">
                  {item.product_name}
                </span>

                {/* 수량 */}
                {canEdit ? (
                  <div className="flex items-center gap-1 min-w-0">
                    <input
                      type="number"
                      value={editQtys[item.id] ?? item.qty}
                      onChange={e => setEditQtys(prev => ({ ...prev, [item.id]: e.target.value }))}
                      min="0.1"
                      step="0.1"
                      className="min-w-0 w-full text-sm text-center border border-gray-300 rounded px-1 sm:px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                    <span className="text-xs text-gray-500 shrink-0">{item.unit}</span>
                  </div>
                ) : (
                  <span className="text-sm text-center text-gray-700 bg-gray-100 px-1 sm:px-2 py-1.5 rounded truncate">
                    {Number(item.qty) % 1 === 0 ? Number(item.qty) : Number(item.qty).toFixed(1)} {item.unit}
                  </span>
                )}

                {/* 단가 */}
                {canEdit ? (
                  <input
                    type="number"
                    value={editPrices[item.id] ?? item.unit_price_snapshot}
                    onChange={e => setEditPrices(prev => ({ ...prev, [item.id]: e.target.value }))}
                    min="0"
                    step="100"
                    placeholder="단가"
                    className="min-w-0 w-full text-sm text-center border border-gray-300 rounded px-1 sm:px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                ) : (
                  <span className="text-sm text-center text-gray-700 bg-gray-100 px-1 sm:px-2 py-1.5 rounded truncate">
                    {fmt(Number(item.unit_price_snapshot))}
                  </span>
                )}

                <div className="w-14 sm:w-16 flex justify-center">
                  <button
                    type="button"
                    onClick={() => toggleItem(item.id)}
                    className={`text-xs px-3 py-1.5 rounded-lg font-semibold transition-colors ${
                      isConfirmed
                        ? 'bg-green-500 text-white'
                        : 'bg-brand-600 text-white hover:bg-brand-700'
                    }`}
                  >
                    {isConfirmed ? '✓' : '확인'}
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => handleDeleteItem(item.id, item.product_name)}
                  disabled={deletingId === item.id}
                  className="text-xs text-red-400 hover:text-red-600 px-2 py-1.5 rounded hover:bg-red-50 disabled:opacity-50 whitespace-nowrap"
                >
                  {deletingId === item.id ? '삭제 중' : '삭제'}
                </button>
              </div>
            )
          })}
        </div>

        {/* 확인 진행률 */}
        <div className="px-5 py-3 bg-gray-50 border-t border-gray-200 flex items-center justify-between">
          <span className="text-xs text-gray-500">
            확인 완료: {confirmedCount} / {total}
          </span>
          <div className="flex-1 mx-4 bg-gray-200 rounded-full h-1.5 overflow-hidden">
            <div
              className="h-full bg-brand-500 rounded-full transition-all"
              style={{ width: total > 0 ? `${(confirmedCount / total) * 100}%` : '0%' }}
            />
          </div>
        </div>
      </div>

      {/* 저장 버튼 (수정 가능 상태일 때) */}
      {canEdit && (
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
      )}

      {/* 하단 발주확정/배송완료 버튼 */}
      <div className="flex justify-end">
        {done ? (
          <span className="text-sm text-green-600 font-semibold bg-green-50 px-6 py-2.5 rounded-lg border border-green-200">
            배송완료 처리됨
          </span>
        ) : allConfirmed ? (
          <button
            type="button"
            onClick={handleBottomButton}
            disabled={isPending}
            className="rounded-lg bg-brand-600 text-white px-6 py-2.5 text-sm font-semibold hover:bg-brand-700 disabled:opacity-50"
          >
            {isPending ? '처리 중...' : '② 배송완료'}
          </button>
        ) : (
          <button
            type="button"
            disabled
            className="rounded-lg border border-gray-300 text-gray-400 px-6 py-2.5 text-sm font-semibold cursor-not-allowed"
          >
            배송중 ({confirmedCount}/{total} 확인)
          </button>
        )}
      </div>
    </div>
  )
}
