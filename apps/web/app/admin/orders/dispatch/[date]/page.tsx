export const runtime = 'edge'

import { createAdminClient } from '@/lib/supabase/admin'
import {
  getCurrentDispatchGroups,
  buildDispatchLines,
  buildLinesFromDispatchJob,
  type DispatchOrderItem,
} from '@/lib/dispatch/current-items'
import AdminOrderShell from '../../AdminOrderShell'
import DispatchSendButton from '../../DispatchSendButton'
import DispatchValidateButton from './DispatchValidateButton'

interface Props {
  params: Promise<{ date: string }>
}

function fmtQty(qty: number) {
  return qty % 1 === 0 ? String(qty) : qty.toFixed(1)
}

function shortName(name: string) {
  const parts = name.trim().split(' ')
  return parts.length > 1 ? parts[parts.length - 1] : name
}

export default async function DispatchDatePage({ params }: Props) {
  const { date: targetDate } = await params
  const adminDb = createAdminClient()

  const { grouped, unmappedItems } = await getCurrentDispatchGroups(adminDb, targetDate)
  const supplierIds = Object.keys(grouped)
  const groupedMap = grouped as Record<string, DispatchOrderItem[]>
  const allItems = Object.values(groupedMap).flat()
  const orderItemIds = allItems.map(i => i.id)

  // dispatch_jobs, suppliers, order_items 단가 병렬 조회
  const [dispatchJobsResult, supplierRowsResult, priceRowsResult] = await Promise.all([
    supplierIds.length
      ? adminDb.from('dispatch_jobs').select('id, supplier_id, status').eq('business_date', targetDate).in('supplier_id', supplierIds)
      : Promise.resolve({ data: [] as { id: string; supplier_id: string; status: string }[] }),
    supplierIds.length
      ? adminDb.from('suppliers').select('id, organizations(name)').in('id', supplierIds)
      : Promise.resolve({ data: [] }),
    orderItemIds.length
      ? adminDb.from('order_items').select('id, unit_price_snapshot').in('id', orderItemIds)
      : Promise.resolve({ data: [] as { id: string; unit_price_snapshot: number }[] }),
  ])

  const dispatchJobs = dispatchJobsResult.data
  const supplierRows = supplierRowsResult.data
  const priceRows = priceRowsResult.data

  const jobBySupplier = new Map(
    (dispatchJobs ?? []).map((j: { id: string; supplier_id: string; status: string }) => [j.supplier_id, j])
  )

  const supplierNameMap = new Map(
    (supplierRows ?? []).map((s) => {
      const org = (s.organizations as unknown as { name: string } | null)
      return [s.id as string, org?.name ?? '알 수 없음'] as [string, string]
    })
  )

  const priceMap = new Map(
    (priceRows ?? []).map((r: { id: string; unit_price_snapshot: number }) => [r.id, Number(r.unit_price_snapshot ?? 0)])
  )

  // 당일 발주 집계 (품목별 합계)
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

  // 공급처별 DispatchLine[] 병렬 빌드
  const supplierLinesEntries = await Promise.all(
    supplierIds.map(async supplierId => {
      const job = jobBySupplier.get(supplierId)
      const lines = job
        ? await buildLinesFromDispatchJob(adminDb, job.id)
        : buildDispatchLines(groupedMap[supplierId])
      return [supplierId, lines] as const
    })
  )
  const supplierLines = Object.fromEntries(supplierLinesEntries)

  return (
    <AdminOrderShell date={targetDate}>
      <div className="space-y-5 max-w-3xl">
        {supplierIds.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 py-14 text-center text-sm text-gray-400">
            {targetDate} 발주 내역이 없습니다
          </div>
        ) : (
          <>
            {/* 당일 발주 집계 */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-sm font-semibold text-gray-700">
                  당일 발주 집계 — {targetDate}
                </h2>
                {grandTotal > 0 && (
                  <span className="text-sm font-bold text-gray-700">총 {grandTotal.toLocaleString('ko-KR')}원</span>
                )}
              </div>
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="divide-y divide-gray-100">
                  {totalsSorted.map(p => (
                    <div key={p.name} className="flex items-center px-5 py-2.5 gap-3">
                      <span className="flex-1 text-sm text-gray-800">{p.name}</span>
                      <span className="text-sm font-semibold text-green-700 bg-green-100 px-3 py-1 rounded-md min-w-[72px] text-center">
                        {fmtQty(p.qty)} {p.unit}
                      </span>
                      {p.amount > 0 && (
                        <span className="text-sm text-gray-500 text-right min-w-[80px] tabular-nums">
                          {p.amount.toLocaleString('ko-KR')}원
                        </span>
                      )}
                    </div>
                  ))}
                </div>
                <div className="px-5 py-2 bg-gray-50 border-t border-gray-200 text-xs text-gray-400">
                  총 {totalsSorted.length}종 품목 · 새벽 2:30 자동 발주
                </div>
              </div>
            </div>

            {/* 발주 확정 버튼 (전체 너비) */}
            {!hasDispatchJobs && (
              <DispatchValidateButton businessDate={targetDate} fullWidth />
            )}

            {/* 공급처별 발주 내역 */}
            <div>
              <h2 className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">공급처별 발주 내역</h2>
              <div className="space-y-2">
                {supplierIds.map(supplierId => {
                  const job = jobBySupplier.get(supplierId)
                  const sent = job?.status === 'sent'
                  const lines = supplierLines[supplierId] ?? []
                  const supplierName = supplierNameMap.get(supplierId) ?? '-'
                  return (
                    <div key={supplierId} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                      {/* 헤더: 하늘색 배경, 공급처명 파란 텍스트 */}
                      <div className="flex items-center justify-between px-5 py-3 bg-blue-50 border-b border-blue-100">
                        <span className="text-sm font-semibold text-blue-800">{supplierName}</span>
                        {sent ? (
                          <span className="text-xs px-2.5 py-1 rounded-full bg-green-100 text-green-700 font-medium">전송완료</span>
                        ) : (
                          <DispatchSendButton supplierId={supplierId} businessDate={targetDate} />
                        )}
                      </div>
                      {/* 품목 목록 */}
                      <div className="divide-y divide-gray-50">
                        {lines.map((line) => (
                          <div key={`${line.name}-${line.unit}`} className="px-5 py-2.5">
                            <div className="flex items-center justify-between">
                              <span className="text-sm text-gray-800">{line.name}</span>
                              <span className="text-sm text-gray-600 tabular-nums">
                                {fmtQty(line.qty)} {line.unit}
                              </span>
                            </div>
                            {line.byRestaurant.length > 1 && (
                              <p className="text-xs text-gray-400 mt-0.5">
                                {line.byRestaurant.map(r => `${shortName(r.name)} ${fmtQty(r.qty)}${line.unit}`).join('  ')}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* 공급처 미배정 품목 */}
            {unmappedItems && unmappedItems.length > 0 && (
              <div className="bg-white rounded-xl border border-orange-200 overflow-hidden">
                <div className="flex items-center gap-2 px-5 py-3 bg-orange-50 border-b border-orange-100">
                  <span className="text-sm font-semibold text-orange-700">⚠ 공급처 미배정 품목</span>
                </div>
                <div className="divide-y divide-gray-50">
                  {unmappedItems.map(item => (
                    <div key={`${item.name}-${item.unit}`} className="flex items-center justify-between px-5 py-2.5">
                      <span className="text-sm text-gray-800">{item.name}</span>
                      <span className="text-sm text-gray-500 bg-gray-100 px-2.5 py-1 rounded-full tabular-nums">
                        {fmtQty(item.qty)} {item.unit}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        <p className="text-xs text-gray-400 text-center pb-2">새벽 2시 마감 기준 총수량 집계</p>
      </div>
    </AdminOrderShell>
  )
}
