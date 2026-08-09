'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

/**
 * 발주 화면의 「품목 추가」.
 *
 * 내 목록에 없는 품목을 분류별로 보여 준다. 단가가 있으면 바로 열리고,
 * 없으면 요청으로 들어가 담당자 확인을 거친다 — 단가 없이 발주되면
 * 명세서가 0 원으로 나가기 때문이다.
 */

interface Addable {
  id: string
  standard_name: string
  category: string | null
  default_unit: string
  price: number | null
  needsApproval: boolean
}

interface Pending {
  product_id: string
  standard_name: string
}

const CATEGORY_LABELS: Record<string, string> = {
  vegetable: '채소', fruit: '과일', meat: '육류', seafood: '수산',
  grain: '곡류', dairy: '유제품', seasoning: '양념', etc: '기타',
}
const CATEGORY_EMOJI: Record<string, string> = {
  vegetable: '🥬', fruit: '🍎', meat: '🥩', seafood: '🐟',
  grain: '🌾', dairy: '🥛', seasoning: '🧄', etc: '📦',
}
const CATEGORY_ORDER = ['vegetable', 'fruit', 'grain', 'meat', 'seafood', 'dairy', 'seasoning', 'etc']

const won = (n: number) => `${n.toLocaleString('ko-KR')}원`

export default function AddProductPanel({
  restaurantId, businessDate,
}: { restaurantId: string; businessDate: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [rows, setRows] = useState<Addable[]>([])
  const [pending, setPending] = useState<Pending[]>([])
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [msg, setMsg] = useState('')

  // 접힌 상태에서도 「확인 중」을 보여줘야 하므로 한 번은 불러온다.
  useEffect(() => {
    setLoading(true)
    fetch(`/api/member/products?restaurantId=${restaurantId}&businessDate=${businessDate}`)
      .then(r => r.json())
      .then((d: { addable?: Addable[]; pending?: Pending[]; error?: string }) => {
        if (d.error) { setMsg(d.error); return }
        setRows(d.addable ?? [])
        setPending(d.pending ?? [])
      })
      .catch(() => setMsg('품목을 불러오지 못했습니다.'))
      .finally(() => setLoading(false))
  }, [restaurantId, businessDate])

  function toggle(id: string) {
    setPicked(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function add() {
    if (!picked.size) return
    setLoading(true)
    setMsg('')
    try {
      const res = await fetch('/api/member/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ restaurantId, productIds: [...picked] }),
      })
      const d = await res.json() as {
        added?: string[]; requested?: string[]; skipped?: number; error?: string
      }
      if (!res.ok) throw new Error(d.error ?? '추가하지 못했습니다.')

      const parts: string[] = []
      if (d.added?.length) parts.push(`${d.added.length}개 추가됐습니다`)
      if (d.requested?.length) parts.push(`${d.requested.length}개는 담당자 확인 중입니다`)
      if (d.skipped) parts.push(`${d.skipped}개는 이미 들어가 있습니다`)
      setMsg(parts.join(' · '))

      // 방금 넣은 것은 목록에서 뺀다. 화면을 새로 그리기 전이라도 두 번 고르지 못하게.
      const done = new Set([...(d.added ?? []), ...(d.requested ?? [])])
      setRows(prev => prev.filter(p => !done.has(p.id)))
      setPending(prev => [
        ...prev,
        ...rows.filter(p => (d.requested ?? []).includes(p.id))
          .map(p => ({ product_id: p.id, standard_name: p.standard_name })),
      ])
      setPicked(new Set())
      setOpen(false)
      router.refresh()
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '추가하지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }

  const categories = CATEGORY_ORDER.filter(c => rows.some(p => (p.category ?? 'etc') === c))
  const unknown = rows.filter(p => !CATEGORY_ORDER.includes(p.category ?? 'etc'))

  if (!open) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 px-4 py-3 space-y-2">
        {pending.length > 0 && (
          <p className="text-xs text-amber-600">
            담당자 확인 중 · {pending.map(p => p.standard_name).join(', ')}
          </p>
        )}
        {msg && <p className="text-xs text-gray-500">{msg}</p>}
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="w-full rounded-lg border border-dashed border-gray-300 py-3 text-sm font-semibold text-gray-600 hover:bg-gray-50"
        >
          + 품목 추가
        </button>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
        <span className="text-sm font-bold text-gray-800">품목 추가</span>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-sm text-gray-400 hover:text-gray-600"
        >
          닫기
        </button>
      </div>

      <div className="px-4 py-3 space-y-3">
        {msg && <p className="text-xs text-gray-600">{msg}</p>}
        {loading && <p className="py-6 text-center text-sm text-gray-400">불러오는 중...</p>}
        {!loading && rows.length === 0 && (
          <p className="py-6 text-center text-sm text-gray-400">추가할 수 있는 품목이 없습니다</p>
        )}

        <div className="max-h-96 overflow-y-auto space-y-3">
          {[...categories, ...(unknown.length ? ['__other'] : [])].map(cat => {
            const items = cat === '__other'
              ? unknown
              : rows.filter(p => (p.category ?? 'etc') === cat)
            return (
              <div key={cat}>
                <p className="mb-1 text-xs font-semibold text-gray-500">
                  {cat === '__other'
                    ? '📦 기타'
                    : `${CATEGORY_EMOJI[cat] ?? ''} ${CATEGORY_LABELS[cat] ?? cat}`}
                </p>
                <div className="space-y-1">
                  {items.map(p => (
                    <label
                      key={p.id}
                      className="flex cursor-pointer items-center gap-2 rounded-lg border border-gray-100 px-3 py-2 hover:bg-gray-50"
                    >
                      <input
                        type="checkbox"
                        checked={picked.has(p.id)}
                        onChange={() => toggle(p.id)}
                        className="h-4 w-4"
                      />
                      <span className="flex-1 truncate text-sm text-gray-800">{p.standard_name}</span>
                      {p.price !== null ? (
                        <span className="shrink-0 text-xs tabular-nums text-gray-500">
                          {won(p.price)}/{p.default_unit}
                        </span>
                      ) : (
                        <span className="shrink-0 text-xs text-amber-600">단가 문의</span>
                      )}
                    </label>
                  ))}
                </div>
              </div>
            )
          })}
        </div>

        <button
          type="button"
          onClick={add}
          disabled={loading || picked.size === 0}
          className="w-full rounded-xl bg-brand-600 py-2.5 text-sm font-bold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          선택한 {picked.size}개 추가
        </button>
        <p className="text-xs text-gray-400">
          「단가 문의」 품목은 바로 열리지 않고 담당자 확인을 거칩니다.
        </p>
      </div>
    </div>
  )
}
