export const runtime = 'edge'

import { NextResponse } from 'next/server'

import {
  buildDispatchLines,
  buildLinesFromDispatchJob,
  getCurrentDispatchGroups,
  getDispatchJobItemRows,
  groupEditableRows,
} from '@/lib/dispatch/current-items'
import { getKstToday } from '@/lib/date-kst'
import { requireDriverUser } from '@/lib/driver-api'

function fmtQty(qty: number) {
  return qty % 1 === 0 ? String(qty) : qty.toFixed(1)
}

function shortName(name: string) {
  const parts = name.trim().split(' ')
  return parts.length > 1 ? parts[parts.length - 1] : name
}

export async function GET(req: Request) {
  const ctx = await requireDriverUser(req)
  if ('error' in ctx) return ctx.error

  const url = new URL(req.url)
  const businessDate = url.searchParams.get('date') ?? getKstToday()
  const { allItems, grouped, inactiveGrouped, unmappedItems } = await getCurrentDispatchGroups(ctx.db, businessDate)
  const activeSupplierIds = Object.keys(grouped)
  const inactiveSupplierIds = Object.keys(inactiveGrouped)
  const supplierIds = [...activeSupplierIds, ...inactiveSupplierIds]
  const groupedMap = grouped as Record<string, any[]>
  const orderItemIds = allItems.map(i => i.id)

  const [dispatchJobsResult, supplierRowsResult, priceRowsResult] = await Promise.all([
    activeSupplierIds.length
      ? ctx.db.from('dispatch_jobs').select('id, supplier_id, status').eq('business_date', businessDate).in('supplier_id', activeSupplierIds)
      : Promise.resolve({ data: [] as { id: string; supplier_id: string; status: string }[] }),
    supplierIds.length
      ? ctx.db.from('suppliers').select('id, organizations(name)').in('id', supplierIds)
      : Promise.resolve({ data: [] }),
    orderItemIds.length
      ? ctx.db.from('order_items').select('id, unit_price_snapshot').in('id', orderItemIds)
      : Promise.resolve({ data: [] as { id: string; unit_price_snapshot: number }[] }),
  ])

  const jobBySupplier = new Map(
    (dispatchJobsResult.data ?? []).map((j: { id: string; supplier_id: string; status: string }) => [j.supplier_id, j]),
  )
  const supplierNameMap = new Map(
    (supplierRowsResult.data ?? []).map((s: any) => {
      const org = Array.isArray(s.organizations) ? s.organizations[0] : s.organizations
      return [s.id as string, org?.name ?? '알 수 없음'] as [string, string]
    }),
  )
  const priceMap = new Map(
    (priceRowsResult.data ?? []).map((r: { id: string; unit_price_snapshot: number }) => [r.id, Number(r.unit_price_snapshot ?? 0)]),
  )

  const productTotals = new Map<string, { name: string; qty: number; unit: string; amount: number }>()
  for (const item of allItems) {
    const name = item.products?.standard_name ?? '알 수 없음'
    const unitPrice = priceMap.get(item.id) ?? 0
    const lineAmount = Number(item.qty) * unitPrice
    const existing = productTotals.get(item.product_id)
    if (existing) {
      existing.qty += Number(item.qty)
      existing.amount += lineAmount
    } else {
      productTotals.set(item.product_id, { name, qty: Number(item.qty), unit: item.unit, amount: lineAmount })
    }
  }

  const totals = [...productTotals.values()]
    .sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name, 'ko'))
    .map(item => ({ ...item, qtyText: `${fmtQty(item.qty)} ${item.unit}` }))

  const suppliers = await Promise.all(supplierIds.map(async supplierId => {
    const job = jobBySupplier.get(supplierId)
    const inactive = inactiveSupplierIds.includes(supplierId)
    const currentItems = inactive ? inactiveGrouped[supplierId] : groupedMap[supplierId]
    const lines = job && !inactive
      ? await buildLinesFromDispatchJob(ctx.db, job.id)
      : buildDispatchLines(currentItems)
    const editableGroups = job && !inactive
      ? groupEditableRows(await getDispatchJobItemRows(ctx.db, job.id))
      : []
    const rowsByLine = new Map(
      editableGroups.map(group => [`${group.name}:${group.unit}`, group.rows]),
    )

    return {
      supplierId,
      jobId: job?.id ?? null,
      supplierName: supplierNameMap.get(supplierId) ?? '-',
      status: inactive ? 'inactive' : (job?.status ?? 'pending'),
      sent: !inactive && job?.status === 'sent',
      autoDispatchExcluded: inactive,
      lines: lines.map(line => ({
        name: line.name,
        qty: line.qty,
        unit: line.unit,
        qtyText: `${fmtQty(line.qty)} ${line.unit}`,
        byRestaurantText: line.byRestaurant.length > 1
          ? line.byRestaurant.map(r => `${shortName(r.name)} ${fmtQty(r.qty)}${line.unit}`).join('  ')
          : '',
        rows: (rowsByLine.get(`${line.name}:${line.unit}`) ?? []).map(row => ({
          orderItemId: row.orderItemId,
          restaurantName: row.restaurantName,
          qty: row.excluded ? 0 : row.qty,
          unit: row.unit,
          checkStage: row.checkStage,
        })),
      })),
    }
  }))

  return NextResponse.json({
    businessDate,
    totals,
    totalAmount: totals.reduce((s, p) => s + p.amount, 0),
    suppliers,
    unmappedItems: (unmappedItems ?? []).map(item => ({ ...item, qtyText: `${fmtQty(item.qty)} ${item.unit}` })),
  })
}

