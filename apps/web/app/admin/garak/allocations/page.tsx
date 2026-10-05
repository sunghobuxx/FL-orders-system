export const runtime = 'edge'

import { createAdminClient } from '@/lib/supabase/admin'
import { getKstToday } from '@/lib/date-kst'
import { DISPATCH_ORDER_STATUSES } from '@/lib/dispatch/current-items'
import { isEligibleAddress, sortCandidates, type CandidateLine } from '@/lib/garak/allocation'
import GarakAllocationForm, { type AllocationGroup } from './GarakAllocationForm'

interface Props {
  searchParams: Promise<{ date?: string }>
}

/** 가락 매입 품목마다, 서울 외 업체의 발주 줄 하나를 고른다. */
export default async function GarakAllocationsPage({ searchParams }: Props) {
  const { date: dateParam } = await searchParams
  const date = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : getKstToday()
  const db = createAdminClient()

  const { data: purchases } = await db
    .from('garak_purchases')
    .select('product_id, unit, qty, products(standard_name)')
    .eq('business_date', date)
  const productIds = [...new Set((purchases ?? []).map((p: { product_id: string }) => p.product_id))]

  const { data: batches } = await db
    .from('order_batches')
    .select('id, restaurant_id')
    .eq('business_date', date)
    .in('status', DISPATCH_ORDER_STATUSES)
  const batchIds = (batches ?? []).map((b: { id: string }) => b.id)
  const restaurantIds = [...new Set((batches ?? []).map((b: { restaurant_id: string }) => b.restaurant_id))]

  const { data: restaurants } = restaurantIds.length
    ? await db.from('restaurants').select('id, organization_id').in('id', restaurantIds)
    : { data: [] as { id: string; organization_id: string }[] }
  const orgIds = [...new Set((restaurants ?? []).map((r: { organization_id: string }) => r.organization_id))]
  const { data: orgs } = orgIds.length
    ? await db.from('organizations').select('id, name, address').in('id', orgIds)
    : { data: [] as { id: string; name: string; address: string | null }[] }

  const orgOfRestaurant = Object.fromEntries((restaurants ?? []).map((r: { id: string; organization_id: string }) => [r.id, r.organization_id]))
  const orgById = Object.fromEntries((orgs ?? []).map((o: { id: string; name: string; address: string | null }) => [o.id, o]))
  const restaurantOfBatch = Object.fromEntries((batches ?? []).map((b: { id: string; restaurant_id: string }) => [b.id, b.restaurant_id]))

  const { data: orders } = batchIds.length
    ? await db.from('orders').select('id, batch_id').in('batch_id', batchIds)
    : { data: [] as { id: string; batch_id: string }[] }
  const batchOfOrder = Object.fromEntries((orders ?? []).map((o: { id: string; batch_id: string }) => [o.id, o.batch_id]))
  const orderIds = (orders ?? []).map((o: { id: string }) => o.id)

  const { data: items } = orderIds.length && productIds.length
    ? await db.from('order_items').select('id, qty, unit, product_id, order_id').in('order_id', orderIds).in('product_id', productIds)
    : { data: [] as { id: string; qty: number; unit: string; product_id: string; order_id: string }[] }

  const { data: existing } = await db.from('garak_allocations').select('id, product_id, order_item_id').eq('business_date', date)
  const chosenByProduct = Object.fromEntries((existing ?? []).map((a: { product_id: string; order_item_id: string }) => [a.product_id, a.order_item_id]))

  type PurchaseRow = { product_id: string; unit: string; qty: number; products: { standard_name: string } | null }
  const groups: AllocationGroup[] = ((purchases ?? []) as unknown as PurchaseRow[]).map(p => {
    const lines: CandidateLine[] = (items ?? [])
      .filter((it: { product_id: string }) => it.product_id === p.product_id)
      .flatMap((it: { id: string; qty: number; unit: string; order_id: string }) => {
        const batchId = batchOfOrder[it.order_id]
        const restaurantId = restaurantOfBatch[batchId]
        const org = orgById[orgOfRestaurant[restaurantId]]
        if (!org || !isEligibleAddress(org.address)) return []
        return [{ orderItemId: it.id, restaurantName: org.name, qty: Number(it.qty), unit: it.unit }]
      })
    return {
      productId: p.product_id,
      productName: p.products?.standard_name ?? '품목',
      purchaseQty: Number(p.qty),
      unit: p.unit,
      candidates: sortCandidates(lines, Number(p.qty)),
      chosenOrderItemId: chosenByProduct[p.product_id] ?? null,
    }
  })

  return (
    <div className="p-6 max-w-2xl space-y-5">
      <div>
        <h1 className="text-lg font-bold text-gray-900">가락 품목 배정 — {date}</h1>
        <p className="text-sm text-gray-400 mt-0.5">가락에서 산 품목을 서울 외 업체의 발주 줄 하나에 배정합니다. 줄은 나누지 않습니다.</p>
      </div>
      <GarakAllocationForm date={date} groups={groups} />
    </div>
  )
}
