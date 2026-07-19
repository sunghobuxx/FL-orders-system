export const runtime = 'edge'

import Link from 'next/link'
import { notFound } from 'next/navigation'

import { createAdminClient } from '@/lib/supabase/admin'

import AdminOrderShell from '../AdminOrderShell'
import { BatchConfirmPanel } from './BatchConfirmPanel'
import { getKstToday } from '@/lib/date-kst'

const STATUS_LABEL: Record<string, string> = {
  submitted: '당일발주', validated: '알림톡 발송',
  ordered: '배송중', dispatched: '배송완료', completed: '완료',
}
const STATUS_COLOR: Record<string, string> = {
  submitted: 'bg-blue-100 text-blue-700',
  validated: 'bg-purple-100 text-purple-700',
  ordered: 'bg-yellow-100 text-yellow-700',
  dispatched: 'bg-green-100 text-green-700',
  completed: 'bg-green-100 text-green-700',
}

interface Props {
  params: Promise<{ batchId: string }>
}

export default async function BatchDetailPage({ params }: Props) {
  const { batchId } = await params
  const adminDb = createAdminClient()

  const { data: batch } = await adminDb
    .from('order_batches')
    .select('id, status, business_date, submitted_at, restaurants(organizations(name))')
    .eq('id', batchId)
    .single()

  if (!batch) notFound()

  const restRaw = batch.restaurants as unknown as { organizations: { name: string } | null } | null
  const orgName = restRaw?.organizations?.name ?? '알 수 없음'

  const { data: order } = await adminDb
    .from('orders')
    .select('id')
    .eq('batch_id', batchId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  type Item = { id: string; product_id: string; qty: number; unit: string; unit_price_snapshot: number; products: { standard_name: string } }
  let items: Item[] = []
  if (order) {
    const { data } = await adminDb
      .from('order_items')
      .select('id, product_id, qty, unit, unit_price_snapshot, products(standard_name)')
      .eq('order_id', order.id)
    items = (data ?? []) as unknown as Item[]
  }

  // price_snapshots에서 product_id 기준 최신 단가 조회
  const productIds = [...new Set(items.map(i => i.product_id))]
  const priceMap: Record<string, number> = {}
  if (productIds.length > 0) {
    const { data: spRows } = await adminDb
      .from('supplier_products').select('id, product_id')
      .in('product_id', productIds).eq('status', 'active')
    if (spRows?.length) {
      const spIds = spRows.map(r => r.id)
      const spToProduct = Object.fromEntries(spRows.map(r => [r.id, r.product_id]))
      const { data: snaps } = await adminDb
        .from('price_snapshots').select('supplier_product_id, sale_price')
        .in('supplier_product_id', spIds)
        .lte('effective_from', batch.business_date ?? getKstToday())
        .order('effective_from', { ascending: false })
      for (const s of snaps ?? []) {
        const pid = spToProduct[s.supplier_product_id]
        if (pid && priceMap[pid] === undefined) priceMap[pid] = Number(s.sale_price)
      }
    }
  }

  const today = getKstToday()
  const statusLabel = STATUS_LABEL[batch.status] ?? batch.status
  const statusColor = STATUS_COLOR[batch.status] ?? 'bg-gray-100 text-gray-600'

  const panelItems = items.map(item => {
    const savedPrice = Number(item.unit_price_snapshot)
    const displayPrice = savedPrice > 0 ? savedPrice : (priceMap[item.product_id] ?? 0)
    return {
      id: item.id,
      product_name: (item.products as unknown as { standard_name: string }).standard_name,
      qty: Number(item.qty),
      unit: item.unit,
      unit_price_snapshot: displayPrice,
    }
  })

  return (
    <AdminOrderShell date={batch.business_date ?? today}>
      <div className="space-y-4 max-w-3xl">
        <div className="flex items-center gap-3">
          <Link href="/admin/orders" className="text-sm text-gray-400 hover:text-gray-600">← 목록</Link>
          <span className="text-sm font-bold text-gray-800 bg-gray-100 px-4 py-1.5 rounded-lg">{orgName}</span>
          <span className={`text-xs font-semibold px-3 py-1 rounded-full ${statusColor}`}>
            {statusLabel}
          </span>
        </div>

        <BatchConfirmPanel
          batchId={batchId}
          items={panelItems}
          currentStatus={batch.status}
        />
      </div>
    </AdminOrderShell>
  )
}