const RANK: Record<string, number> = {
  open: 0, submitted: 1, validated: 2, ordered: 3, dispatched: 4, completed: 5,
}

export async function POST(req: Request) {
  const ctx = await requireDriverUser(req)
  if ('error' in ctx) return ctx.error

  const body = await req.json().catch(() => ({})) as {
    itemId?: string
    supplierId?: string
    businessDate?: string
    stage?: number
  }
  const { itemId, supplierId, businessDate } = body
  const stage = Number(body.stage)
  if (!itemId || !supplierId || !businessDate) {
    return NextResponse.json({ error: '필수 값이 없습니다.' }, { status: 400 })
  }
  if (![0, 1].includes(stage)) {
    return NextResponse.json({ error: '상차 확인 단계가 올바르지 않습니다.' }, { status: 400 })
  }

  // 공급처별 발주 화면에 실제 포함된 품목만 변경한다. 클라이언트가 임의의
  // order_item id를 보내 다른 날짜·공급처 발주를 바꾸지 못하게 한다.
  const { data: dispatchRow, error: dispatchError } = await ctx.db
    .from('dispatch_job_items')
    .select('order_item_id, dispatch_jobs!inner(supplier_id, business_date)')
    .eq('order_item_id', itemId)
    .eq('dispatch_jobs.supplier_id', supplierId)
    .eq('dispatch_jobs.business_date', businessDate)
    .maybeSingle()
  if (dispatchError) return NextResponse.json({ error: dispatchError.message }, { status: 500 })
  if (!dispatchRow) return NextResponse.json({ error: '해당 공급처 발주 품목을 찾을 수 없습니다.' }, { status: 404 })

  const { data: touched, error: updateError } = await ctx.db
    .from('order_items')
    .update({ check_stage: stage })
    .eq('id', itemId)
    .select('id, order_id')
    .single()
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

  const { data: order } = await ctx.db
    .from('orders').select('batch_id').eq('id', touched.order_id).maybeSingle()
  if (!order?.batch_id) return NextResponse.json({ error: '발주를 찾을 수 없습니다.' }, { status: 404 })

  const { data: orders } = await ctx.db.from('orders').select('id').eq('batch_id', order.batch_id)
  const orderIds = (orders ?? []).map((row: { id: string }) => row.id)
  const { data: allItems } = await ctx.db
    .from('order_items').select('check_stage').in('order_id', orderIds)
  const stages = (allItems ?? []).map((item: { check_stage: number | null }) => Number(item.check_stage ?? 0))

  const { data: batch } = await ctx.db
    .from('order_batches').select('status').eq('id', order.batch_id).maybeSingle()
  let batchStatus = batch?.status ?? ''
  if (stages.length > 0 && stages.every(value => value >= 1) && (RANK[batchStatus] ?? 0) < RANK.ordered) {
    const { error } = await ctx.db.from('order_batches').update({ status: 'ordered' }).eq('id', order.batch_id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    batchStatus = 'ordered'
  }

  return NextResponse.json({ success: true, batchId: order.batch_id, batchStatus })
}
