'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

import type { AddableProduct } from '@/lib/products/self-add'

/**
 * 품목 고르기 목록.
 *
 * 휴대폰 기준으로 짠다 — 분류 칩은 줄바꿈으로 흐르고, 「선택한 N개 추가」는
 * 화면 아래에 붙어 스크롤과 상관없이 눌린다.
 */

interface Props {
  restaurantId: string
  rows: AddableProduct[]
  categoryCounts: Record<string, number>
  categoryLabels: Record<string, string>
  activeCategory: string | null
  totalCount: number
  pendingNames: string[]
}

const won = (n: number) => `${n.toLocaleString('ko-KR')}원`

export default function AddProductList({
  restaurantId, rows, categoryCounts, categoryLabels, activeCategory, totalCount, pendingNames,
}: Props) {
  const router = useRouter()
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  const categories = Object.entries(categoryCounts).sort((a, b) => b[1] - a[1])

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
    setBusy(true)
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
      setPicked(new Set())
      router.refresh()
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '추가하지 못했습니다.')
    } finally {
      setBusy(false)
    }
  }

  const chipClass = (active: boolean) =>
    `px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
      active ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
    }`

  return (
    <div className="space-y-3 pb-24">
      <div className="flex items-center justify-between">
        <h1 className="text-base font-bold text-gray-900">품목 추가</h1>
        <Link href="/member/order" className="text-sm text-gray-500 hover:text-gray-700">
          발주로 돌아가기
        </Link>
      </div>

      {pendingNames.length > 0 && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-700">
          담당자 확인 중 · {pendingNames.join(', ')}
        </p>
      )}
      {msg && (
        <p className="rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-700">{msg}</p>
      )}

      <div className="rounded-xl border border-gray-200 bg-white p-3">
        <div className="flex flex-wrap gap-2">
          <Link href="/member/products/add" className={chipClass(!activeCategory)}>
            전체 {totalCount}개
          </Link>
          {categories.map(([cat, count]) => (
            <Link
              key={cat}
              href={`/member/products/add?category=${cat}`}
              className={chipClass(activeCategory === cat)}
            >
              {categoryLabels[cat] ?? cat} {count}개
            </Link>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        {rows.length === 0 ? (
          <p className="py-12 text-center text-sm text-gray-400">추가할 수 있는 품목이 없습니다</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {rows.map(p => (
              <label
                key={p.id}
                className={`flex cursor-pointer items-center gap-3 px-4 py-3 ${
                  picked.has(p.id) ? 'bg-brand-50' : ''
                }`}
              >
                <input
                  type="checkbox"
                  checked={picked.has(p.id)}
                  onChange={() => toggle(p.id)}
                  className="h-5 w-5 shrink-0"
                />
                <span className="min-w-0 flex-1 truncate text-sm text-gray-800">{p.standard_name}</span>
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
        )}
      </div>

      <p className="px-1 text-xs text-gray-400">
        「단가 문의」 품목은 바로 열리지 않고 담당자 확인을 거칩니다.
        단가는 오늘 기준이며 실제 청구는 발주일 기준으로 계산됩니다.
      </p>

      {/* 목록이 길어 화면 아래에 붙여 둔다. 휴대폰에서 끝까지 내리지 않아도 눌린다. */}
      <div className="fixed inset-x-0 bottom-0 border-t border-gray-200 bg-white/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          <span className="text-sm text-gray-500">{picked.size}개 선택</span>
          <button
            type="button"
            onClick={add}
            disabled={busy || picked.size === 0}
            className="flex-1 rounded-xl bg-brand-600 py-3 text-sm font-bold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? '처리 중...' : '내 발주 목록에 추가'}
          </button>
        </div>
      </div>
    </div>
  )
}
