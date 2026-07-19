export const runtime = 'edge'

import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/supabase/server'
import NoticesShell from '../../notices/NoticesShell'

interface Props {
  params: Promise<{ id: string }>
}

const STATUS_LABEL: Record<string, string> = {
  open: '답변 대기',
  answered: '답변 완료',
  resolved: '처리 완료',
}
const STATUS_COLOR: Record<string, string> = {
  open: 'bg-yellow-100 text-yellow-700',
  answered: 'bg-green-100 text-green-700',
  resolved: 'bg-gray-100 text-gray-500',
}

export default async function MemberInquiryDetailPage({ params }: Props) {
  const { id } = await params
  const { user, supabase } = await getSessionUser()
  if (!user) redirect('/login')

  const { data: inquiry } = await supabase
    .from('inquiries')
    .select('id, title, content, status, created_at, reply, replied_at, image_paths')
    .eq('id', id)
    .single()

  if (!inquiry) notFound()

  const images = (inquiry.image_paths ?? []) as string[]
  const dateStr = new Date(inquiry.created_at).toLocaleDateString('ko-KR', {
    year: '2-digit', month: '2-digit', day: '2-digit', timeZone: 'Asia/Seoul',
  })
  const statusLabel = STATUS_LABEL[inquiry.status] ?? inquiry.status
  const statusColor = STATUS_COLOR[inquiry.status] ?? 'bg-gray-100 text-gray-500'

  return (
    <NoticesShell>
      <div className="space-y-3 max-w-2xl">
        <div className="flex items-center gap-2">
          <Link href="/member/inquiries" className="text-sm text-gray-400 hover:text-gray-600">← 목록</Link>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {/* 제목 + 날짜 + 상태 */}
          <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100">
            <span className="flex-1 bg-gray-100 px-4 py-2 rounded text-sm font-semibold text-gray-800">
              {inquiry.title}
            </span>
            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full shrink-0 ${statusColor}`}>
              {statusLabel}
            </span>
            <span className="text-sm text-gray-400 bg-gray-100 px-3 py-2 rounded shrink-0">{dateStr}</span>
          </div>

          {/* 내용 */}
          <div className="flex gap-3 px-5 py-4 border-b border-gray-100">
            <span className="text-sm text-gray-500 shrink-0 pt-1">내용:</span>
            <div className="flex-1 bg-gray-100 rounded-lg px-4 py-3 min-h-28">
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

          {/* 답변 */}
          <div className="flex gap-3 px-5 py-4">
            <span className="text-sm text-gray-500 shrink-0 pt-1">답변:</span>
            <div className="flex-1 bg-gray-100 rounded-lg px-4 py-3 min-h-20">
              {inquiry.reply ? (
                <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{inquiry.reply}</p>
              ) : (
                <p className="text-sm text-gray-400">아직 답변이 등록되지 않았습니다.</p>
              )}
            </div>
          </div>

          {/* 확인 버튼 */}
          <div className="flex justify-end px-5 py-4 border-t border-gray-100 bg-gray-50">
            <Link href="/member/inquiries"
              className="rounded-lg bg-brand-600 text-white px-8 py-2.5 text-sm font-semibold hover:bg-brand-700">
              확인
            </Link>
          </div>
        </div>
      </div>
    </NoticesShell>
  )
}
