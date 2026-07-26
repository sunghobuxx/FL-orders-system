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

export function AdminStatementPrintButton({ restaurantId, statementId }: { restaurantId: string; statementId: string }) {
  function handlePrint() {
    window.open(`/admin/settlement/restaurant/${restaurantId}/${statementId}/print`, '_blank')
  }
  return (
    <button
      type="button"
      onClick={handlePrint}
      className="rounded-lg border border-gray-300 text-gray-600 px-6 py-2.5 text-sm font-semibold hover:bg-gray-50"
    >
      정산서 다운로드
    </button>
  )
}
