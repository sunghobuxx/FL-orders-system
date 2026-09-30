import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/admin'
import ManagerRestaurantsForm from './ManagerRestaurantsForm'
import PhoneForm from './PhoneForm'

interface Props {
  params: Promise<{ userId: string }>
}

/**
 * 이 화면은 /admin 레이아웃(requireAuthorizedAdminDb)을 반드시 거쳐야 도달한다 — 그 관문이 이미
 * "role in (admin,manager) 이거나 조직타입이 platform/operator" 만 통과시키므로, 여기서 role==='owner'
 * 를 만나면 그건 항상 운영사 오너다(식당 손님 계정은 애초에 이 레이아웃을 못 지나온다). 그래서 여기서는
 * role 만 보고 매니저/오너를 함께 허용해도 안전하다(2026-09-30, 오너도 매니저처럼 담당 업체를 고를 수 있게).
 */
export default async function AccountDetailPage({ params }: Props) {
  const { userId } = await params
  const db = createAdminClient()

  const [{ data: user }, { data: membership }] = await Promise.all([
    db.from('users').select('id, email, name, phone').eq('id', userId).single(),
    db.from('memberships').select('role').eq('user_id', userId).maybeSingle(),
  ])

  const isManager = membership?.role === 'manager'
  const isOwner = membership?.role === 'owner'
  if (!user || !(isManager || isOwner)) notFound()

  const [{ data: restaurants }, { data: assigned }] = await Promise.all([
    db.from('restaurants')
      .select('id, organizations(name)')
      .order('created_at'),
    db.from('manager_restaurants')
      .select('restaurant_id')
      .eq('user_id', userId),
  ])

  type RestRow = { id: string; organizations: { name: string } | null }
  const restRows = (restaurants ?? []) as unknown as RestRow[]
  const assignedIds = (assigned ?? []).map((a: { restaurant_id: string }) => a.restaurant_id)

  return (
    <div className="p-6 max-w-2xl space-y-4">
      <div className="flex items-center gap-3">
        <Link href="/admin/accounts" className="text-sm text-gray-400 hover:text-gray-600">← 관리자 계정</Link>
        <h1 className="text-lg font-semibold text-gray-800">{user.name || user.email}</h1>
        <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${isOwner ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}`}>
          {isOwner ? '오너' : '매니저'}
        </span>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-3 bg-gray-50 border-b border-gray-200">
          <h2 className="text-sm font-semibold text-gray-700">연락처</h2>
          <p className="text-xs text-gray-400 mt-0.5">회원 발주확인 화면에 배송 담당자 연락처로 표시됩니다.</p>
        </div>
        <PhoneForm userId={userId} initialPhone={user.phone ?? ''} />
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-3 bg-gray-50 border-b border-gray-200">
          <h2 className="text-sm font-semibold text-gray-700">담당 업체 설정</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            {isOwner
              ? '선택한 업체만 배송앱·발주 화면에서 보게 됩니다. 미선택 시 지금처럼 전체 업체가 보입니다.'
              : '선택된 업체의 당일 발주만 이 매니저에게 표시됩니다. 미선택 시 전체 업체 표시.'}
          </p>
        </div>
        <ManagerRestaurantsForm
          userId={userId}
          restaurants={restRows.map(r => ({ id: r.id, name: r.organizations?.name ?? '알 수 없음' }))}
          initialAssigned={assignedIds}
        />
      </div>
    </div>
  )
}
