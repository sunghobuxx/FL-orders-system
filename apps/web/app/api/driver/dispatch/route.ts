export const runtime = 'edge'

import { NextResponse } from 'next/server'

import {
  buildDispatchLines,
  buildLinesFromDispatchJob,
  getCurrentDispatchGroups,
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
  const { grouped, unmappedItems } = await getCurrentDispatchGroups(ctx.db, businessDate)
  const supplierIds = Object.keys(grouped)
  const groupedMap = grouped as Record<string, any[]>
  const allItems = Object.values(groupedMap).flat()
  const orderItemIds = allItems.map(i => i.id)

  const [dispatchJobsResult, supplierRowsResult, priceRowsResult] = await Promise.all([
    supplierIds.length
      ? ctx.db.from('dispatch_jobs').select('id, supplier_id, status').eq('business_date', businessDate).in('supplier_id', supplierIds)
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
    const lines = job
      ? await buildLinesFromDispatchJob(ctx.db, job.id)
      : buildDispatchLines(groupedMap[supplierId])

    return {
      supplierId,
      jobId: job?.id ?? null,
      supplierName: supplierNameMap.get(supplierId) ?? '-',
      status: job?.status ?? 'pending',
      sent: job?.status === 'sent',
      lines: lines.map(line => ({
        name: line.name,
        qty: line.qty,
        unit: line.unit,
        qtyText: `${fmtQty(line.qty)} ${line.unit}`,
        byRestaurantText: line.byRestaurant.length > 1
          ? line.byRestaurant.map(r => `${shortName(r.name)} ${fmtQty(r.qty)}${line.unit}`).join('  ')
          : '',
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
