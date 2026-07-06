export const runtime = 'edge'

import { createAdminClient } from '@/lib/supabase/admin'
import AdminOrderForm from './AdminOrderForm'

function kstToday() {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().split('T')[0]
}

function shiftDate(d: string, delta: number) {
  const dt = new Date(`${d}T00:00:00Z`)
  dt.setUTCDate(dt.getUTCDate() + delta)
  return dt.toISOString().split('T')[0]
}

type ProductRow = {
  id: string; standard_name: string; default_unit: string
  allowed_units: string[]; is_kg_based: boolean; image_path: string | null; category: string
}

export default async function AdminDirectOrderPage({
  searchParams,
}: {
  searchParams: Promise<{ restaurantId?: string; date?: string }>
}) {
  const { restaurantId, date: dateParam } = await searchParams
  const db = createAdminClient()

  // 전체 활성 식당 목록
  const { data: restaurants } = await db
    .from('restaurants')
    .select('id, organization_id, organizations(name)')
    .eq('status', 'active')

  const restList = (restaurants ?? []).map(r => {
    const orgRaw = r.organizations
    const name = ((Array.isArray(orgRaw) ? orgRaw[0] : orgRaw) as { name: string } | null)?.name ?? '알 수 없음'
    return { id: r.id as string, name }
  }).sort((a, b) => a.name.localeCompare(b.name, 'ko'))

  const selectedDate = dateParam ?? kstToday()
  const selectedRestaurant = restaurantId ? restList.find(r => r.id === restaurantId) ?? null : null

  // 업체 선택 안 된 경우
  if (!selectedRestaurant) {
    return (
      <div className="max-w-2xl mx-auto p-4 md:p-6">
        <h1 className="text-xl font-bold text-gray-900 mb-4">직접 발주 입력</h1>
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <p className="text-sm text-gray-500 mb-3">업체를 선택하세요</p>
          <div className="space-y-2">
            {restList.map(r => (
              <a
                key={r.id}
                href={`/admin/orders/direct?restaurantId=${r.id}&date=${selectedDate}`}
                className="block px-4 py-3 rounded-lg border border-gray-200 text-sm font-medium text-gray-800 hover:bg-gray-50 transition-colors"
              >
                {r.name}
              </a>
            ))}
          </div>
        </div>
      </div>
    )
  }

  // 품목 화이트리스트
  const { data: restaurantProducts } = await db
    .from('restaurant_products')
    .select('product_id')
    .eq('restaurant_id', selectedRestaurant.id)
    .order('display_order')

  const whitelistIds = (restaurantProducts ?? []).map(rp => rp.product_id)
  const hasWhitelist = whitelistIds.length > 0

  let products: ProductRow[] = []
  if (hasWhitelist) {
    const { data } = await db
      .from('products')
      .select('id, standard_name, default_unit, allowed_units, is_kg_based, image_path, category')
      .eq('status', 'active')
      .in('id', whitelistIds)
    products = whitelistIds
      .map(pid => (data ?? []).find(p => p.id === pid))
      .filter((p): p is ProductRow => !!p)
  } else {
    const { data } = await db
      .from('products')
      .select('id, standard_name, default_unit, allowed_units, is_kg_based, image_path, category')
      .eq('status', 'active')
      .order('category')
      .order('standard_name')
    products = (data ?? []) as ProductRow[]
  }

  // 가격 데이터
  const productIds = products.map(p => p.id)
  const { data: supplierProducts } = productIds.length > 0
    ? await db
        .from('supplier_products')
        .select('id, product_id, price_snapshots')
        .in('product_id', productIds)
    : { data: [] }

  // 기존 배치/주문/품목 조회
  let batchId: string | null = null
  let orderId: string | null = null
  let existingItems: Array<{
    id: string; product_id: string; qty: number; unit: string
    unit_price_snapshot: number; memo: string | null
    products: { standard_name: string; is_kg_based: boolean; image_path: string | null }
  }> = []

  const { data: batch } = await db
    .from('order_batches')
    .select('id, status')
    .eq('restaurant_id', selectedRestaurant.id)
    .eq('business_date', selectedDate)
    .maybeSingle()

  if (batch) {
    batchId = batch.id
    const { data: order } = await db
      .from('orders')
      .select('id')
      .eq('batch_id', batch.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (order) {
      orderId = order.id
      const { data: items } = await db
        .from('order_items')
        .select('id, product_id, qty, unit, unit_price_snapshot, memo, products(standard_name, is_kg_based, image_path)')
        .eq('order_id', order.id)
      existingItems = (items ?? []) as unknown as typeof existingItems
    }
  }

  return (
    <div className="max-w-2xl mx-auto p-4 md:p-6">
      <div className="flex items-center gap-3 mb-4">
        <a href="/admin/orders/direct" className="text-gray-400 hover:text-gray-700 text-sm">← 업체 목록</a>
        <h1 className="text-xl font-bold text-gray-900">{selectedRestaurant.name} 발주 입력</h1>
      </div>

      {/* 날짜 네비게이션 */}
      <div className="bg-white rounded-xl border border-gray-200 px-4 py-3 mb-4 flex items-center gap-3">
        <span className="text-sm text-gray-500">발주 날짜</span>
        <a
          href={`/admin/orders/direct?restaurantId=${selectedRestaurant.id}&date=${shiftDate(selectedDate, -1)}`}
          className="text-gray-500 hover:text-gray-900 px-1"
        >←</a>
        <span className="font-semibold text-gray-900 text-sm">{selectedDate}</span>
        <a
          href={`/admin/orders/direct?restaurantId=${selectedRestaurant.id}&date=${shiftDate(selectedDate, 1)}`}
          className="text-gray-500 hover:text-gray-900 px-1"
        >→</a>
        {batch && (
          <span className="ml-auto text-xs text-blue-600 font-medium bg-blue-50 px-2 py-0.5 rounded-full">
            {batch.status === 'submitted' ? '제출됨' : batch.status === 'delivered' ? '배송완료' : '작성중'}
          </span>
        )}
      </div>

      <AdminOrderForm
        selectedRestaurantId={selectedRestaurant.id}
        businessDate={selectedDate}
        batchId={batchId}
        orderId={orderId}
        products={products as Parameters<typeof AdminOrderForm>[0]['products']}
        prices={(supplierProducts ?? []) as Parameters<typeof AdminOrderForm>[0]['prices']}
        existingItems={existingItems}
      />
    </div>
  )
}
