export const runtime = 'edge'

import { createAdminAccount } from '../actions'

interface Props {
  searchParams: Promise<{ error?: string }>
}

export default async function NewAdminAccountPage({ searchParams }: Props) {
  const { error } = await searchParams

  return (
    <div className="p-6 max-w-lg space-y-4">
      <h1 className="text-lg font-semibold text-gray-800">관리자 계정 추가</h1>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {decodeURIComponent(error)}
        </div>
      )}

      <form action={createAdminAccount} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-100">
          <label htmlFor="name" className="text-sm text-gray-500 shrink-0 w-24">이름:</label>
          <input id="name" name="name" required placeholder="홍길동"
            className="flex-1 bg-gray-100 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400" />
        </div>

        <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-100">
          <label htmlFor="email" className="text-sm text-gray-500 shrink-0 w-24">이메일:</label>
          <input id="email" name="email" type="email" required placeholder="admin@example.com"
            className="flex-1 bg-gray-100 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400" />
        </div>

        <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-100">
          <label htmlFor="password" className="text-sm text-gray-500 shrink-0 w-24">비밀번호:</label>
          <input id="password" name="password" type="password" required placeholder="8자 이상"
            minLength={8}
            className="flex-1 bg-gray-100 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400" />
        </div>

        <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-100">
          <label htmlFor="org_type" className="text-sm text-gray-500 shrink-0 w-24">구분:</label>
          <select id="org_type" name="org_type"
            className="flex-1 bg-gray-100 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400">
            <option value="platform">플랫폼 (최고 관리자)</option>
            <option value="operator">운영사 (일반 관리자)</option>
          </select>
        </div>

        <div className="flex justify-center gap-3 px-5 py-4 bg-gray-50">
          <button type="submit"
            className="rounded-lg bg-gray-800 text-white px-8 py-2.5 text-sm font-semibold hover:bg-gray-700">
            계정 생성
          </button>
          <a href="/admin/accounts"
            className="rounded-lg border border-gray-300 text-gray-700 px-8 py-2.5 text-sm font-semibold hover:bg-gray-50">
            취소
          </a>
        </div>
      </form>
    </div>
  )
}
