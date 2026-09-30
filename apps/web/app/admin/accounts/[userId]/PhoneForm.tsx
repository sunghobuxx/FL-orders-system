'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function PhoneForm({ userId, initialPhone }: { userId: string; initialPhone: string }) {
  const router = useRouter()
  const [phone, setPhone] = useState(initialPhone)
  const [loading, setLoading] = useState(false)
  const [saved, setSaved] = useState(false)

  async function handleSave() {
    setLoading(true)
    setSaved(false)
    try {
      const res = await fetch(`/api/admin/accounts/${userId}/phone`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        alert(d.error ?? '저장 실패')
        return
      }
      setSaved(true)
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-5 space-y-3">
      <div className="flex items-center gap-3">
        <input
          type="tel"
          value={phone}
          onChange={e => { setPhone(e.target.value); setSaved(false) }}
          placeholder="010-0000-0000"
          className="flex-1 bg-gray-100 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 border-0"
        />
        <button
          type="button"
          onClick={handleSave}
          disabled={loading}
          className="rounded-lg bg-brand-600 text-white px-5 py-2 text-sm font-semibold hover:bg-brand-700 disabled:opacity-50 shrink-0"
        >
          {loading ? '저장 중...' : '저장'}
        </button>
      </div>
      {saved && <p className="text-xs text-green-600 font-medium">저장되었습니다</p>}
    </div>
  )
}
