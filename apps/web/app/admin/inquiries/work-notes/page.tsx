export const runtime = 'edge'

import Link from 'next/link'

import { getSessionUser } from '@/lib/supabase/server'
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
  const { supabase: db } = await getSessionUser()

  const { data: notes } = await db
    .from('inquiries')
    .select('id, title, status, created_at, organizations(name)')
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
                return (
                  <Link
                    key={note.id}
                    href={`/admin/inquiries/${note.id}`}
                    className="flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50 transition-colors"
                  >
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
                  </Link>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </AdminNoticesShell>
  )
}
