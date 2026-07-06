export const runtime = 'edge'

import { createAdminClient } from '@/lib/supabase/admin'
import {
  getCurrentDispatchGroups,
  buildDispatchLines,
  buildLinesFromDispatchJob,
  formatDispatchLine,
  type DispatchOrderItem,
} from '@/lib/dispatch/current-items'
import AdminOrderShell from '../../AdminOrderShell'
import DispatchSendButton from '../../DispatchSendButton'
import DispatchValidateButton from './DispatchValidateButton'

interface Props {
  params: Promise<{ date: string }>
}

export default async function DispatchDatePage({ params }: Props) {
  const { date: targetDate } = await params
  const adminDb = createAdminClient()

  const { grouped, unmappedProducts } = await getCurrentDispatchGroups(adminDb, targetDate)

  const supplierIds = Object.keys(grouped)

  const { data: dispatchJobs } = supplierIds.length
    ? await adminDb
        .from('dispatch_jobs')
        .select('id, supplier_id, status')
        .eq('business_date', targetDate)
        .in('supplier_id', supplierIds)
    : { data: [] as { id: string; supplier_id: string; status: string }[] }

  const jobBySupplier = new Map(
    (dispatchJobs ?? []).map((j: { id: string; supplier_id: string; status: string }) => [j.supplier_id, j])
  )

  const { data: supplierRows } = supplierIds.length
    ? await adminDb.from('suppliers').select('id, organizations(name)').in('id', supplierIds)
    : { data: [] }

  const supplierNameMap = new Map(
    (supplierRows ?? []).map((s) => {
      const org = (s.organizations as unknown as { name: string } | null)
      return [s.id as string, org?.name ?? '알 수 없음'] as [string, string]
    })
  )

  const groupedMap = grouped as Record<string, DispatchOrderItem[]>
  const allItems = Object.values(groupedMap).flat()

  // order_items에서 unit_price_snapshot 조회 (금액 계산용)
  const orderItemIds = allItems.map(i => i.id)
  const { data: priceRows } = orderItemIds.length
    ? await adminDb
        .from('order_items')
        .select('id, unit_price_snapshot')
        .in('id', orderItemIds)
    : { data: [] as { id: string; unit_price_snapshot: number }[] }

  const priceMap = new Map(
    (priceRows ?? []).map((r: { id: string; unit_price_snapshot: number }) => [r.id, Number(r.unit_price_snapshot ?? 0)])
  )

  // 당일 발주 집계: 품목별 합계 + 금액
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
  const totalsSorted = [...productTotals.values()].sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name, 'ko'))
  const grandTotal = totalsSorted.reduce((s, p) => s + p.amount, 0)

  const hasDispatchJobs = (dispatchJobs ?? []).length > 0

  const supplierLines: Record<string, string[]> = {}
  for (const supplierId of supplierIds) {
    const job = jobBySupplier.get(supplierId)
    if (job) {
      const lines = await buildLinesFromDispatchJob(adminDb, job.id)
      supplierLines[supplierId] = lines.map(l => formatDispatchLine(l))
    } else {
      const lines = buildDispatchLines(groupedMap[supplierId])
      supplierLines[supplierId] = lines.map(l => formatDispatchLine(l))
    }
  }

  return (
    <AdminOrderShell date={targetDate}>
      <div className="space-y-5 max-w-3xl">
        {supplierIds.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 py-14 text-center text-sm text-gray-400">
            {targetDate} 발주 내역이 없습니다
          </div>
        ) : (
          <>
            {/* 당일 발주 집계 (전체 내역) */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">당일 발주 집계 — {targetDate}</h2>
                <div className="flex items-center gap-3">
                  {grandTotal > 0 && (
                    <span className="text-sm font-bold text-gray-700">총 {grandTotal.toLocaleString('ko-KR')}원</span>
                  )}
                  {!hasDispatchJobs && (
                    <DispatchValidateButton businessDate={targetDate} />
                  )}
                </div>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="divide-y divide-gray-100">
                  {totalsSorted.map(p => (
                    <div key={p.name} className="flex items-center px-5 py-2.5 gap-3">
                      <span className="flex-1 text-sm text-gray-800">{p.name}</span>
                      <span className="text-sm font-semibold text-brand-700 bg-brand-50 px-3 py-1 rounded min-w-[72px] text-center">
                        {p.qty % 1 === 0 ? p.qty : p.qty.toFixed(1)} {p.unit}
                      </span>
                      {p.amount > 0 && (
                        <span className="text-sm text-gray-500 text-right min-w-[80px]">
                          {p.amount.toLocaleString('ko-KR')}원
                        </span>
                      )}
                    </div>
                  ))}
                </div>
                <div className="px-5 py-2 bg-gray-50 border-t border-gray-100 text-xs text-gray-400">
                  총 {totalsSorted.length}종 품목 · 새벽 2:30 자동 발주
                </div>
              </div>
            </div>

            {/* 공급처별 발주 */}
            <div>
              <h2 className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">공급처별 발주 내역</h2>
              <div className="space-y-2">
                {supplierIds.map(supplierId => {
                  const job = jobBySupplier.get(supplierId)
                  const sent = job?.status === 'sent'
                  const lines = supplierLines[supplierId] ?? []
                  return (
                    <div key={supplierId} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                      <div className="flex items-center justify-between px-5 py-3 bg-gray-50 border-b border-gray-100">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-gray-800">
                            {supplierNameMap.get(supplierId) ?? '-'}
                          </span>
                          {sent ? (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">전송완료</span>
                          ) : (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700 font-medium">발송대기</span>
                          )}
                        </div>
                        {!sent && (
                          <DispatchSendButton supplierId={supplierId} businessDate={targetDate} />
                        )}
                      </div>
                      <div className="px-5 py-3 space-y-1">
                        {lines.map((line) => (
                          <div key={line} className="text-sm text-gray-700">{line}</div>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </>
        )}

        {/* 공급처 미매핑 품목 */}
        {unmappedProducts && unmappedProducts.length > 0 && (
          <div className="bg-yellow-50 rounded-xl border border-yellow-200 px-5 py-3">
            <p className="text-xs font-semibold text-yellow-700 mb-1">⚠ 공급처 미매핑 품목</p>
            <p className="text-xs text-yellow-600">{unmappedProducts.join(', ')}</p>
          </div>
        )}
      </div>
    </AdminOrderShell>
  )
}
