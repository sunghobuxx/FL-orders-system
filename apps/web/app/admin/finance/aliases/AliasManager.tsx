'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

interface Restaurant { id: string; name: string }
interface Alias { id: string; restaurantId: string; restaurantName: string; aliasRaw: string }

export default function AliasManager({ restaurants, aliases }: { restaurants: Restaurant[]; aliases: Alias[] }) {
  const router = useRouter()
  const [restaurantId, setRestaurantId] = useState('')
  const [alias, setAlias] = useState('')
  const [loading, setLoading] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  async function handleAdd() {
    if (!restaurantId || !alias.trim()) { alert('업체와 별칭을 입력하세요.'); return }
    setLoading(true)
    try {
      const res = await fetch('/api/admin/payments/aliases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ restaurantId, alias }),
      })
      const data = await res.json() as { error?: string }
      if (!res.ok) throw new Error(data.error ?? '등록 실패')
      setAlias('')
      router.refresh()
    } catch (e) {
      alert(e instanceof Error ? e.message : '오류 발생')
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('이 별칭을 삭제하시겠습니까?')) return
    setDeletingId(id)
    try {
      const res = await fetch('/api/admin/payments/aliases', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      const data = await res.json() as { error?: string }
      if (!res.ok) throw new Error(data.error ?? '삭제 실패')
      router.refresh()
    } catch (e) {
      alert(e instanceof Error ? e.message : '오류 발생')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="space-y-3">
      <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-2 flex-wrap">
        <select
          value={restaurantId}
          onChange={e => setRestaurantId(e.target.value)}
          className="text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-500"
        >
          <option value="">업체 선택</option>
          {restaurants.map(r => (
            <option key={r.id} value={r.id}>{r.name}</option>
          ))}
        </select>
        <input
          type="text"
          placeholder="통장에 찍히는 입금자명"
          value={alias}
          onChange={e => setAlias(e.target.value)}
          className="text-sm border border-gray-300 rounded px-2 py-1.5 flex-1 min-w-[10rem] focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
        <button
          type="button"
          onClick={handleAdd}
          disabled={loading}
          className="text-sm px-4 py-1.5 rounded-lg bg-brand-600 text-white font-semibold hover:bg-brand-700 disabled:opacity-50"
        >
          {loading ? '...' : '추가'}
        </button>
      </div>

      {aliases.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 py-14 text-center text-sm text-gray-400">
          등록된 별칭이 없습니다
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
          {aliases.map(a => (
            <div key={a.id} className="px-5 py-3 flex items-center gap-3">
              <span className="text-sm text-brand-600 bg-gray-100 px-2.5 py-1 rounded font-medium">{a.restaurantName}</span>
              <span className="text-sm text-gray-700">{a.aliasRaw}</span>
              <button
                type="button"
                onClick={() => handleDelete(a.id)}
                disabled={deletingId === a.id}
                className="ml-auto text-xs text-red-500 hover:text-red-700 disabled:opacity-50"
              >
                삭제
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
