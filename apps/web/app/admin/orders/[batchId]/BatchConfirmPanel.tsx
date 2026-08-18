'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

interface Item {
  id: string
  product_name: string
  qty: number
  unit: string
  unit_price_snapshot: number
  /** 0 미확인 / 1 상차확인 / 2 배송확인 */
  check_stage?: number
}

const ALREADY_DONE = ['dispatched', 'completed']

const RANK: Record<string, number> = {
  open: 0, submitted: 1, validated: 2, ordered: 3, dispatched: 4, completed: 5,
}

/**
 * 지금 눌러야 할 확인 단계.
 * 배송중(ordered)까지 갔으면 두 번째 확인을 받는다. 그래서 한 바퀴 다 확인하면
 * 버튼이 저절로 «확인» 으로 되돌아온다 — 값을 지우지 않아도 된다.
 */
function requiredStageOf(status: string) {
  return (RANK[status] ?? 0) >= RANK.ordered ? 2 : 1
}

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

  // 확인 상태는 서버(order_items.check_stage)에 있다.
  // 예전에는 localStorage 였다. 그래서 확인을 해도 어드민 목록·회원 진행상황·공급처별
  // 발주 내역 어디에도 반영되지 않았고, 다른 기기에서 열면 처음 상태로 보였다.
  const [stages, setStages] = useState<Record<string, number>>(
    Object.fromEntries(items.map(i => [i.id, Number(i.check_stage ?? 0)]))
  )
  // 처리 중인 품목만 잠근다. 하나가 처리 중이라고 다른 품목 클릭까지 막으면
  // 빠르게 여러 개를 누를 때 조용히 씹힌다.
  const [checking, setChecking] = useState<Set<string>>(new Set())
  const [isSaving, setIsSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [saveMsg, setSaveMsg] = useState('')
  /** 체크를 풀었을 때처럼, 오류는 아니지만 알려 줘야 하는 것 */
  const [checkNotice, setCheckNotice] = useState('')

  // 수량·단가는 상태와 무관하게 언제든 수정 가능 (수정 시 정산 금액에 즉시 반영)
  const canEdit = true
  const [editQtys, setEditQtys] = useState<Record<string, string>>(
    Object.fromEntries(items.map(i => [i.id, String(i.qty)]))
  )
  const [editPrices, setEditPrices] = useState<Record<string, string>>(
    Object.fromEntries(items.map(i => [i.id, String(i.unit_price_snapshot)]))
  )

  // router.refresh() 로 items prop 이 새로 들어오면 화면 값을 서버 값에 맞춘다.
  //
  // 키에 check_stage 를 넣는다. 빠져 있으면 체크만 바뀐 새로고침에서 키가 그대로라
  // 갱신이 안 되고, 반대로 currentStatus 가 같이 걸려 있어 5 초 자동 새로고침 때마다
  // 이 블록이 다시 돌면서 **누른 체크를 서버 옛 값으로 되돌렸다** (2026-08-18 확인).
  //
  // 저장이 아직 진행 중인 품목(checking)은 건드리지 않는다. 눌러 놓은 것이 풀리면 안 된다.
  const itemsKey = items
    .map(i => `${i.id}:${i.qty}:${i.unit_price_snapshot}:${i.check_stage ?? 0}`)
    .join('|')
  useEffect(() => {
    setEditQtys(Object.fromEntries(items.map(i => [i.id, String(i.qty)])))
    setEditPrices(Object.fromEntries(items.map(i => [i.id, String(i.unit_price_snapshot)])))
    setStages(prev => Object.fromEntries(items.map(i => [
      i.id,
      checking.has(i.id) ? (prev[i.id] ?? Number(i.check_stage ?? 0)) : Number(i.check_stage ?? 0),
    ])))
    setSaveMsg('')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemsKey])

  const total = items.length
  // 지금 받아야 할 단계. 배송중으로 넘어가면 2 가 되어 버튼이 다시 «확인» 으로 돌아온다.
  const requiredStage = requiredStageOf(currentStatus)
  const confirmedCount = items.filter(i => (stages[i.id] ?? 0) >= requiredStage).length
  const fmt = (n: number) => n.toLocaleString()

  async function handleDeleteItem(itemId: string, productName: string) {
    if (!confirm(`"${productName}" 품목을 삭제하시겠습니까?\n(명세서·정산 금액도 함께 수정됩니다)`)) return
    setDeletingId(itemId)
    try {
      const res = await fetch(`/api/admin/orders/items?itemId=${itemId}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? '삭제 실패')
      setStages(prev => { const next = { ...prev }; delete next[itemId]; return next })
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

  /**
   * 품목 확인. 서버에 단계를 남기고, 전 품목이 다 차면 서버가 배치 상태를 옮긴다.
   * 상태가 바뀌면 새로고침해서 어드민 목록·회원 진행상황과 같은 값을 보게 한다.
   */
  async function toggleItem(itemId: string) {
    if (checking.has(itemId)) return
    const cur = stages[itemId] ?? 0
    const nextStage = cur >= requiredStage ? requiredStage - 1 : requiredStage

    setChecking(prev => new Set(prev).add(itemId))
    setStages(prev => ({ ...prev, [itemId]: nextStage }))   // 먼저 반응시키고
    try {
      const res = await fetch('/api/admin/orders/check-items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemIds: [itemId], stage: nextStage }),
      })
      const data = await res.json() as { error?: string; batchStatus?: string }
      if (!res.ok) throw new Error(data.error ?? '확인 처리 실패')

      if (data.batchStatus && data.batchStatus !== currentStatus) {
        setCheckNotice('')
        startTransition(() => router.refresh())
      } else if (nextStage < cur) {
        // 체크를 풀어도 진행 표시는 뒤로 가지 않는다.
        //
        // 이미 「배송중·배송완료」로 넘어간 배치를 체크 하나 풀었다고 되돌리면,
        // 회원 화면의 진행 상황과 기사님께 나간 알림이 앞뒤로 흔들린다.
        // 그런데 화면에는 아무 반응이 없어 눌러도 안 먹는 것처럼 보였다
        // (2026-08-17 확인). 그래서 무슨 일이 있었는지 말해 준다.
        setCheckNotice('체크를 해제했습니다. 진행 표시는 뒤로 가지 않습니다.')
      } else {
        setCheckNotice('')
      }
    } catch (err) {
      setStages(prev => ({ ...prev, [itemId]: cur }))       // 실패하면 되돌린다
      setSaveMsg(err instanceof Error ? err.message : '확인 처리 실패')
    } finally {
      setChecking(prev => { const next = new Set(prev); next.delete(itemId); return next })
    }
  }

  /**
   * 한 번에 배송완료. 품목을 하나씩 확인할 겨를이 없을 때 쓴다.
   * 전 품목을 배송확인(2)으로 올리면 서버가 배치를 dispatched 로 옮긴다.
   */
  function handleCompleteAll() {
    if (!items.length) return
    if (!confirm(`${total}개 품목을 모두 확인 처리하고 배송완료로 넘깁니다.\n계속할까요?`)) return
    startTransition(async () => {
      try {
        const res = await fetch('/api/admin/orders/check-items', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ itemIds: items.map(i => i.id), stage: 2 }),
        })
        const data = await res.json() as { error?: string }
        if (!res.ok) throw new Error(data.error ?? '배송완료 처리 실패')
        setStages(Object.fromEntries(items.map(i => [i.id, 2])))
        router.refresh()
      } catch (err) {
        setSaveMsg(err instanceof Error ? err.message : '배송완료 처리 실패')
      }
    })
  }

  // 저장이 도는 동안에는 자동 새로고침을 멈춘다(OrderLiveRefresh 가 이 표시를 본다).
  // 저장 응답이 오기 전에 새로고침이 끼면 방금 누른 값이 옛 값으로 되돌아간다.
  const busy = checking.size > 0 || isSaving || deletingId !== null

  return (
    <div className="space-y-4" {...(busy ? { 'data-live-refresh': 'pause' } : {})}>
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
          <span className="w-14 sm:w-16 text-center">{requiredStage === 1 ? '① 상차' : '② 배송'}</span>
          <span></span>
        </div>
        <div className="divide-y divide-gray-100">
          {items.map(item => {
            const isConfirmed = (stages[item.id] ?? 0) >= requiredStage
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
            {requiredStage === 1 ? '상차 확인' : '배송 확인'}: {confirmedCount} / {total}
          </span>
          <div className="flex-1 mx-4 bg-gray-200 rounded-full h-1.5 overflow-hidden">
            <div
              className="h-full bg-brand-500 rounded-full transition-all"
              style={{ width: total > 0 ? `${(confirmedCount / total) * 100}%` : '0%' }}
            />
          </div>

          {/* 체크를 풀었을 때. 오류가 아니라 안내라 회색으로 둔다. */}
          {checkNotice && (
            <p className="mt-2 text-xs text-gray-500">{checkNotice}</p>
          )}
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

      {/* 진행 안내 + 한 번에 끝내기.
          품목을 하나씩 확인하면 상태가 저절로 넘어가지만, 급할 때는 이 버튼으로
          전 품목을 배송확인 처리하고 바로 배송완료로 보낸다. */}
      <div className="flex items-center justify-end gap-3">
        {!isDone && (
          <span className="text-sm text-gray-500">
            {requiredStage === 1
              ? `상차 확인 ${confirmedCount}/${total} — 다 확인하면 배송중`
              : `배송 확인 ${confirmedCount}/${total} — 다 확인하면 배송완료`}
          </span>
        )}
        {isDone ? (
          <span className="text-sm text-green-600 font-semibold bg-green-50 px-6 py-2.5 rounded-lg border border-green-200">
            {currentStatus === 'completed' ? '완료' : '배송완료 처리됨'}
          </span>
        ) : (
          <button
            type="button"
            onClick={handleCompleteAll}
            disabled={isPending || total === 0}
            className="rounded-lg bg-brand-600 text-white px-6 py-2.5 text-sm font-semibold hover:bg-brand-700 disabled:opacity-50"
          >
            {isPending ? '처리 중...' : '배송완료'}
          </button>
        )}
      </div>
    </div>
  )
}
