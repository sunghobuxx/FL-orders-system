export const runtime = 'edge'

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/supabase/server'
import NoticesShell from '../notices/NoticesShell'

export default async function MemberInquiriesPage() {
  const { user, supabase } = await getSessionUser()
  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('memberships').select('organizations(id)').eq('user_id', user.id).single()
  const orgData = membership?.organizations
  const org = (Array.isArray(orgData) ? orgData[0] : orgData) as { id: string } | undefined

  const { data: inquiries } = org
    ? await supabase
        .from('inquiries')
        .select('id, title, status, created_at')
        .eq('organization_id', org.id)
        .order('created_at', { ascending: false })
    : { data: [] }

  const STATUS_LABEL: Record<string, string> = { pending: '대기', answered: '답변' }
  const STATUS_COLOR: Record<string, string> = {
    pending: 'bg-yellow-100 text-yellow-700',
    answered: 'bg-green-100 text-green-700',
  }

  return (
    <NoticesShell>
      <div className="space-y-3">
        <div className="flex justify-end">
          <Link href="/member/inquiries/new"
            className="rounded-lg bg-brand-600 text-white px-4 py-2 text-sm font-semibold hover:bg-brand-700">
            + 문의하기
          </Link>
        </div>
        {(inquiries ?? []).length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 px-5 py-10 text-sm text-gray-400 text-center">
            문의 내역이 없습니다.
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden divide-y divide-gray-100">
            {(inquiries ?? []).map(inq => (
              <div key={inq.id} className="flex items-center gap-3 px-5 py-3.5">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${STATUS_COLOR[inq.status] ?? 'bg-gray-100 text-gray-600'}`}>
                  {STATUS_LABEL[inq.status] ?? inq.status}
                </span>
                <span className="text-sm text-gray-900 flex-1 truncate">{inq.title}</span>
                <span className="text-xs text-gray-400 shrink-0">
                  {new Date(inq.created_at).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit' })}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </NoticesShell>
  )
}
