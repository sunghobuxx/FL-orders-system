'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

/* 기간 추가 폼 */
export function PeriodForm() {
  const router = useRouter()
  const [type, setType] = useState('weekly')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!start || !end) return
    setLoading(true)
    await fetch('/api/admin/settlement/periods', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ period_type: type, start_date: start, end_date: end }),
    })
    setLoading(false)
    router.refresh()
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1">
        <label className="text-xs text-gray-500">정산주기</label>
        <select
          value={type}
          onChange={e => setType(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
        >
          <option value="weekly">주정산</option>
          <option value="monthly">월정산</option>
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-gray-500">시작일</label>
        <input
          type="date"
          value={start}
          onChange={e => setStart(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
          required
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-gray-500">종료일</label>
        <input
          type="date"
          value={end}
          onChange={e => setEnd(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
          required
        />
      </div>
      <button
        type="submit"
        disabled={loading}
        className="px-5 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-60"
      >
        {loading ? '처리 중…' : '기간 추가'}
      </button>
    </form>
  )
}

/* 정산 계산 버튼 */
export function CalcButton({ periodId }: { periodId: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function handle() {
    setLoading(true)
    await fetch(`/api/admin/settlement/periods/${periodId}/calculate`, { method: 'POST' })
    setLoading(false)
    router.refresh()
  }

  return (
    <button
      onClick={handle}
      disabled={loading}
      className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-60"
    >
      {loading ? '계산 중…' : '정산 계산'}
    </button>
  )
}

/* 마감 버튼 */
export function CloseButton({ periodId }: { periodId: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function handle() {
    if (!confirm('이 정산 기간을 마감하시겠습니까?')) return
    setLoading(true)
    await fetch(`/api/admin/settlement/periods/${periodId}/close`, { method: 'POST' })
    setLoading(false)
    router.refresh()
  }

  return (
    <button
      onClick={handle}
      disabled={loading}
      className="px-3 py-1.5 border border-gray-300 text-gray-600 hover:bg-gray-50 text-xs font-semibold rounded-lg transition-colors disabled:opacity-60"
    >
      {loading ? '처리 중…' : '마감'}
    </button>
  )
}
