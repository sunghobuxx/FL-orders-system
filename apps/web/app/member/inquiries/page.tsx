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

  return (
    <NoticesShell>
      <div className="space-y-3">
        <div className="flex justify-end">
          <Link href="/member/inquiries/new"
            className="rounded-lg bg-brand-600 text-white px-4 py-2 text-sm font-semibold hover:bg-brand-700">
            ① 글쓰기
          </Link>
        </div>
        {(inquiries ?? []).length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 px-5 py-10 text-sm text-gray-400 text-center">
            문의 내역이 없습니다.
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="grid grid-cols-[56px_1fr_88px_72px] px-5 py-3 bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500">
              <span className="text-center">No</span>
              <span>Title</span>
              <span className="text-center">Date</span>
              <span className="text-center">② 답변</span>
            </div>
            <div className="divide-y divide-gray-100">
              {(inquiries ?? []).map((inq, idx) => (
                <Link key={inq.id} href={`/member/inquiries/${inq.id}`}
                  className="grid grid-cols-[56px_1fr_88px_72px] items-center px-5 py-3.5 hover:bg-gray-50 transition-colors">
                  <span className="text-sm text-gray-500 text-center">{idx + 1}</span>
                  <span className="text-sm text-gray-900 truncate">{inq.title}</span>
                  <span className="text-xs text-gray-400 text-center">
                    {new Date(inq.created_at).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit' })}
                  </span>
                  <span className="text-sm text-gray-700 text-center">{['answered', 'resolved'].includes(inq.status) ? 'Y' : '-'}</span>
                </Link>
              ))}
            </div>
            <div className="px-5 py-3 bg-gray-50 border-t border-gray-100">
              <Link href="/member/inquiries/new" className="text-sm text-brand-600 font-semibold hover:underline">글쓰기</Link>
            </div>
          </div>
        )}
      </div>
    </NoticesShell>
  )
}
