export const runtime = 'edge'

import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/admin'
import AdminSettlementShell from '@/app/admin/settlement/AdminSettlementShell'
import AliasManager from './AliasManager'

/** 입금자 별칭 관리. 계좌 소유주 개인 이름으로 입금하는 업체가 많아 사장님이 직접 등록한다(2026-09-25 결정). */
export default async function AliasesPage() {
  const db = createAdminClient()

  const { data: restaurantRows } = await db
    .from('restaurants')
    .select('id, organizations(name, organization_type, status)')
    .eq('organizations.organization_type', 'restaurant')
  type RestRow = { id: string; organizations: { name: string; organization_type: string; status: string } | null }
  const restaurants = ((restaurantRows ?? []) as unknown as RestRow[])
    .filter(r => r.organizations?.organization_type === 'restaurant' && r.organizations?.status === 'active')
    .map(r => ({ id: r.id, name: r.organizations?.name ?? '알 수 없음' }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ko'))

  const { data: aliasRows } = await db
    .from('depositor_aliases')
    .select('id, restaurant_id, alias_raw, created_at')
    .order('created_at', { ascending: false })
  const nameOf = new Map(restaurants.map(r => [r.id, r.name]))
  const aliases = (aliasRows ?? []).map(a => ({
    id: a.id as string, restaurantId: a.restaurant_id as string,
    restaurantName: nameOf.get(a.restaurant_id as string) ?? '알 수 없음',
    aliasRaw: a.alias_raw as string,
  }))

  return (
    <AdminSettlementShell>
      <div className="space-y-3 max-w-3xl">
        <div className="flex items-center justify-between">
          <h1 className="text-sm font-semibold text-gray-700">입금자 별칭 관리</h1>
          <Link href="/admin/finance/bank-transactions" className="text-xs text-brand-600 underline underline-offset-2">
            입금 확인으로
          </Link>
        </div>
        <p className="text-xs text-gray-400">
          계좌 소유주 개인 이름으로 입금하는 업체가 많습니다. 통장에 찍히는 입금자명을 업체와 연결해 두면 입금 확인 화면에서 자동으로 추천됩니다.
        </p>
        <AliasManager restaurants={restaurants} aliases={aliases} />
      </div>
    </AdminSettlementShell>
  )
}
