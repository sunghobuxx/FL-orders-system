'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function RecalcButton({ specId }: { specId: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')

  async function handleRecalc() {
    if (!confirm('단가를 재계산하시겠습니까?\n수동 입력된 단가는 유지됩니다.')) return
    setLoading(true)
    setMsg('')
    try {
      const res = await fetch('/api/admin/settlement/recalculate-spec', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ specId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? '재계산 실패')
      setMsg('✅ 재계산 완료')
      router.refresh()
    } catch (err: unknown) {
      setMsg(err instanceof Error ? err.message : '재계산 실패')
    } finally {
      setLoading(false)
    }
  }

  return (
    <span className="flex items-center gap-2">
      <button
        type="button"
        onClick={handleRecalc}
        disabled={loading}
        className="text-sm text-gray-500 hover:text-gray-700 underline underline-offset-2 disabled:opacity-50"
      >
        {loading ? '재계산 중...' : '단가 재계산'}
      </button>
      {msg && (
        <span className={`text-xs ${msg.startsWith('✅') ? 'text-green-600' : 'text-red-500'}`}>
          {msg}
        </span>
      )}
    </span>
  )
}

export function RegenFromOrderButton({ businessDate }: { businessDate: string | null }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')

  if (!businessDate) return null

  async function handleRegen() {
    if (!confirm(`${businessDate} 발주 기준으로 명세서를 재생성하시겠습니까?`)) return
    setLoading(true)
    setMsg('')
    try {
      const res = await fetch('/api/admin/orders/generate-specs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ businessDate }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? '재생성 실패')
      setMsg('✅ 재생성 완료')
      router.refresh()
    } catch (err: unknown) {
      setMsg(err instanceof Error ? err.message : '재생성 실패')
    } finally {
      setLoading(false)
    }
  }

  return (
    <span className="flex items-center gap-2">
      <button
        type="button"
        onClick={handleRegen}
        disabled={loading}
        className="text-sm text-gray-500 hover:text-gray-700 underline underline-offset-2 disabled:opacity-50"
      >
        {loading ? '재생성 중...' : '발주 기준 재생성'}
      </button>
      {msg && (
        <span className={`text-xs ${msg.startsWith('✅') ? 'text-green-600' : 'text-red-500'}`}>
          {msg}
        </span>
      )}
    </span>
  )
}
