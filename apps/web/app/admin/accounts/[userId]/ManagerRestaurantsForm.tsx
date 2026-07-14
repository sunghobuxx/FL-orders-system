'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  userId: string
  restaurants: { id: string; name: string }[]
  initialAssigned: string[]
}

export default function ManagerRestaurantsForm({ userId, restaurants, initialAssigned }: Props) {
  const [selected, setSelected] = useState(new Set(initialAssigned))
  const [loading, setLoading] = useState(false)
  const [saved, setSaved] = useState(false)
  const router = useRouter()

  function toggle(id: string) {
    setSaved(false)
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleSave() {
    setLoading(true)
    setSaved(false)
    try {
      const res = await fetch(`/api/admin/accounts/${userId}/restaurants`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ restaurantIds: [...selected] }),
      })
      if (!res.ok) { alert('저장 실패'); return }
      setSaved(true)
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-5 space-y-4">
      <div className="flex items-center gap-3 text-xs">
        <button type="button" onClick={() => setSelected(new Set(restaurants.map(r => r.id)))}
          className="text-brand-600 hover:underline">전체 선택</button>
        <span className="text-gray-300">|</span>
        <button type="button" onClick={() => setSelected(new Set())}
          className="text-gray-500 hover:underline">전체 해제</button>
        <span className="ml-auto text-gray-400">{selected.size}/{restaurants.length}개 선택됨</span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {restaurants.map(r => (
          <label key={r.id} className={`flex items-center gap-3 px-4 py-3 rounded-lg border cursor-pointer transition-colors ${
            selected.has(r.id) ? 'border-brand-500 bg-brand-50' : 'border-gray-200 hover:bg-gray-50'
          }`}>
            <input
              type="checkbox"
              checked={selected.has(r.id)}
              onChange={() => toggle(r.id)}
              className="accent-brand-600 w-4 h-4"
            />
            <span className="text-sm text-gray-800">{r.name}</span>
          </label>
        ))}
        {restaurants.length === 0 && (
          <div className="col-span-2 text-sm text-gray-400 text-center py-8">등록된 업체가 없습니다</div>
        )}
      </div>

      <div className="flex items-center justify-end gap-3 pt-2 border-t border-gray-100">
        {saved && <span className="text-xs text-green-600 font-medium">저장되었습니다</span>}
        <button
          type="button"
          onClick={handleSave}
          disabled={loading}
          className="rounded-lg bg-brand-600 text-white px-6 py-2.5 text-sm font-semibold hover:bg-brand-700 disabled:opacity-50"
        >
          {loading ? '저장 중...' : '저장'}
        </button>
      </div>
    </div>
  )
}
