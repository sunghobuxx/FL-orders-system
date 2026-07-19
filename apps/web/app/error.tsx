'use client'

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-6">
      <div className="text-center space-y-4">
        <p className="text-gray-500 text-sm">오류가 발생했습니다.</p>
        <button
          onClick={reset}
          className="rounded-lg bg-brand-600 text-white px-6 py-2 text-sm font-semibold hover:bg-brand-700"
        >
          다시 시도
        </button>
      </div>
    </div>
  )
}
