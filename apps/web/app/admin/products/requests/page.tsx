export const runtime = 'edge'

import Link from 'next/link'

import { requireAuthorizedAdminDb } from '@/lib/admin-member-user'
import { fetchAll } from '@/lib/supabase/fetch-all'
import RequestPanel from './RequestPanel'

/**
 * 회원이 올린 품목 요청 목록.
 *
 * 단가가 없어서 바로 열지 못한 것들이 여기 쌓인다. 별도 알림은 두지 않았으므로
 * 관리자가 이 화면을 봐야 한다. 회원은 그동안 「담당자 확인 중」으로 보인다.
 */

export interface RequestRow {
  id: string
  orgName: string
  productName: string
  requestedAt: string
}

export default async function ProductRequestsPage() {
  const db = await requireAuthorizedAdminDb()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = await fetchAll<any>(() => db
    .from('product_requests')
    .select('id, requested_at, products(standard_name), restaurants(organizations(name))')
    .eq('status', 'pending')
    .order('requested_at', { ascending: false }))

  const list: RequestRow[] = rows.map(r => {
    const prod = Array.isArray(r.products) ? r.products[0] : r.products
    const rest = Array.isArray(r.restaurants) ? r.restaurants[0] : r.restaurants
    const org = Array.isArray(rest?.organizations) ? rest.organizations[0] : rest?.organizations
    return {
      id: r.id,
      orgName: org?.name ?? '알 수 없음',
      productName: prod?.standard_name ?? '품목',
      requestedAt: new Date(r.requested_at).toLocaleDateString('ko-KR', {
        timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit',
      }),
    }
  })

  return (
    <div className="p-6 max-w-3xl">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">품목 요청</h1>
          <p className="text-sm text-gray-400 mt-0.5">대기 {list.length}건</p>
        </div>
        <Link
          href="/admin/products"
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-500 hover:bg-gray-50"
        >
          ← 품목 마스터
        </Link>
      </div>

      <RequestPanel rows={list} />
    </div>
  )
}
