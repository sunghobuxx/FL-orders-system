export const runtime = 'edge'

import { notFound } from 'next/navigation'

import { createAdminClient } from '@/lib/supabase/admin'
import { getSessionUser } from '@/lib/supabase/server'

import AdminNoticesShell from '../../notices/AdminNoticesShell'
import ReplyForm from './ReplyForm'

interface Props {
  params: Promise<{ id: string }>
}

export default async function InquiryReplyPage({ params }: Props) {
  const { id } = await params
  const { user } = await getSessionUser()
  if (!user) notFound()

  // RLS 가 "자기가 쓴 글만" 이라 세션 클라이언트로는 식당 문의를 열면 notFound 가 된다.
  const db = createAdminClient()

  const { data: inquiry } = await db
    .from('inquiries')
    .select('id, title, content, status, created_at, reply, replied_at, image_paths, organizations(name)')
    .eq('id', id)
    .single()

  if (!inquiry) notFound()

  const orgName = (inquiry.organizations as unknown as { name: string } | null)?.name ?? '알 수 없음'
  const images = (inquiry.image_paths ?? []) as string[]
  const dateStr = new Date(inquiry.created_at).toLocaleDateString('ko-KR', {
    year: '2-digit', month: '2-digit', day: '2-digit',
  })

  return (
    <AdminNoticesShell>
      <div className="max-w-2xl space-y-4">
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {/* 제목 + 날짜 */}
          <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100">
            <span className="text-sm text-gray-500 shrink-0">제목:</span>
            <span className="flex-1 bg-gray-100 px-4 py-2 rounded text-sm font-semibold text-gray-800">
              {inquiry.title}
            </span>
            <span className="text-sm text-gray-400 bg-gray-100 px-3 py-2 rounded shrink-0">{dateStr}</span>
          </div>

          {/* 내용 */}
          <div className="flex gap-3 px-5 py-4 border-b border-gray-100">
            <span className="text-sm text-gray-500 shrink-0 pt-1">내용:</span>
            <div className="flex-1 bg-gray-100 rounded-lg px-4 py-3 min-h-28">
              <p className="text-xs text-gray-400 mb-1">{orgName}</p>
              <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{inquiry.content}</p>
            </div>
          </div>

          {/* 사진 */}
          {images.length > 0 && (
            <div className="flex gap-3 px-5 py-4 border-b border-gray-100">
              <span className="text-sm text-gray-500 shrink-0 pt-1">사진:</span>
              <div className="flex flex-wrap gap-2">
                {images.map(path => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={path} src={path} alt="첨부 이미지"
                    className="w-28 h-28 object-cover rounded-lg border border-gray-200 bg-gray-100" />
                ))}
              </div>
            </div>
          )}
          {images.length === 0 && (
            <div className="flex gap-3 px-5 py-4 border-b border-gray-100">
              <span className="text-sm text-gray-500 shrink-0 pt-1">사진:</span>
              <div className="flex gap-2">
                {[1, 2, 3].map(i => <div key={i} className="w-28 h-28 bg-gray-100 rounded-lg" />)}
              </div>
            </div>
          )}

          {/* 답변 입력 + 저장 */}
          <ReplyForm inquiryId={id} initialReply={inquiry.reply ?? ''} />
        </div>
      </div>
    </AdminNoticesShell>
  )
}
