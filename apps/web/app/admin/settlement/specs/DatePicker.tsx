'use client'

export default function DayPicker({ value }: { value: string }) {
  return (
    <input
      type="date"
      defaultValue={value}
      onChange={e => {
        const url = new URL(window.location.href)
        url.searchParams.set('date', e.target.value)
        window.location.href = url.toString()
      }}
      className="bg-gray-100 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-brand-500"
    />
  )
}
