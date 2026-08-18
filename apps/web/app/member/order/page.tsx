export const runtime = 'edge'

import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildPriceMapByProduct } from '@/lib/specs/sync'
import OrderShell from './OrderShell'
import CutoffBanner from './CutoffBanner'
import OrderForm from './OrderForm'

export default async function MemberOrderPage() {
  const { user, supabase } = await getSessionUser()
  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('memberships')
    .select('organizations(id, name)')
    .eq('user_id', user.id)
    .single()

  const orgData = membership?.organizations
  const org = (Array.isArray(orgData) ? orgData[0] : orgData) as { id: string; name: string } | undefined

  if (!org) return (
    <OrderShell orgName="" date="">
      <div className="flex items-center justify-center h-64 text-gray-400 text-sm">
        업체 정보가 없습니다. 관리자에게 문의해주세요.
      </div>
    </OrderShell>
  )

  const { data: restaurant } = await supabase
    .from('restaurants')
    .select('id')
    .eq('organization_id', org.id)
    .single()

  const now = new Date(Date.now() + 9 * 60 * 60 * 1000)
  const today = now.toISOString().split('T')[0]
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  const kstMinutes = 60 * now.getUTCHours() + now.getUTCMinutes()
  const afterCutoff = kstMinutes >= 240

  if (!restaurant) return (
    <OrderShell orgName={org.name} date={today}>
      <div className="flex items-center justify-center h-64 text-gray-400 text-sm">
        식당 정보가 등록되지 않았습니다.
      </div>
    </OrderShell>
  )

  const { data: todayBatch } = await supabase
    .from('order_batches')
    .select('id, status')
    .eq('restaurant_id', restaurant.id)
    .eq('business_date', today)
    .maybeSingle()

  const businessDate =
    (todayBatch && !['open', 'submitted'].includes(todayBatch.status)) || afterCutoff
      ? tomorrow
      : today

  const { data: batch } = businessDate === tomorrow
    ? await supabase.from('order_batches').select('id, status').eq('restaurant_id', restaurant.id).eq('business_date', tomorrow).maybeSingle()
    : { data: todayBatch }

  let orderId: string | null = null
  let existingItems: any[] = []

  if (batch) {
    const { data: latestOrder } = await supabase
      .from('orders')
      .select('id')
      .eq('batch_id', batch.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (latestOrder) {
      orderId = latestOrder.id
      const { data: items } = await supabase
        .from('order_items')
        .select('id, product_id, qty, unit, unit_price_snapshot, memo, products(standard_name, is_kg_based, image_path)')
        .eq('order_id', latestOrder.id)
      existingItems = items ?? []
    }
  }

  const { data: whitelist } = await supabase
    .from('restaurant_products')
    .select('product_id, added_by')
    .eq('restaurant_id', restaurant.id)
    .order('display_order')

  const hasWhitelist = (whitelist ?? []).length > 0
  const whitelistIds = (whitelist ?? []).map(w => w.product_id)
  // 회원이 직접 넣은 품목에만 화면에서 × 가 붙는다.
  const addedByOf = new Map((whitelist ?? []).map(w => [w.product_id, w.added_by ?? 'admin']))

  let products: any[] = []
  if (hasWhitelist) {
    const { data: items } = await supabase
      .from('products')
      .select('id, standard_name, default_unit, allowed_units, is_kg_based, image_path, category')
      .eq('status', 'active')
      .in('id', whitelistIds)
    products = whitelistIds
      .map(id => items?.find((p: any) => p.id === id))
      .filter(Boolean)
      .map((p: any) => ({ ...p, added_by: addedByOf.get(p.id) ?? 'admin' }))
  } else {
    const { data: items } = await supabase
      .from('products')
      .select('id, standard_name, default_unit, allowed_units, is_kg_based, image_path, category')
      .eq('status', 'active')
      .order('category')
      .order('standard_name')
    products = items ?? []
  }

  const productIds = products.map((p: any) => p.id)
  const adminSupabase = createAdminClient()

  // 화면에 찍는 단가.
  //
  // 예전에는 price_snapshots 를 화면에서 직접 골라 썼는데, 그 방식은 업체별 고정단가
  // (org_product_prices)를 못 본다. 명세서·앱·품목추가 화면은 buildPriceMapByProduct 를
  // 쓰므로, 여기만 다른 값을 보여주면 회원이 보는 금액과 청구 금액이 어긋난다.
  const { priceMap } = productIds.length > 0
    ? await buildPriceMapByProduct(adminSupabase, productIds, businessDate, org.id)
    : { priceMap: {} as Record<string, number> }

  // 단위가 둘 이상인 품목은 단위마다 단가가 다르다 (양파 kg 2,000 / bag 17,000).
  // 회원이 단위를 바꾸면 화면 단가도 따라가야 하므로 `품목:단위` 로 미리 만들어 둔다.
  // 단위가 하나뿐인 품목은 조회하지 않는다 — 137개를 다 도는 건 낭비다.
  const multiUnit = products.filter((p: any) =>
    [...new Set([p.default_unit, ...(p.allowed_units ?? [])])].filter(Boolean).length > 1)
  const unitPriceMap: Record<string, number> = {}
  if (multiUnit.length > 0) {
    const multiIds = multiUnit.map((p: any) => p.id)
    const allUnits = [...new Set(multiUnit.flatMap((p: any) =>
      [...new Set([p.default_unit, ...(p.allowed_units ?? [])])].filter(Boolean)))] as string[]
    for (const unit of allUnits) {
      const { priceMap: byUnit } = await buildPriceMapByProduct(
        adminSupabase, multiIds, businessDate, org.id,
        Object.fromEntries(multiIds.map((id: string) => [id, unit])))
      for (const id of multiIds) {
        if (byUnit[id] !== undefined) unitPriceMap[`${id}:${unit}`] = Number(byUnit[id])
      }
    }
  }

  // 단가가 없어 담당자 확인을 기다리는 품목. 회원이 "넣었는데 왜 안 보이지" 하지 않게 알린다.
  const { data: pendingRows } = await adminSupabase
    .from('product_requests')
    .select('products(standard_name)')
    .eq('restaurant_id', restaurant.id)
    .eq('status', 'pending')
  const pendingNames = (pendingRows ?? []).map((r: any) => {
    const p = Array.isArray(r.products) ? r.products[0] : r.products
    return p?.standard_name ?? '품목'
  })

  const { data: prices } = productIds.length > 0
    ? await adminSupabase.from('supplier_products').select('id, product_id, price_snapshots').in('product_id', productIds)
    : { data: [] }

  return (
    <OrderShell orgName={org.name} date={businessDate}>
      <CutoffBanner initialKstMinutes={kstMinutes} />
      <OrderForm
        restaurantId={restaurant.id}
        businessDate={businessDate}
        batchId={batch?.id ?? null}
        orderId={orderId}
        products={products}
        prices={prices ?? []}
        existingItems={existingItems}
        pendingNames={pendingNames}
        unitPrices={priceMap}
        unitPriceMap={unitPriceMap}
      />
    </OrderShell>
  )
}
