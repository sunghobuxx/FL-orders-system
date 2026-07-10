'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function DateNav({ currentDate }: { currentDate: string }) {
  const router = useRouter()
  const [date, setDate] = useState(currentDate)
  const today = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().split('T')[0]
  const prevDay = new Date(new Date(currentDate).getTime() - 86400000).toISOString().split('T')[0]
  const nextDay = new Date(new Date(currentDate).getTime() + 86400000).toISOString().split('T')[0]
  const isToday = currentDate === today

  function navigate(d: string) {
    setDate(d)
    if (d === today) router.push('/member/order-confirm')
    else router.push(`/member/order-confirm?date=${d}`)
  }

  return (
    <div className="flex items-center gap-1 mb-4">
      <button
        type="button"
        onClick={() => navigate(prevDay)}
        className="px-2 py-1 text-gray-500 hover:text-gray-800 text-sm border border-gray-200 rounded-lg"
      >
        ‹
      </button>
      <input
        type="date"
        value={date}
        max={today}
        onChange={e => setDate(e.target.value)}
        onBlur={() => navigate(date)}
        onKeyDown={e => e.key === 'Enter' && navigate(date)}
        className="border border-gray-200 rounded-lg px-3 py-1 text-sm text-gray-700 focus:outline-none focus:border-gray-400"
      />
      <button
        type="button"
        onClick={() => navigate(nextDay)}
        disabled={isToday}
        className="px-2 py-1 text-gray-500 hover:text-gray-800 text-sm border border-gray-200 rounded-lg disabled:opacity-30"
      >
        ›
      </button>
      {!isToday && (
        <button
          type="button"
          onClick={() => navigate(today)}
          className="ml-1 text-xs text-brand-600 hover:underline"
        >
          오늘
        </button>
      )}
    </div>
  )
}
