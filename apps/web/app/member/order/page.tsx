export const runtime = 'edge'

import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
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
    .select('product_id')
    .eq('restaurant_id', restaurant.id)
    .order('display_order')

  const hasWhitelist = (whitelist ?? []).length > 0
  const whitelistIds = (whitelist ?? []).map(w => w.product_id)

  let products: any[] = []
  if (hasWhitelist) {
    const { data: items } = await supabase
      .from('products')
      .select('id, standard_name, default_unit, allowed_units, is_kg_based, image_path, category')
      .eq('status', 'active')
      .in('id', whitelistIds)
    products = whitelistIds.map(id => items?.find((p: any) => p.id === id)).filter(Boolean)
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
      />
    </OrderShell>
  )
}
