'use client'

import { useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

interface Props {
  /** 지금 보고 있는 단가 날짜 (YYYY-MM-DD) */
  date: string
  /** KST 오늘 */
  today: string
  statusText: string
  tone: 'pending' | 'confirmed' | 'modified' | 'none'
}

const TONE = {
  pending: 'bg-amber-50 border-amber-300 text-amber-800',
  confirmed: 'bg-green-50 border-green-300 text-green-800',
  modified: 'bg-orange-50 border-orange-300 text-orange-800',
  none: 'bg-gray-50 border-gray-200 text-gray-500',
} as const

const md = (date: string) => {
  const [, m, d] = date.split('-')
  return `${Number(m)}/${Number(d)}`
}

export default function PriceConfirmBar({ date, today, statusText, tone }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const label =
    tone === 'confirmed' || tone === 'modified' ? '다시 확정'
    : date === today ? '오늘 단가 확정'
    : `${md(date)} 단가 확정`

  function changeDate(next: string) {
    const q = new URLSearchParams(params.toString())
    if (!next || next === today) q.delete('priceDate')
    else q.set('priceDate', next)
    const qs = q.toString()
    router.push(qs ? `${pathname}?${qs}` : pathname)
  }

  async function confirm() {
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/admin/price-confirmations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? '확정에 실패했습니다')
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : '확정에 실패했습니다')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={`mb-4 flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3 ${TONE[tone]}`}>
      <span className="text-sm font-semibold">단가 확정</span>
      <input
        type="date"
        value={date}
        max={today}
        onChange={e => changeDate(e.target.value)}
        className="rounded-lg border border-gray-300 bg-white px-2 py-1 text-sm text-gray-800"
      />
      <span className="text-sm">{date === today ? '오늘 ' : `${md(date)} `}단가: {statusText}</span>
      <button
        type="button"
        onClick={confirm}
        disabled={busy || tone === 'none'}
        className="ml-auto rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-700 disabled:opacity-50"
      >
        {busy ? '확정 중...' : label}
      </button>
      {error && <span className="w-full text-sm text-red-600">{error}</span>}
    </div>
  )
}
