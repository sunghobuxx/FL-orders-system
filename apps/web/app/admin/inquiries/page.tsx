export const runtime = 'edge'

import Link from 'next/link'
import { getSessionUser } from '@/lib/supabase/server'
import AdminNoticesShell from '../notices/AdminNoticesShell'

export default async function AdminInquiriesPage() {
  const { supabase: db } = await getSessionUser()

  const { data: inquiries } = await db
    .from('inquiries')
    .select('id, title, status, created_at, organizations(name)')
    .order('created_at', { ascending: false })

  const STATUS_LABEL: Record<string, string> = {
    pending: '답변 대기',
    answered: '답변 완료',
  }
  const STATUS_COLOR: Record<string, string> = {
    pending: 'bg-yellow-100 text-yellow-700',
    answered: 'bg-green-100 text-green-700',
  }

  return (
    <AdminNoticesShell>
      <div className="space-y-3">
        <span className="text-sm text-gray-500">총 {(inquiries ?? []).length}개</span>
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {(inquiries ?? []).length === 0 ? (
            <p className="px-5 py-8 text-sm text-gray-400 text-center">문의가 없습니다.</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {(inquiries ?? []).map(inq => {
                const orgName = (inq.organizations as unknown as { name: string } | null)?.name ?? ''
                return (
                  <Link key={inq.id} href={`/admin/inquiries/${inq.id}`}
                    className="flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50 transition-colors">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${STATUS_COLOR[inq.status] ?? 'bg-gray-100 text-gray-600'}`}>
                      {STATUS_LABEL[inq.status] ?? inq.status}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-gray-900 truncate">{inq.title}</div>
                      {orgName && <div className="text-xs text-gray-400">{orgName}</div>}
                    </div>
                    <span className="text-xs text-gray-400 shrink-0">
                      {new Date(inq.created_at).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit' })}
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
