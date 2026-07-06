'use client'

export default function HistoryPrintButton({ from, to }: { from: string; to: string }) {
  return (
    <button
      type="button"
      onClick={() => window.open(`/member/settlement/history/print?from=${from}&to=${to}`, '_blank', 'width=800,height=1000')}
      className="rounded-lg border border-gray-300 bg-white px-4 py-1.5 text-sm font-semibold text-gray-700 hover:bg-gray-50"
    >
      프린트
    </button>
  )
}
