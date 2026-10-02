export const runtime = 'edge'

import { requireAuthorizedAdminDb } from '@/lib/admin-member-user'
import AdminMembersShell from '../AdminMembersShell'
import AddressReviewClient from './AddressReviewClient'

const TYPE_LABELS: Record<string, string> = {
  restaurant: '매출 업체',
  supplier: '매입 공급처',
}

export default async function AddressReviewPage() {
  const db = await requireAuthorizedAdminDb()

  const { data: orgs } = await db
    .from('organizations')
    .select('id, name, organization_type, address')
    .in('organization_type', ['restaurant', 'supplier'])
    .eq('status', 'active')
    .order('name')

  const rows = (orgs ?? []).map((o: { id: string; name: string; organization_type: string; address: string | null }) => ({
    id: o.id,
    name: o.name,
    typeLabel: TYPE_LABELS[o.organization_type] ?? o.organization_type,
    address: o.address,
  }))

  return (
    <AdminMembersShell>
      <div className="max-w-3xl space-y-4">
        <div>
          <h1 className="text-lg font-bold text-gray-800">업체 주소 일괄 검색</h1>
          <p className="text-sm text-gray-500 mt-1">
            업체명으로 카카오 지도에서 주소를 찾아 채웁니다. 자동으로 저장되지 않으니, 맞는지 확인하고 직접 저장하세요.
          </p>
        </div>
        <AddressReviewClient rows={rows} />
      </div>
    </AdminMembersShell>
  )
}
