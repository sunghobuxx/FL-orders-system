export const runtime = 'edge'

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { getKstToday } from '@/lib/date-kst'

interface Props {
  params: Promise<{ supplierId: string }>
  searchParams: Promise<{ from?: string; to?: string }>
}

const fmt = (n: number) => `${n.toLocaleString('ko-KR')}원`

export default async function AdminPurchaseSupplierPage({ params, searchParams }: Props) {
  const { supplierId } = await params
  const { from: fromParam, to: toParam } = await searchParams

  const db = createAdminClient()

  const { data: supplier } = await db
    .from('suppliers')
    .select('id, organizations(name)')
    .eq('id', supplierId)
    .single()

  if (!supplier) notFound()

  const orgRaw = supplier.organizations as unknown as { name: string } | null
  const supplierName = orgRaw?.name ?? '알 수 없음'

  const today = getKstToday()
  const monthStart = `${today.slice(0, 7)}-01`
  const from = fromParam ?? monthStart
  const to = toParam ?? today

  // 1. Get supplier's product IDs
  const { data: spRows } = await db
    .from('supplier_products')
    .select('product_id')
    .eq('supplier_id', supplierId)
    .eq('status', 'active')

  const supplierProductIds = (spRows ?? []).map((r: { product_id: string }) => r.product_id)

  // 2. Get order batches in date range
  const { data: batches } = await db
    .from('order_batches')
    .select('id, business_date')
    .gte('business_date', from)
    .lte('business_date', to)
    .in('status', ['submitted', 'validated', 'ordered', 'dispatched', 'completed'])

  type BatchRow = { id: string; business_date: string }
  const batchRows = (batches ?? []) as unknown as BatchRow[]
  const batchIds = batchRows.map(b => b.id)
  const batchDateMap: Record<string, string> = {}
  for (const b of batchRows) batchDateMap[b.id] = b.business_date

  // 3. Get order items for this supplier's products in those batches
  type OrderItemRow = {
    product_id: string
    qty: number
    unit: string
    unit_price_snapshot: number | null
    products: { standard_name: string; is_fixed_price: boolean | null } | null
    orders: { batch_id: string }
  }

  let orderItems: OrderItemRow[] = []
  if (batchIds.length > 0 && supplierProductIds.length > 0) {
    const { data: items } = await db
      .from('order_items')
      .select('product_id, qty, unit, unit_price_snapshot, products(standard_name, is_fixed_price), orders!inner(batch_id)')
      .in('orders.batch_id', batchIds)
      .in('product_id', supplierProductIds)
    orderItems = (items ?? []) as unknown as OrderItemRow[]
  }

  // 4. Aggregate by product
  type DateEntry = { date: string; qty: number; unit: string; unitPrice: number; amount: number }
  type ProductAgg = {
    productId: string
    name: string
    unit: string
    isFixed: boolean
    totalQty: number
    totalAmount: number
    latestPrice: number
    byDate: DateEntry[]
  }

  const aggMap = new Map<string, ProductAgg>()
  for (const item of orderItems) {
    const pid = item.product_id
    const unitPrice = Number(item.unit_price_snapshot ?? 0)
    const qty = Number(item.qty)
    const amount = qty * unitPrice
    const date = batchDateMap[item.orders.batch_id] ?? ''
    if (!aggMap.has(pid)) {
      aggMap.set(pid, {
        productId: pid,
        name: item.products?.standard_name ?? '알 수 없음',
        unit: item.unit,
        isFixed: item.products?.is_fixed_price !== false,
        totalQty: 0,
        totalAmount: 0,
        latestPrice: unitPrice,
        byDate: [],
      })
    }
    const agg = aggMap.get(pid)
    if (!agg) continue
    agg.totalQty += qty
    agg.totalAmount += amount
    agg.byDate.push({ date, qty, unit: item.unit, unitPrice, amount })
  }

  for (const agg of aggMap.values()) {
    agg.byDate.sort((a, b) => b.date.localeCompare(a.date))
    if (agg.byDate.length > 0) agg.latestPrice = agg.byDate[0].unitPrice
  }

  const allProducts = [...aggMap.values()]
  const fixedProducts = allProducts.filter(p => p.isFixed)
  const variableProducts = allProducts.filter(p => !p.isFixed)
  const totalAmount = allProducts.reduce((s, p) => s + p.totalAmount, 0)
  const fixedTotal = fixedProducts.reduce((s, p) => s + p.totalAmount, 0)
  const variableTotal = variableProducts.reduce((s, p) => s + p.totalAmount, 0)

  return (
    <div className="p-4 max-w-2xl space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <Link href={`/admin/purchase?from=${from}&to=${to}`} className="text-sm text-gray-400 hover:text-gray-700">← 목록</Link>
        <span className="bg-gray-100 text-gray-800 px-3 py-1 rounded-full text-sm font-semibold">{supplierName}</span>
        <span className="text-sm text-gray-500">{from} ~ {to}</span>
        <span className="ml-auto text-sm font-bold text-gray-900">총 {fmt(totalAmount)}</span>
      </div>

      {allProducts.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 py-14 text-center text-sm text-gray-400">
          이 달에 발주 내역이 없습니다
        </div>
      ) : (
        <>
          {fixedProducts.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-5 py-3 bg-blue-50 border-b border-blue-100">
                <p className="text-sm font-semibold text-blue-800">고정단가 품목</p>
                <p className="text-xs text-blue-500 mt-0.5">등록된 단가 기준</p>
              </div>
              <div className="grid grid-cols-[2fr_1fr_1fr_1fr] px-5 py-2 bg-gray-50 border-b border-gray-100 text-xs font-semibold text-gray-500">
                <span>품목</span>
                <span className="text-right">단가</span>
                <span className="text-right">총수량</span>
                <span className="text-right">금액</span>
              </div>
              {fixedProducts.map(p => (
                <div key={p.productId} className="grid grid-cols-[2fr_1fr_1fr_1fr] px-5 py-2.5 border-b border-gray-50 text-sm">
                  <span className="font-medium text-gray-800">{p.name}</span>
                  <span className="text-right text-gray-600">{fmt(p.latestPrice)}/{p.unit}</span>
                  <span className="text-right text-gray-600">{p.totalQty}{p.unit}</span>
                  <span className="text-right font-semibold text-gray-900">{fmt(p.totalAmount)}</span>
                </div>
              ))}
              <div className="flex justify-between px-5 py-2 bg-gray-50 border-t text-xs font-semibold text-gray-600">
                <span>소계</span>
                <span>{fmt(fixedTotal)}</span>
              </div>
            </div>
          )}

          {variableProducts.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-5 py-3 bg-orange-50 border-b border-orange-100">
                <p className="text-sm font-semibold text-orange-800">변동단가 품목</p>
                <p className="text-xs text-orange-400 mt-0.5">날짜별 단가 기록</p>
              </div>
              {variableProducts.map((p, pi) => (
                <div key={p.productId} className={pi > 0 ? 'border-t border-gray-100' : ''}>
                  <div className="px-5 py-2 bg-gray-50 text-xs font-semibold text-gray-600">{p.name}</div>
                  <div className="grid grid-cols-[1fr_1fr_1fr_1fr] px-5 py-1.5 text-xs text-gray-400 border-b border-gray-100">
                    <span>날짜</span>
                    <span className="text-right">단가</span>
                    <span className="text-right">수량</span>
                    <span className="text-right">금액</span>
                  </div>
                  {p.byDate.map(d => (
                    <div key={`${p.productId}-${d.date}`} className="grid grid-cols-[1fr_1fr_1fr_1fr] px-5 py-2 border-b border-gray-50 text-sm">
                      <span className="text-gray-500">{d.date}</span>
                      <span className="text-right text-gray-600">{fmt(d.unitPrice)}</span>
                      <span className="text-right text-gray-600">{d.qty}{d.unit}</span>
                      <span className="text-right font-medium text-gray-900">{fmt(d.amount)}</span>
                    </div>
                  ))}
                </div>
              ))}
              <div className="flex justify-between px-5 py-2 bg-gray-50 border-t text-xs font-semibold text-gray-600">
                <span>소계</span>
                <span>{fmt(variableTotal)}</span>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between bg-gray-900 text-white rounded-xl px-5 py-3">
            <span className="text-sm font-semibold">총 매입금액</span>
            <span className="text-base font-bold">{fmt(totalAmount)}</span>
          </div>
        </>
      )}
    </div>
  )
}
