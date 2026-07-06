export const runtime = 'edge'

import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'

import { getSessionUser } from '@/lib/supabase/server'

import NoticesShell from '../NoticesShell'

interface Props {
  params: Promise<{ id: string }>
}

export default async function NoticeDetailPage({ params }: Props) {
  const { id } = await params
  const { user, supabase } = await getSessionUser()
  if (!user) redirect('/login')

  const { data: notice } = await supabase
    .from('notices')
    .select('id, title, body, created_at, file_path')
    .eq('id', id)
    .single()

  if (!notice) notFound()

  return (
    <NoticesShell>
      <div className="space-y-4 max-w-2xl">
        {/* 제목 + 날짜 */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100">
            <span className="text-sm text-gray-500 shrink-0">제목:</span>
            <span className="flex-1 text-sm font-semibold text-gray-800 bg-gray-100 px-4 py-2 rounded">
              {notice.title}
            </span>
            <span className="text-sm text-gray-500 bg-gray-100 px-3 py-2 rounded shrink-0">
              {new Date(notice.created_at).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' })}
            </span>
          </div>

          {/* 내용 */}
          <div className="px-5 py-4">
            <div className="flex gap-3">
              <span className="text-sm text-gray-500 shrink-0 pt-1">내용:</span>
              <div className="flex-1 bg-gray-100 rounded-lg px-4 py-3 min-h-40">
                <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                  {notice.body}
                </p>
                {notice.file_path && (
                  <a
                    href={notice.file_path}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 inline-flex items-center gap-1 text-sm text-brand-600 hover:text-brand-800"
                  >
                    📎 첨부파일
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* 확인 버튼 */}
        <div className="flex justify-end">
          <Link
            href="/member/notices"
            className="rounded-lg bg-brand-600 text-white px-8 py-2.5 text-sm font-semibold hover:bg-brand-700"
          >
            확인
          </Link>
        </div>
      </div>
    </NoticesShell>
  )
}
