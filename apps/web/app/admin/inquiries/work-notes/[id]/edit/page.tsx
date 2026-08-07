export const runtime = 'edge'

import Link from 'next/link'
import { notFound } from 'next/navigation'

import { requireAuthorizedAdminDb } from '@/lib/admin-member-user'
import { DRIVER_NOTE_CATEGORY } from '@/lib/driver-api'
import AdminNoticesShell from '../../../../notices/AdminNoticesShell'
import { updateWorkNote } from '../../actions'

interface Props {
  params: Promise<{ id: string }>
  searchParams: Promise<{ error?: string }>
}

export default async function EditWorkNotePage({ params, searchParams }: Props) {
  const { id } = await params
  const { error } = await searchParams

  // 목록은 service role 로 읽기만 하지만 고치는 화면은 권한을 본다.
  const db = await requireAuthorizedAdminDb()

  // category 를 함께 건다. 이 주소로 회원 문의를 열어 고치지 못하게 한다.
  const { data: note } = await db
    .from('inquiries')
    .select('id, title, content, created_at')
    .eq('id', id)
    .eq('category', DRIVER_NOTE_CATEGORY)
    .maybeSingle()

  if (!note) notFound()

  const written = new Date(note.created_at).toLocaleDateString('ko-KR', {
    timeZone: 'Asia/Seoul', year: '2-digit', month: '2-digit', day: '2-digit',
  })

  return (
    <AdminNoticesShell>
      <div className="max-w-2xl space-y-4">
        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            {decodeURIComponent(error)}
          </div>
        )}

        <form action={updateWorkNote} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <input type="hidden" name="id" value={note.id} />

          <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100">
            <span className="text-sm text-gray-500 shrink-0">제목:</span>
            <input
              name="title"
              required
              defaultValue={note.title ?? ''}
              placeholder="배송매니저에게 전달할 제목"
              className="flex-1 bg-gray-100 rounded px-4 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-brand-500 border-0"
            />
            <span className="text-sm text-gray-400 bg-gray-100 px-3 py-2 rounded shrink-0">{written}</span>
          </div>

          <div className="flex gap-3 px-5 py-4 border-b border-gray-100">
            <span className="text-sm text-gray-500 shrink-0 pt-1">내용:</span>
            <textarea
              name="content"
              required
              rows={9}
              defaultValue={note.content ?? ''}
              placeholder="배송 중 전달할 내용을 입력해주세요"
              className="flex-1 bg-gray-100 rounded px-4 py-3 text-sm text-gray-800 resize-none focus:outline-none focus:ring-2 focus:ring-brand-500 border-0"
            />
          </div>

          <div className="flex justify-end gap-2 px-5 py-4 bg-gray-50">
            <button
              type="submit"
              className="rounded-lg bg-brand-600 text-white px-5 py-2 text-sm font-semibold hover:bg-brand-700"
            >
              수정 저장
            </button>
            <Link
              href="/admin/inquiries/work-notes"
              className="rounded-lg border border-gray-300 text-gray-700 px-5 py-2 text-sm font-semibold hover:bg-gray-50"
            >
              취소
            </Link>
          </div>
        </form>
      </div>
    </AdminNoticesShell>
  )
}
