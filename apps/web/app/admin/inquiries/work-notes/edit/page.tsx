export const runtime = 'edge'

import Link from 'next/link'
import { notFound } from 'next/navigation'

import { requireAuthorizedAdminDb } from '@/lib/admin-member-user'
import { DRIVER_NOTE_CATEGORY } from '@/lib/driver-api'
import AdminNoticesShell from '../../../notices/AdminNoticesShell'
import { updateWorkNote } from '../actions'

/**
 * 전달사항 수정.
 *
 * id 를 경로가 아니라 쿼리로 받는다. `[id]/edit` 로 두면 **수정 저장이 404 로 죽는다.**
 * Cloudflare Pages 에서 대괄호 동적 경로로 가는 서버 액션 POST 가 404 가 되기 때문이다.
 * 화면을 여는 GET 은 멀쩡해서 눈으로는 멀쩡해 보이고, 저장할 때만 터진다.
 * (2026-08-08 확인: /work-notes/new 같은 정적 경로의 액션은 정상,
 *  /work-notes/[id]/edit 은 POST 404 → 화면에 "오류가 발생했습니다")
 * 같은 이유로 deploy.yml 에도 대괄호 경로 패치 단계가 따로 있다.
 */

interface Props {
  searchParams: Promise<{ id?: string; error?: string }>
}

export default async function EditWorkNotePage({ searchParams }: Props) {
  const { id, error } = await searchParams
  if (!id) notFound()

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
