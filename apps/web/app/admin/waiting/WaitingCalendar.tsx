'use client'

interface Props {
  selectedDate: string
  today: string
  dailyCounts: Record<string, number>
}

const DOW = ['일', '월', '화', '수', '목', '금', '토']

export default function WaitingCalendar({ selectedDate, today, dailyCounts }: Props) {
  const [sy, sm] = selectedDate.split('-').map(Number)

  const firstDow = new Date(sy, sm - 1, 1).getDay()
  const lastDate = new Date(sy, sm, 0).getDate()

  const prevMonthDate = sm === 1
    ? `${sy - 1}-12-01`
    : `${sy}-${String(sm - 1).padStart(2, '0')}-01`
  const nextMonthDate = sm === 12
    ? `${sy + 1}-01-01`
    : `${sy}-${String(sm + 1).padStart(2, '0')}-01`

  const cells: (number | null)[] = []
  for (let i = 0; i < firstDow; i++) cells.push(null)
  for (let d = 1; d <= lastDate; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
        <a href={`/admin/waiting?date=${prevMonthDate}`} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 text-lg leading-none">←</a>
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-gray-700">{sy}년 {sm}월</span>
          {selectedDate !== today && (
            <a href="/admin/waiting" className="text-xs text-brand-600 font-medium px-2 py-0.5 bg-brand-50 rounded">오늘</a>
          )}
        </div>
        <a href={`/admin/waiting?date=${nextMonthDate}`} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 text-lg leading-none">→</a>
      </div>

      <div className="grid grid-cols-7 py-2 border-b border-gray-50">
        {DOW.map((d, i) => (
          <div key={d} className={`text-center text-xs font-medium ${i === 0 ? 'text-red-400' : i === 6 ? 'text-blue-400' : 'text-gray-400'}`}>
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-0 p-1">
        {cells.map((d, i) => {
          if (!d) return <div key={`e${i}`} />
          const dateStr = `${sy}-${String(sm).padStart(2, '0')}-${String(d).padStart(2, '0')}`
          const count = dailyCounts[dateStr] ?? 0
          const isSelected = dateStr === selectedDate
          const isToday = dateStr === today
          const isSun = i % 7 === 0
          const isSat = i % 7 === 6
          return (
            <a
              key={dateStr}
              href={`/admin/waiting?date=${dateStr}`}
              className={`flex flex-col items-center justify-center py-2 rounded-lg transition-colors ${
                isSelected ? 'bg-brand-600 text-white' : 'hover:bg-gray-50'
              }`}
            >
              <span className={`text-sm font-medium leading-none ${
                isSelected ? 'text-white' :
                isToday ? 'text-brand-600 font-bold' :
                isSun ? 'text-red-500' :
                isSat ? 'text-blue-500' :
                'text-gray-800'
              }`}>{d}</span>
              {count > 0 ? (
                <span className={`text-xs mt-1 leading-none ${isSelected ? 'text-white/80' : 'text-gray-400'}`}>{count}명</span>
              ) : (
                <span className="text-xs mt-1 leading-none invisible">0</span>
              )}
            </a>
          )
        })}
      </div>
    </div>
  )
}
