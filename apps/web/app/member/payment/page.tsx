export const runtime = 'edge'

import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getSessionUser } from '@/lib/supabase/server'

export default async function MemberPaymentPage() {
  const { user, supabase } = await getSessionUser()
  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('memberships').select('organizations(id, name)').eq('user_id', user.id).single()
  const orgData = membership?.organizations
  const org = (Array.isArray(orgData) ? orgData[0] : orgData) as { id: string; name: string } | undefined

  if (!org) redirect('/member/dashboard')

  const { data: receivable } = await supabase
    .from('receivables')
    .select('balance')
    .eq('organization_id', org.id)
    .maybeSingle()

  const balance = receivable?.balance ?? 0
  const fmt = (n: number) => n.toLocaleString('ko-KR') + '원'

  return (
    <div className="min-h-screen bg-gray-50 p-4 max-w-2xl mx-auto space-y-4">
      <div className="flex items-center gap-3 py-2">
        <Link href="/member/dashboard" className="text-gray-400 hover:text-gray-600">
          ←
        </Link>
        <h1 className="text-lg font-bold text-gray-900">결제</h1>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-500">미수금</span>
          <span className={`text-xl font-bold ${balance > 0 ? 'text-red-600' : 'text-green-600'}`}>
            {fmt(balance)}
          </span>
        </div>
        {balance <= 0 && (
          <p className="text-sm text-green-600 text-center py-4">미수금이 없습니다 ✓</p>
        )}
      </div>

      {balance > 0 && (
        <div className="bg-brand-50 rounded-xl border border-brand-200 p-5 text-center space-y-2">
          <p className="text-sm text-brand-700 font-medium">결제 문의</p>
          <p className="text-sm text-gray-600">담당자에게 연락하여 결제해 주세요.</p>
        </div>
      )}
    </div>
  )
}
