export const runtime = 'edge'

import Link from 'next/link'

import { createAdminClient } from '@/lib/supabase/admin'
import AdminNoticesShell from '../../notices/AdminNoticesShell'

const STATUS_LABEL: Record<string, string> = {
  open: '확인 필요',
  pending: '확인 필요',
  answered: '답변 완료',
  resolved: '답변 완료',
}

const STATUS_COLOR: Record<string, string> = {
  open: 'bg-yellow-100 text-yellow-700',
  pending: 'bg-yellow-100 text-yellow-700',
  answered: 'bg-green-100 text-green-700',
  resolved: 'bg-green-100 text-green-700',
}

export default async function AdminWorkNotesPage() {
  // inquiries 의 RLS 는 "자기가 쓴 글만" 이라 세션 클라이언트로 읽으면
  // 작성한 본인 외에는 목록이 비어 보인다. 어드민 화면은 service role 로 읽는다.
  const db = createAdminClient()

  const { data: notes } = await db
    .from('inquiries')
    .select('id, title, content, status, created_at, organizations(name)')
    .eq('category', 'work_note')
    .order('created_at', { ascending: false })

  const rows = notes ?? []

  return (
    <AdminNoticesShell>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-sm text-gray-500">총 {rows.length}개</span>
            <p className="text-xs text-gray-400">어드민에서 작성해 배송매니저 앱으로 전달하는 내용입니다.</p>
          </div>
          <Link
            href="/admin/inquiries/work-notes/new"
            className="rounded-lg bg-brand-600 text-white px-4 py-2 text-sm font-semibold hover:bg-brand-700"
          >
            새 전달사항
          </Link>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {rows.length === 0 ? (
            <p className="px-5 py-8 text-sm text-gray-400 text-center">배송 중 전달 사항이 없습니다.</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {rows.map(note => {
                const orgName = (note.organizations as unknown as { name: string } | null)?.name ?? ''
                // 예전에는 /admin/inquiries/[id] 로 보냈는데, 그건 문의 상세 화면이라
                // 전달 사항을 열면 "문의 목록" 탭이 켜진 채로 떴다. 내용을 여기서 바로 보여준다.
                return (
                  <div key={note.id} className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${STATUS_COLOR[note.status] ?? 'bg-gray-100 text-gray-600'}`}>
                        {STATUS_LABEL[note.status] ?? note.status}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-gray-900 truncate">{note.title}</div>
                        {orgName && <div className="text-xs text-gray-400">{orgName}</div>}
                      </div>
                      <span className="text-xs text-gray-400 shrink-0">
                        {new Date(note.created_at).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit' })}
                      </span>
                      <Link
                        href={`/admin/inquiries/work-notes/edit?id=${note.id}`}
                        className="shrink-0 rounded-lg border border-gray-300 text-gray-600 px-3 py-1 text-xs font-semibold hover:bg-gray-50"
                      >
                        수정
                      </Link>
                    </div>
                    {note.content && (
                      <p className="mt-1.5 text-sm text-gray-600 whitespace-pre-wrap">{note.content}</p>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </AdminNoticesShell>
  )
}
