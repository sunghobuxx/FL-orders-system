'use client'

/**
 * 거래처가 받은 정산서를 인쇄하거나 PDF 로 저장할 수 있게 한다.
 * 휴대폰 브라우저에서도 「인쇄 → PDF 로 저장」이 된다.
 */
export default function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="w-full rounded-xl border border-gray-300 bg-white py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 print:hidden"
    >
      인쇄 · PDF 저장
    </button>
  )
}
