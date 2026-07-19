export const runtime = 'edge'

import { NextResponse } from 'next/server'

import { getKstToday } from '@/lib/date-kst'
import { requireBatchAccess, requireDriverUser } from '@/lib/driver-api'

interface Props {
  params: Promise<{ batchId: string }>
}

const STATUS_LABEL: Record<string, string> = {
  open: '작성 중',
  submitted: '당일발주',
  validated: '알림톡 발송',
  ordered: '상차',
  dispatched: '배송완료',
  completed: '완료',
}

export async function GET(req: Request, { params }: Props) {
  const ctx = await requireDriverUser(req)
  if ('error' in ctx) return ctx.error

  const { batchId } = await params
  const access = await requireBatchAccess(ctx, batchId)
  if ('error' in access) return access.error

  const { data: batch } = await ctx.db
    .from('order_batches')
    .select('id, status, business_date, submitted_at, restaurants(organizations(name))')
    .eq('id', batchId)
    .single()

  const { data: order } = await ctx.db
    .from('orders')
    .select('id')
    .eq('batch_id', batchId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  let items: any[] = []
  if (order) {
    const { data } = await ctx.db
      .from('order_items')
      .select('id, product_id, qty, unit, unit_price_snapshot, products(standard_name)')
      .eq('order_id', order.id)
    items = data ?? []
  }

  const productIds = [...new Set(items.map(i => i.product_id))]
  const priceMap: Record<string, number> = {}
  if (productIds.length > 0) {
    const { data: spRows } = await ctx.db
      .from('supplier_products').select('id, product_id')
      .in('product_id', productIds).eq('status', 'active')
    if (spRows?.length) {
      const spIds = spRows.map((r: any) => r.id)
      const spToProduct = Object.fromEntries(spRows.map((r: any) => [r.id, r.product_id]))
      const { data: snaps } = await ctx.db
        .from('price_snapshots').select('supplier_product_id, sale_price')
        .in('supplier_product_id', spIds)
        .lte('effective_from', batch?.business_date ?? getKstToday())
        .order('effective_from', { ascending: false })
      for (const s of snaps ?? []) {
        const pid = spToProduct[s.supplier_product_id]
        if (pid && priceMap[pid] === undefined) priceMap[pid] = Number(s.sale_price)
      }
    }
  }

  const restRaw = batch?.restaurants as unknown as { organizations: { name: string } | null } | null
  return NextResponse.json({
    batch: {
      id: batch?.id,
      status: batch?.status,
      statusLabel: STATUS_LABEL[batch?.status ?? ''] ?? batch?.status,
      businessDate: batch?.business_date,
      restaurantName: restRaw?.organizations?.name ?? '알 수 없음',
      submittedAt: batch?.submitted_at,
    },
    items: items.map(item => {
      const product = Array.isArray(item.products) ? item.products[0] : item.products
      const savedPrice = Number(item.unit_price_snapshot)
      return {
        id: item.id,
        productId: item.product_id,
        productName: product?.standard_name ?? '품목',
        qty: Number(item.qty),
        unit: item.unit,
        unitPrice: savedPrice > 0 ? savedPrice : (priceMap[item.product_id] ?? 0),
      }
    }),
  })
}

export async function PATCH(req: Request, { params }: Props) {
  const ctx = await requireDriverUser(req)
  if ('error' in ctx) return ctx.error

  const { batchId } = await params
  const access = await requireBatchAccess(ctx, batchId)
  if ('error' in access) return access.error

  const { businessDate } = await req.json().catch(() => ({})) as { businessDate?: string }
  if (!businessDate || !/^\d{4}-\d{2}-\d{2}$/.test(businessDate)) {
    return NextResponse.json({ error: '올바른 날짜 형식이 아닙니다.' }, { status: 400 })
  }

  const { error } = await ctx.db
    .from('order_batches')
    .update({ business_date: businessDate })
    .eq('id', batchId)

  if (error) return NextResponse.json({ error: '날짜 변경 실패' }, { status: 500 })
  return NextResponse.json({ success: true })
}

export async function DELETE(req: Request, { params }: Props) {
  const ctx = await requireDriverUser(req)
  if ('error' in ctx) return ctx.error

  const { batchId } = await params
  const access = await requireBatchAccess(ctx, batchId)
  if ('error' in access) return access.error

  const { data: orders } = await ctx.db.from('orders').select('id').eq('batch_id', batchId)
  const orderIds = (orders ?? []).map((o: { id: string }) => o.id)

  if (orderIds.length > 0) {
    const { data: items } = await ctx.db.from('order_items').select('id').in('order_id', orderIds)
    const itemIds = (items ?? []).map((i: { id: string }) => i.id)
    if (itemIds.length > 0) {
      await ctx.db.from('dispatch_job_items').delete().in('order_item_id', itemIds)
      await ctx.db.from('daily_spec_lines').update({ order_item_id: null }).in('order_item_id', itemIds)
    }
    await ctx.db.from('order_items').delete().in('order_id', orderIds)
    await ctx.db.from('orders').delete().in('batch_id', [batchId])
  }

  const { error } = await ctx.db.from('order_batches').delete().eq('id', batchId)
  if (error) return NextResponse.json({ error: '발주 삭제 실패' }, { status: 500 })

  return NextResponse.json({ success: true })
}
