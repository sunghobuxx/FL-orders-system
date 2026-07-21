export const runtime = 'edge'

import Link from 'next/link'

interface Props {
  searchParams: Promise<{ code?: string; message?: string; orderId?: string }>
}

export default async function PaymentFailPage({ searchParams }: Props) {
  const { code, message, orderId } = await searchParams

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl border border-gray-200 p-10 max-w-sm w-full text-center space-y-4">
        <div className="text-5xl">❌</div>
        <h1 className="text-lg font-bold text-gray-900">결제 실패</h1>
        <p className="text-sm text-gray-600">
          {message ?? '결제 처리 중 오류가 발생했습니다'}
        </p>
        {code && (
          <p className="text-xs text-gray-400 bg-gray-50 rounded px-3 py-1.5">
            오류 코드: {code}
          </p>
        )}
        {orderId && (
          <p className="text-xs text-gray-400 font-mono">{orderId}</p>
        )}
        <div className="flex gap-2 pt-2">
          <Link
            href="/member/settlement"
            className="flex-1 rounded-lg border border-gray-300 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50"
          >
            다시 시도
          </Link>
          <Link
            href="/member/settlement"
            className="flex-1 rounded-lg bg-gray-800 py-2.5 text-sm font-bold text-white hover:bg-gray-700"
          >
            정산으로
          </Link>
        </div>
      </div>
    </div>
  )
}
