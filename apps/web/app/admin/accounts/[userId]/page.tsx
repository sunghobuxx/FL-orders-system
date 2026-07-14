import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/admin'
import ManagerRestaurantsForm from './ManagerRestaurantsForm'

interface Props {
  params: Promise<{ userId: string }>
}

export default async function AccountDetailPage({ params }: Props) {
  const { userId } = await params
  const db = createAdminClient()

  const [{ data: user }, { data: membership }] = await Promise.all([
    db.from('users').select('id, email, name').eq('id', userId).single(),
    db.from('memberships').select('role').eq('user_id', userId).maybeSingle(),
  ])

  if (!user || membership?.role !== 'manager') notFound()

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
        <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-blue-100 text-blue-700">매니저</span>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-3 bg-gray-50 border-b border-gray-200">
          <h2 className="text-sm font-semibold text-gray-700">담당 업체 설정</h2>
          <p className="text-xs text-gray-400 mt-0.5">선택된 업체의 당일 발주만 이 매니저에게 표시됩니다. 미선택 시 전체 업체 표시.</p>
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
