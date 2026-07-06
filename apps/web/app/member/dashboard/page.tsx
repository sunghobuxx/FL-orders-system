export const runtime = 'edge'

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/supabase/server'

export default async function MemberDashboardPage() {
  const { user, supabase } = await getSessionUser()
  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('memberships')
    .select('organizations(id, name)')
    .eq('user_id', user.id)
    .single()

  const orgData = membership?.organizations
  const org = (Array.isArray(orgData) ? orgData[0] : orgData) as { id: string; name: string } | undefined
  const today = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().split('T')[0]

  const MENUS = [
    { href: '/member/order-confirm', label: '발주하기', desc: '오늘 발주를 입력하세요', emoji: '📦' },
    { href: '/member/order-history', label: '발주 내역', desc: '발주 현황을 확인하세요', emoji: '📋' },
    { href: `/member/spec?date=${today}`, label: '오늘 명세서', desc: '납품 명세서를 확인하세요', emoji: '📄' },
    { href: '/member/settlement/history', label: '정산 내역', desc: '정산 내역을 확인하세요', emoji: '💰' },
    { href: '/member/notices', label: '공지사항', desc: '새 공지를 확인하세요', emoji: '📢' },
    { href: '/member/inquiries', label: '1:1 문의', desc: '궁금한 점을 문의하세요', emoji: '💬' },
    { href: '/member/profile', label: '내 정보', desc: '프로필을 수정하세요', emoji: '👤' },
  ]

  return (
    <div className="min-h-screen bg-gray-50 pb-8">
      <div className="bg-white border-b border-gray-200 px-4 py-5">
        <p className="text-xs text-gray-400">안녕하세요</p>
        <h1 className="text-xl font-bold text-gray-900 mt-0.5">{org?.name ?? '업체'}</h1>
      </div>

      <div className="px-4 pt-4 grid grid-cols-2 gap-3 max-w-2xl mx-auto">
        {MENUS.map(m => (
          <Link key={m.href} href={m.href}
            className="bg-white rounded-xl border border-gray-200 p-4 flex flex-col gap-2 hover:border-brand-300 hover:shadow-sm transition-all">
            <span className="text-2xl">{m.emoji}</span>
            <div>
              <div className="text-sm font-semibold text-gray-900">{m.label}</div>
              <div className="text-xs text-gray-400 mt-0.5">{m.desc}</div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
