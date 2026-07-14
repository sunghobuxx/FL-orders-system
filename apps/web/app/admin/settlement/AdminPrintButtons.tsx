'use client'

export function AdminSpecPrintButton({ specId }: { specId: string }) {
  function handlePrint() {
    window.open(`/print/spec?specId=${specId}`, '_blank')
  }

  return (
    <button
      type="button"
      onClick={handlePrint}
      className="rounded-lg border border-gray-300 text-gray-600 px-6 py-2.5 text-sm font-semibold hover:bg-gray-50"
    >
      프린트
    </button>
  )
}

export function AdminStatementPrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded-lg border border-gray-300 text-gray-600 px-6 py-2.5 text-sm font-semibold hover:bg-gray-50"
    >
      프린트
    </button>
  )
}
