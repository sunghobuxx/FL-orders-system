export const runtime = 'edge'

import { notFound } from 'next/navigation'

import { getSessionUser } from '@/lib/supabase/server'

import AdminNoticesShell from '../AdminNoticesShell'
import { DeleteNoticeButton } from '../NoticeButtons'

interface Props {
  params: Promise<{ id: string }>
}

export default async function NoticeDetailPage({ params }: Props) {
  const { id } = await params
  const { supabase: db } = await getSessionUser()

  const { data: notice } = await db
    .from('notices')
    .select('id, title, body, created_at, file_path')
    .eq('id', id)
    .single()

  if (!notice) notFound()

  const dateStr = new Date(notice.created_at).toLocaleDateString('ko-KR', {
    year: '2-digit', month: '2-digit', day: '2-digit',
  })

  return (
    <AdminNoticesShell>
      <div className="max-w-2xl space-y-4">
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100">
            <span className="text-sm text-gray-500 shrink-0">제목:</span>
            <span className="flex-1 bg-gray-100 px-4 py-2 rounded text-sm font-semibold text-gray-800">
              {notice.title}
            </span>
            <span className="text-sm text-gray-400 bg-gray-100 px-3 py-2 rounded shrink-0">{dateStr}</span>
          </div>
          <div className="flex gap-3 px-5 py-4 border-b border-gray-100">
            <span className="text-sm text-gray-500 shrink-0 pt-1">내용:</span>
            <div className="flex-1 bg-gray-100 rounded-lg px-4 py-3 min-h-48">
              <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{notice.body}</p>
            </div>
          </div>
          {notice.file_path && (
            <div className="flex items-center gap-3 px-5 py-4">
              <span className="text-sm text-gray-500 shrink-0">첨부:</span>
              <a
                href={notice.file_path}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-brand-600 hover:underline truncate"
              >
                {decodeURIComponent(notice.file_path.split('/').pop() ?? '파일').replace(/^\d+_/, '')}
              </a>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <DeleteNoticeButton id={id} />
          <a href={`/admin/notices/${id}/edit`}
            className="rounded-lg bg-brand-600 text-white px-5 py-2 text-sm font-semibold hover:bg-brand-700">
            수정
          </a>
          <a href="/admin/notices"
            className="rounded-lg border border-gray-300 text-gray-700 px-5 py-2 text-sm font-semibold hover:bg-gray-50">
            목록
          </a>
        </div>
      </div>
    </AdminNoticesShell>
  )
}
