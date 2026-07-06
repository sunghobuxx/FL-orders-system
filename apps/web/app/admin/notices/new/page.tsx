export const runtime = 'edge'

import AdminNoticesShell from '../AdminNoticesShell'
import { createNotice } from '../actions'

interface Props {
  searchParams: Promise<{ error?: string }>
}

export default async function NewNoticePage({ searchParams }: Props) {
  const { error } = await searchParams
  const today = new Date().toLocaleDateString('ko-KR', { year: '2-digit', month: '2-digit', day: '2-digit' })

  return (
    <AdminNoticesShell>
      <div className="max-w-2xl space-y-4">
        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            {decodeURIComponent(error)}
          </div>
        )}

        <form action={createNotice} encType="multipart/form-data" className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {/* 제목 + 날짜 */}
          <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100">
            <span className="text-sm text-gray-500 shrink-0">제목:</span>
            <input
              id="title"
              name="title"
              required
              placeholder="Title"
              className="flex-1 bg-gray-100 rounded px-4 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-brand-500 border-0"
            />
            <span className="text-sm text-gray-400 bg-gray-100 px-3 py-2 rounded shrink-0">{today}</span>
          </div>

          {/* 내용 */}
          <div className="flex gap-3 px-5 py-4 border-b border-gray-100">
            <span className="text-sm text-gray-500 shrink-0 pt-1">내용:</span>
            <textarea
              id="body"
              name="body"
              required
              rows={9}
              placeholder="공지 내용을 입력해주세요"
              className="flex-1 bg-gray-100 rounded px-4 py-3 text-sm text-gray-800 resize-none focus:outline-none focus:ring-2 focus:ring-brand-500 border-0"
            />
          </div>

          {/* 버튼 */}
          <div className="flex justify-end gap-2 px-5 py-4">
            <label
              htmlFor="file"
              className="cursor-pointer rounded-lg bg-brand-600 text-white px-4 py-2 text-sm font-semibold hover:bg-brand-700"
            >
              파일 업로드
            </label>
            <input id="file" name="file" type="file" className="hidden" />
            <button
              type="submit"
              className="rounded-lg bg-brand-600 text-white px-5 py-2 text-sm font-semibold hover:bg-brand-700"
            >
              확인
            </button>
            <a
              href="/admin/notices"
              className="rounded-lg border border-gray-300 text-gray-700 px-5 py-2 text-sm font-semibold hover:bg-gray-50"
            >
              취소
            </a>
          </div>
        </form>
      </div>
    </AdminNoticesShell>
  )
}
