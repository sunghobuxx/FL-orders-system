'use client'

import { useRouter } from 'next/navigation'

export default function MonthPicker({ value }: { value: string }) {
  const router = useRouter()

  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-gray-400">날짜:</span>
      <input
        type="month"
        defaultValue={value}
        onChange={e => {
          if (e.target.value) router.push(`/member/settlement/history?month=${e.target.value}`)
        }}
        className="bg-gray-100 text-gray-600 px-3 py-1 rounded border-0 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
      />
    </div>
  )
}
