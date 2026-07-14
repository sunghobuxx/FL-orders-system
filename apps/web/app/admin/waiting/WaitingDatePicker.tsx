'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  restaurantId: string
  currentDate: string
  today: string
}

const DOW = ['일', '월', '화', '수', '목', '금', '토']

function addDays(date: string, n: number): string {
  const d = new Date(`${date}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

export default function WaitingDatePicker({ restaurantId, currentDate, today }: Props) {
  const [open, setOpen] = useState(false)
  const [viewMonth, setViewMonth] = useState(currentDate.slice(0, 7))
  const ref = useRef<HTMLDivElement>(null)
  const router = useRouter()

  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  function toggleCalendar() {
    setViewMonth(currentDate.slice(0, 7))
    setOpen(v => !v)
  }

  const [sy, sm] = viewMonth.split('-').map(Number)
  const firstDow = new Date(sy, sm - 1, 1).getDay()
  const lastDate = new Date(sy, sm, 0).getDate()

  function prevMonth() {
    setViewMonth(sm === 1 ? `${sy - 1}-12` : `${sy}-${String(sm - 1).padStart(2, '0')}`)
  }
  function nextMonth() {
    setViewMonth(sm === 12 ? `${sy + 1}-01` : `${sy}-${String(sm + 1).padStart(2, '0')}`)
  }

  const cells: (number | null)[] = []
  for (let i = 0; i < firstDow; i++) cells.push(null)
  for (let d = 1; d <= lastDate; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)

  const prevDate = addDays(currentDate, -1)
  const nextDate = addDays(currentDate, 1)

  return (
    <div className="relative" ref={ref}>
      <div className="bg-white rounded-xl border border-gray-200 flex items-center justify-between px-4 py-3">
        <a
          href={`/admin/waiting/${restaurantId}?date=${prevDate}`}
          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 text-lg leading-none"
        >←</a>

        <button
          type="button"
          onClick={toggleCalendar}
          className="flex items-center gap-2 text-sm font-semibold text-gray-700 hover:text-gray-900 transition-colors"
        >
          <span>{currentDate}</span>
          <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
        </button>

        <a
          href={`/admin/waiting/${restaurantId}?date=${nextDate}`}
          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 text-lg leading-none"
        >→</a>
      </div>

      {open && (
        <div className="absolute top-full left-0 right-0 mt-1 z-50 bg-white rounded-xl border border-gray-200 shadow-lg overflow-hidden">
          {/* 월 네비게이션 */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <button type="button" onClick={prevMonth} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 text-lg leading-none">←</button>
            <span className="text-sm font-semibold text-gray-700">{sy}년 {sm}월</span>
            <button type="button" onClick={nextMonth} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 text-lg leading-none">→</button>
          </div>

          {/* 요일 헤더 */}
          <div className="grid grid-cols-7 py-2 border-b border-gray-50">
            {DOW.map((d, i) => (
              <div key={d} className={`text-center text-xs font-medium ${i === 0 ? 'text-red-400' : i === 6 ? 'text-blue-400' : 'text-gray-400'}`}>{d}</div>
            ))}
          </div>

          {/* 날짜 그리드 */}
          <div className="grid grid-cols-7 gap-0 p-1">
            {cells.map((d, i) => {
              if (!d) return <div key={`e${i}`} />
              const dateStr = `${sy}-${String(sm).padStart(2, '0')}-${String(d).padStart(2, '0')}`
              const isSelected = dateStr === currentDate
              const isToday = dateStr === today
              const isSun = i % 7 === 0
              const isSat = i % 7 === 6
              return (
                <button
                  key={dateStr}
                  type="button"
                  onClick={() => {
                    router.push(`/admin/waiting/${restaurantId}?date=${dateStr}`)
                    setOpen(false)
                  }}
                  className={`flex items-center justify-center py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    isSelected
                      ? 'bg-brand-600 text-white'
                      : isToday
                        ? 'text-brand-600 font-bold hover:bg-brand-50'
                        : isSun
                          ? 'text-red-500 hover:bg-gray-50'
                          : isSat
                            ? 'text-blue-500 hover:bg-gray-50'
                            : 'text-gray-800 hover:bg-gray-50'
                  }`}
                >
                  {d}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
