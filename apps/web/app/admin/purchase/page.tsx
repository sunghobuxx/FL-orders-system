export const runtime = 'edge'

import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/admin'
import AdminSettlementShell from '@/app/admin/settlement/AdminSettlementShell'
import { getKstToday } from '@/lib/date-kst'

interface Props {
  searchParams: Promise<{ from?: string; to?: string; view?: string }>
}

export default async function AdminPurchasePage({ searchParams }: Props) {
  const { from: fromParam, to: toParam, view: viewParam } = await searchParams
  const view = viewParam === 'product' ? 'product' : 'supplier'

  const today = getKstToday()
  const currentMonth = today.slice(0, 7)
  const from = fromParam ?? `${currentMonth}-01`
  const to = toParam ?? today

  const db = createAdminClient()

  // Get order_batches in date range
  const { data: batches } = await db
    .from('order_batches')
    .select('id')
    .gte('business_date', from)
    .lte('business_date', to)
    .in('status', ['submitted', 'validated', 'ordered', 'dispatched', 'completed'])

  const batchIds = (batches ?? []).map(b => b.id)
  let orderItems: {
    product_id: string
    qty: number
    unit: string
    unit_price_snapshot: number
    products: { standard_name: string; is_fixed_price: boolean } | null
  }[] = []

  if (batchIds.length > 0) {
    const { data } = await db
      .from('order_items')
      .select('product_id, qty, unit, unit_price_snapshot, products(standard_name, is_fixed_price), orders!inner(batch_id)')
      .in('orders.batch_id', batchIds)
    orderItems = (data ?? []) as unknown as typeof orderItems
  }

  // Map product_id → supplier_id (latest active)
  const productIds = [...new Set(orderItems.map(i => i.product_id))]
  const productToSupplier = new Map<string, string>()
  if (productIds.length > 0) {
    const { data: spRows } = await db
      .from('supplier_products')
      .select('product_id, supplier_id, updated_at')
      .in('product_id', productIds)
      .eq('status', 'active')
      .order('updated_at', { ascending: false })
    for (const sp of spRows ?? []) {
      if (!productToSupplier.has(sp.product_id)) {
        productToSupplier.set(sp.product_id, sp.supplier_id)
      }
    }
  }

  // Aggregate by supplier
  const bySupplier = new Map<string, { supplierId: string; supplierName: string; totalAmount: number; fixedAmount: number; variableAmount: number }>()
  for (const item of orderItems) {
    const prod = item.products
    if (!prod) continue
    const supplierId = productToSupplier.get(item.product_id)
    if (!supplierId) continue
    const amount = Number(item.qty) * Number(item.unit_price_snapshot)
    if (!bySupplier.has(supplierId)) {
      bySupplier.set(supplierId, { supplierId, supplierName: '', totalAmount: 0, fixedAmount: 0, variableAmount: 0 })
    }
    const entry = bySupplier.get(supplierId)
    if (!entry) continue
    entry.totalAmount += amount
    if (prod.is_fixed_price) entry.fixedAmount += amount
    else entry.variableAmount += amount
  }

  // Fetch supplier names
  const supplierIds = [...bySupplier.keys()]
  if (supplierIds.length > 0) {
    const { data: suppliers } = await db
      .from('suppliers')
      .select('id, organizations(name)')
      .in('id', supplierIds)
    for (const s of suppliers ?? []) {
      const entry = bySupplier.get(s.id)
      if (entry) entry.supplierName = (s.organizations as unknown as { name: string } | null)?.name ?? '-'
    }
  }
  const supplierList = [...bySupplier.values()].sort((a, b) => b.totalAmount - a.totalAmount)

  // Aggregate by product
  const byProduct = new Map<string, { productId: string; productName: string; unit: string; totalQty: number; totalAmount: number }>()
  for (const item of orderItems) {
    const prod = item.products
    if (!prod) continue
    const amount = Number(item.qty) * Number(item.unit_price_snapshot)
    if (!byProduct.has(item.product_id)) {
      byProduct.set(item.product_id, { productId: item.product_id, productName: prod.standard_name, unit: item.unit, totalQty: 0, totalAmount: 0 })
    }
    const entry = byProduct.get(item.product_id)
    if (!entry) continue
    entry.totalQty += Number(item.qty)
    entry.totalAmount += amount
  }
  const productList = [...byProduct.values()].sort((a, b) => b.totalAmount - a.totalAmount)

  const grandTotal = view === 'supplier'
    ? supplierList.reduce((s, r) => s + r.totalAmount, 0)
    : productList.reduce((s, r) => s + r.totalAmount, 0)

  const fmt = (n: number) => `${Math.round(n).toLocaleString()}원`
  const baseUrl = `/admin/purchase?from=${from}&to=${to}`

  return (
    <AdminSettlementShell>
      <div className="space-y-4 max-w-3xl">
        {/* Date range selector */}
        <div className="bg-white rounded-xl border border-gray-200 px-5 py-4">
          <form className="flex items-center gap-3 flex-wrap">
            <input type="hidden" name="view" value={view} />
            <span className="text-sm text-gray-500 shrink-0">기간:</span>
            <input
              type="date"
              name="from"
              defaultValue={from}
              className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            <span className="text-sm text-gray-400">~</span>
            <input
              type="date"
              name="to"
              defaultValue={to}
              max={today}
              className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            <button
              type="submit"
              className="rounded-lg bg-brand-600 text-white px-4 py-1.5 text-sm font-semibold hover:bg-brand-700"
            >
              조회
            </button>
            <div className="flex gap-1 ml-auto">
              <Link
                href={`${baseUrl}&view=${view}`}
                className="text-xs px-2.5 py-1 rounded border border-gray-300 text-gray-600 hover:bg-gray-50"
              >
                이번달
              </Link>
            </div>
          </form>
        </div>

        {/* View tabs */}
        <div className="flex gap-1 text-xs">
          <Link
            href={`${baseUrl}&view=supplier`}
            className={`px-4 py-2 rounded-lg border font-semibold transition-colors ${
              view === 'supplier' ? 'bg-gray-800 text-white border-gray-800' : 'text-gray-600 border-gray-300 hover:bg-gray-50'
            }`}
          >
            업체별
          </Link>
          <Link
            href={`${baseUrl}&view=product`}
            className={`px-4 py-2 rounded-lg border font-semibold transition-colors ${
              view === 'product' ? 'bg-gray-800 text-white border-gray-800' : 'text-gray-600 border-gray-300 hover:bg-gray-50'
            }`}
          >
            품목별
          </Link>
        </div>

        {/* Total banner */}
        {grandTotal > 0 && (
          <div className="flex items-center justify-between bg-gray-900 text-white rounded-xl px-5 py-3">
            <span className="text-sm font-semibold">{from} ~ {to}</span>
            <span className="text-lg font-bold">{fmt(grandTotal)}</span>
          </div>
        )}

        {/* Supplier view */}
        {view === 'supplier' && (
          supplierList.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 py-14 text-center text-sm text-gray-400">
              해당 기간 매입 내역이 없습니다
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="grid grid-cols-[2fr_1fr_1fr_1fr] gap-3 px-5 py-3 bg-gray-50 border-b text-xs font-semibold text-gray-500">
                <span>공급처</span>
                <span className="text-right">고정단가</span>
                <span className="text-right">변동단가</span>
                <span className="text-right">합계</span>
              </div>
              <div className="divide-y divide-gray-100">
                {supplierList.map(r => (
                  <Link
                    key={r.supplierId}
                    href={`/admin/purchase/supplier/${r.supplierId}?from=${from}&to=${to}`}
                    className="grid grid-cols-[2fr_1fr_1fr_1fr] gap-3 items-center px-5 py-3 hover:bg-gray-50 transition-colors"
                  >
                    <span className="text-sm font-semibold text-brand-600 bg-gray-100 px-3 py-1.5 rounded">
                      {r.supplierName}
                    </span>
                    <span className="text-sm text-right text-gray-600 bg-gray-50 px-2 py-1.5 rounded">
                      {r.fixedAmount > 0 ? fmt(r.fixedAmount) : '-'}
                    </span>
                    <span className="text-sm text-right text-gray-600 bg-gray-50 px-2 py-1.5 rounded">
                      {r.variableAmount > 0 ? fmt(r.variableAmount) : '-'}
                    </span>
                    <span className="text-sm text-right font-bold text-gray-900 bg-gray-100 px-3 py-1.5 rounded">
                      {fmt(r.totalAmount)}
                    </span>
                  </Link>
                ))}
              </div>
              <div className="grid grid-cols-[2fr_1fr_1fr_1fr] gap-3 px-5 py-3 bg-gray-50 border-t text-xs font-semibold">
                <span className="text-gray-600">합계</span>
                <span className="text-right text-gray-600">
                  {fmt(supplierList.reduce((s, r) => s + r.fixedAmount, 0))}
                </span>
                <span className="text-right text-gray-600">
                  {fmt(supplierList.reduce((s, r) => s + r.variableAmount, 0))}
                </span>
                <span className="text-right text-gray-900 font-bold">{fmt(grandTotal)}</span>
              </div>
            </div>
          )
        )}

        {/* Product view */}
        {view === 'product' && (
          productList.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 py-14 text-center text-sm text-gray-400">
              해당 기간 매입 품목이 없습니다
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="grid grid-cols-[2fr_1fr_1fr] gap-3 px-5 py-3 bg-gray-50 border-b text-xs font-semibold text-gray-500">
                <span>품목</span>
                <span className="text-center">총수량</span>
                <span className="text-right">금액</span>
              </div>
              <div className="divide-y divide-gray-100">
                {productList.map(r => (
                  <div key={r.productId} className="grid grid-cols-[2fr_1fr_1fr] gap-3 items-center px-5 py-3">
                    <span className="text-sm text-gray-800 bg-gray-100 px-3 py-1.5 rounded">{r.productName}</span>
                    <span className="text-sm text-center text-gray-700 bg-gray-100 px-2 py-1.5 rounded">
                      {r.totalQty % 1 === 0 ? r.totalQty : r.totalQty.toFixed(1)} {r.unit}
                    </span>
                    <span className="text-sm text-right font-semibold text-gray-900 bg-gray-100 px-3 py-1.5 rounded">
                      {fmt(r.totalAmount)}
                    </span>
                  </div>
                ))}
              </div>
              <div className="flex justify-between items-center px-5 py-3 bg-gray-50 border-t text-xs font-semibold">
                <span className="text-gray-600">합계</span>
                <span className="text-gray-900 font-bold">{fmt(grandTotal)}</span>
              </div>
            </div>
          )
        )}
      </div>
    </AdminSettlementShell>
  )
}
