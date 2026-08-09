export const runtime = 'edge'

import { redirect } from 'next/navigation'

import { getSessionUser } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { fetchAll } from '@/lib/supabase/fetch-all'
import { buildPriceMapByProduct } from '@/lib/specs/sync'
import { buildAddable, type CatalogProduct } from '@/lib/products/self-add'
import OrderShell from '../../order/OrderShell'
import AddProductList from './AddProductList'

/**
 * 회원이 발주 품목을 고르는 전체 화면.
 *
 * 발주 화면 안에 접이식으로 두었더니 휴대폰에서 목록이 너무 좁았다. 대부분 휴대폰으로
 * 보기 때문에 화면 하나를 통째로 쓴다. 분류는 어드민 품목 마스터처럼 위쪽 칩으로 거른다.
 *
 * 목록은 서버에서 만들어 넘긴다. 열자마자 100개가 넘는 품목을 받아오게 하면
 * 휴대폰에서 빈 화면이 한참 보인다.
 */

interface Props {
  searchParams: Promise<{ category?: string }>
}

const CATEGORY_LABEL: Record<string, string> = {
  vegetable: '채소', fruit: '과일', meat: '육류', seafood: '수산',
  grain: '곡류', dairy: '유제품', seasoning: '양념', etc: '기타',
}

export default async function MemberAddProductPage({ searchParams }: Props) {
  const { category: categoryParam } = await searchParams
  const { user, supabase } = await getSessionUser()
  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('memberships')
    .select('organizations(id, name)')
    .eq('user_id', user.id)
    .single()

  const orgData = membership?.organizations
  const org = (Array.isArray(orgData) ? orgData[0] : orgData) as { id: string; name: string } | undefined
  if (!org) redirect('/member/order')

  const { data: restaurant } = await supabase
    .from('restaurants').select('id').eq('organization_id', org.id).single()
  if (!restaurant) redirect('/member/order')

  // 단가는 오늘 기준으로 보여준다. 실제 청구는 발주일 기준으로 다시 계산된다.
  const today = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10)
  const db = createAdminClient()

  const all = await fetchAll<CatalogProduct>(() => db
    .from('products').select('id, standard_name, category, default_unit').eq('status', 'active'))

  const mine = await fetchAll<{ product_id: string }>(() => db
    .from('restaurant_products').select('product_id').eq('restaurant_id', restaurant.id))
  const mineIds = new Set(mine.map(m => m.product_id))

  const pendingRows = await fetchAll<{ product_id: string }>(() => db
    .from('product_requests').select('product_id')
    .eq('restaurant_id', restaurant.id).eq('status', 'pending'))
  const pendingIds = new Set(pendingRows.map(r => r.product_id))

  const { priceMap } = await buildPriceMapByProduct(db, all.map(p => p.id), today, org.id)
  const priceOf = new Map(Object.entries(priceMap).map(([k, v]) => [k, Number(v)]))

  const addable = buildAddable(all, mineIds, pendingIds, priceOf)
    .sort((a, b) => a.standard_name.localeCompare(b.standard_name, 'ko'))

  const categoryCounts = addable.reduce<Record<string, number>>((acc, p) => {
    const cat = p.category ?? 'etc'
    acc[cat] = (acc[cat] ?? 0) + 1
    return acc
  }, {})

  const activeCategory = categoryParam && categoryCounts[categoryParam] ? categoryParam : null
  const rows = activeCategory
    ? addable.filter(p => (p.category ?? 'etc') === activeCategory)
    : addable

  const nameOf = new Map(all.map(p => [p.id, p.standard_name]))
  const pendingNames = [...pendingIds].map(id => nameOf.get(id) ?? '품목')

  return (
    <OrderShell orgName={org.name} date="" hideMeta>
      <AddProductList
        restaurantId={restaurant.id}
        rows={rows}
        categoryCounts={categoryCounts}
        categoryLabels={CATEGORY_LABEL}
        activeCategory={activeCategory}
        totalCount={addable.length}
        pendingNames={pendingNames}
      />
    </OrderShell>
  )
}
