import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-6">
      <div className="text-center space-y-4">
        <p className="text-gray-500 text-sm">페이지를 찾을 수 없습니다.</p>
        <Link href="/" className="inline-block rounded-lg bg-gray-800 text-white px-6 py-2 text-sm font-semibold hover:bg-gray-700">
          홈으로
        </Link>
      </div>
    </div>
  )
}
