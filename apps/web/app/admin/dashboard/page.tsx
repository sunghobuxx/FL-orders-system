export const runtime = 'edge'

import React from 'react'
import Link from 'next/link'

import { getSessionUser } from '@/lib/supabase/server'
import { getKstToday, getKstDateOffset } from '@/lib/date-kst'

export default async function AdminDashboardPage() {
  const { supabase: db, user } = await getSessionUser()
  const today = getKstToday()
  const tomorrow = getKstDateOffset(1)

  const [
    { data: allBatchesRaw },
    { data: pendingPastBatchesRaw },
    { data: allDispatchesRaw },
    { data: receivables },
    { data: notices },
    { data: inquiries },
  ] = await Promise.all([
    // 오늘 + 내일 주문내역 통합 조회 (business_date 기준)
    db.from('order_batches')
      .select('id, status, submitted_at, business_date, restaurants(organizations(name))')
      .in('business_date', [today, tomorrow])
      .order('business_date', { ascending: true })
      .order('submitted_at', { ascending: false }),

    // 배송완료/완료 되지 않은 과거 발주 (배송중 미진입)
    db.from('order_batches')
      .select('id, status, submitted_at, business_date, restaurants(organizations(name))')
      .lt('business_date', today)
      .not('status', 'in', '("dispatched","completed")')
      .order('business_date', { ascending: false }),

    // 오늘 + 내일 발주내역 (농산물)
    db.from('dispatch_jobs')
      .select('id, status, business_date, suppliers(organizations(name)), dispatch_job_items(qty, order_items(unit, products(standard_name)))')
      .in('business_date', [today, tomorrow]),

    // 결제정보 (전체 미수금)
    db.from('receivables')
      .select('balance, restaurants(organizations(name))')
      .in('status', ['unpaid', 'partial', 'overdue'])
      .order('due_date'),

    // 공지사항
    db.from('notices')
      .select('id, title, created_at')
      .order('created_at', { ascending: false })
      .limit(5),

    // 문의/불편 (미답변)
    db.from('inquiries')
      .select('id, title, created_at, organizations(name)')
      .eq('status', 'open')
      .order('created_at', { ascending: false })
      .limit(5),
  ])

  // 오늘/내일 배치 분리
  const allBatches = allBatchesRaw ?? []
  const todayBatches = allBatches.filter(b => (b as unknown as { business_date: string }).business_date === today)
  const nextBatches = allBatches.filter(b => (b as unknown as { business_date: string }).business_date === tomorrow)
  const displayBatches = allBatches

  // 미처리 과거 발주 — business_date 기준으로 그룹핑
  const pendingPastBatches = pendingPastBatchesRaw ?? []
  const pastDateGroups = [...new Set(pendingPastBatches.map(b => (b as unknown as { business_date: string }).business_date))]
    .sort((a, b) => b.localeCompare(a))

  const allDispatches = allDispatchesRaw ?? []
  const todayDispatches = allDispatches.filter(j => (j as unknown as { business_date: string }).business_date === today)
  const displayDispatches = allDispatches

  // 오늘 사이클 완료 여부 (표시 레이블용)
  const DONE_BATCH_STATUSES = ['dispatched', 'completed']
  const todayBatchHasActive = todayBatches.some(b => !DONE_BATCH_STATUSES.includes(b.status))
  const todayDispatchHasActive = todayDispatches.some(j => j.status !== 'sent')
  const todayCycleActive = todayBatchHasActive || todayDispatchHasActive || todayBatches.length === 0
  const showingNextCycle = false  // 항상 오늘+내일 함께 표시하므로 미사용
  const displayDate = today

  // 품목수 계산을 위한 배치별 item count (오늘+내일+미처리 과거)
  const batchIds = [...displayBatches, ...pendingPastBatches].map(b => b.id)
  const { data: allItems } = batchIds.length > 0
    ? await db.from('order_items')
        .select('orders!inner(batch_id)')
        .in('orders.batch_id', batchIds)
    : { data: [] }

  const itemCountByBatch: Record<string, number> = {}
  for (const item of allItems ?? []) {
    const batchId = (item.orders as unknown as { batch_id: string }).batch_id
    itemCountByBatch[batchId] = (itemCountByBatch[batchId] ?? 0) + 1
  }

  const totalOutstanding = (receivables ?? []).reduce((s, r) => s + Number(r.balance), 0)
  const fmt = (n: number) => `${n.toLocaleString()}원`

  // 업체별 미수금 합산 (receivable 여러 건 → 업체당 1행으로 통합)
  const outstandingByOrg = new Map<string, number>()
  for (const r of receivables ?? []) {
    const restRaw = r.restaurants as unknown as { organizations: { name: string } | null } | null
    const name = restRaw?.organizations?.name ?? '알 수 없음'
    outstandingByOrg.set(name, (outstandingByOrg.get(name) ?? 0) + Number(r.balance))
  }
  const orgOutstandingList = [...outstandingByOrg.entries()]
    .sort((a, b) => b[1] - a[1]) // 금액 내림차순

  // batchId → 식당명 맵 (breakdown용)
  const batchToRestaurant = new Map<string, string>()
  for (const batch of displayBatches) {
    const restRaw = batch.restaurants as unknown as { organizations: { name: string } | null } | null
    batchToRestaurant.set(batch.id, restRaw?.organizations?.name ?? '알 수 없음')
  }

  // 당일 발주내역(농산물): dispatch_jobs 없으면 order_items에서 공급처별 집계
  type ItemBreakdown = { restaurantName: string; qty: number }
  type SupDispatch = { supplierName: string; items: { name: string; qty: number; unit: string; breakdown: ItemBreakdown[] }[]; sent: boolean }
  let supDispatches: SupDispatch[] = []

  if (displayDispatches.length > 0) {
    // dispatch_jobs 있으면 — order_item_id 로 batch → restaurant 추적해 breakdown 구성
    const allOiIds = (displayDispatches as Record<string, unknown>[]).flatMap(job => {
      type DJItem = { qty: number; order_item_id?: string; order_items: { unit: string; products: { standard_name: string }; orders?: { batch_id: string } } | null }
      return ((job.dispatch_job_items as DJItem[]) ?? []).map(i => i.order_item_id).filter(Boolean) as string[]
    })
    // order_items → orders → batch_id 로 식당명 추적
    const oiBatchMap: Record<string, string> = {}
    if (allOiIds.length > 0) {
      const { data: oiRows } = await db
        .from('order_items').select('id, orders!inner(batch_id)').in('id', allOiIds)
      for (const row of oiRows ?? []) {
        const batchId = (row.orders as unknown as { batch_id: string }).batch_id
        oiBatchMap[row.id] = batchToRestaurant.get(batchId) ?? '알 수 없음'
      }
    }

    supDispatches = (displayDispatches as Record<string, unknown>[]).map(job => {
      const name = (job.suppliers as { organizations: { name: string } | null } | null)?.organizations?.name ?? '-'
      type DJItem = { qty: number; order_item_id?: string; order_items: { unit: string; products: { standard_name: string } } | null }
      const djItems = (job.dispatch_job_items as DJItem[]) ?? []
      // 품목명 기준으로 합산 + breakdown
      const itemMap = new Map<string, { qty: number; unit: string; breakdown: ItemBreakdown[] }>()
      for (const i of djItems) {
        const pName = i.order_items?.products?.standard_name ?? '-'
        const unit = i.order_items?.unit ?? ''
        const qty = Number(i.qty)
        const restaurantName = i.order_item_id ? (oiBatchMap[i.order_item_id] ?? '-') : '-'
        if (!itemMap.has(pName)) itemMap.set(pName, { qty: 0, unit, breakdown: [] })
        const entry = itemMap.get(pName)!
        entry.qty += qty
        const existing = entry.breakdown.find(b => b.restaurantName === restaurantName)
        if (existing) existing.qty += qty
        else entry.breakdown.push({ restaurantName, qty })
      }
      return {
        supplierName: name,
        sent: job.status === 'sent',
        items: [...itemMap.entries()].map(([name, v]) => ({ name, ...v })),
      }
    })
  } else if (batchIds.length > 0) {
    // dispatch_jobs 없으면 order_items → supplier_products → supplier로 집계 + 식당별 breakdown
    const { data: orderItems } = await db
      .from('order_items')
      .select('qty, unit, product_id, products(standard_name), orders!inner(batch_id)')
      .in('orders.batch_id', batchIds)

    const productIds = [...new Set((orderItems ?? []).map(i => i.product_id))]
    if (productIds.length > 0) {
      const { data: spRows } = await db
        .from('supplier_products')
        .select('product_id, supplier_id, updated_at')
        .in('product_id', productIds).eq('status', 'active')
        .order('updated_at', { ascending: false })

      // 품목당 최신 공급처 1개
      const productToSupplier: Record<string, string> = {}
      for (const sp of spRows ?? []) {
        if (!productToSupplier[sp.product_id]) productToSupplier[sp.product_id] = sp.supplier_id
      }

      const supplierIds = [...new Set(Object.values(productToSupplier))]
      const { data: suppliers } = supplierIds.length > 0
        ? await db.from('suppliers').select('id, organizations(name)').in('id', supplierIds)
        : { data: [] }
      const supNameMap = new Map((suppliers ?? []).map(s => [
        s.id, (s.organizations as unknown as { name: string } | null)?.name ?? '-'
      ]))

      const grouped: Record<string, { name: string; qty: number; unit: string; breakdown: ItemBreakdown[] }[]> = {}
      for (const item of orderItems ?? []) {
        const sid = productToSupplier[item.product_id]
        if (!sid) continue
        if (!grouped[sid]) grouped[sid] = []
        const pName = (item.products as unknown as { standard_name: string } | null)?.standard_name ?? '-'
        const batchId = (item.orders as unknown as { batch_id: string }).batch_id
        const restaurantName = batchToRestaurant.get(batchId) ?? '알 수 없음'
        const qty = Number(item.qty)
        const existing = grouped[sid].find(i => i.name === pName)
        if (existing) {
          existing.qty += qty
          const rb = existing.breakdown.find(b => b.restaurantName === restaurantName)
          if (rb) rb.qty += qty
          else existing.breakdown.push({ restaurantName, qty })
        } else {
          grouped[sid].push({ name: pName, qty, unit: item.unit, breakdown: [{ restaurantName, qty }] })
        }
      }

      supDispatches = Object.entries(grouped).map(([sid, items]) => ({
        supplierName: String(supNameMap.get(sid) ?? '-'),
        sent: false,
        items,
      }))
    }
  }

  const STATUS_LABEL: Record<string, string> = {
    open: '미제출', submitted: '주문확인', validated: '상차시작',
    ordered: '상차완료', dispatched: '배송완료', completed: '완료',
  }
  const STATUS_COLOR: Record<string, string> = {
    open: 'bg-gray-100 text-gray-500',
    submitted: 'bg-blue-100 text-blue-700', validated: 'bg-purple-100 text-purple-700',
    ordered: 'bg-yellow-100 text-yellow-700', dispatched: 'bg-orange-100 text-orange-700',
    completed: 'bg-green-100 text-green-700',
  }

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <div>
        <h1 className="text-xl font-bold text-gray-900">대시보드</h1>
        <p className="text-sm text-gray-400 mt-0.5">
          {today} 기준 · 오늘({today}) + 내일({tomorrow}) 발주 표시
        </p>
      </div>

      {/* 문의/불편 */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-gray-700">문의/불편</h2>
            {(inquiries ?? []).length > 0 && (
              <span className="text-xs font-bold bg-red-500 text-white px-2 py-0.5 rounded-full">
                미답변 {(inquiries ?? []).length}건
              </span>
            )}
          </div>
          <Link href="/admin/inquiries" className="text-xs text-brand-600 hover:text-brand-800">전체보기 →</Link>
        </div>
        {(inquiries ?? []).length === 0 ? (
          <p className="px-5 py-5 text-sm text-gray-400 text-center">미답변 문의 없음</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {(inquiries ?? []).map(inq => {
              const orgName = (inq.organizations as unknown as { name: string } | null)?.name ?? '-'
              return (
                <Link key={inq.id} href={`/admin/inquiries/${inq.id}`}
                  className="flex items-center justify-between px-5 py-3 hover:bg-gray-50 transition-colors">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-800 truncate">{inq.title}</p>
                    <p className="text-xs text-gray-400">{orgName}</p>
                  </div>
                  <span className="text-xs text-gray-400 ml-3 shrink-0">
                    {new Date(inq.created_at).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit' })}
                  </span>
                </Link>
              )
            })}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* 주문내역 (식당) — 오늘+내일 */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-700">주문내역 (식당)</h2>
            <Link href="/admin/orders" className="text-xs text-brand-600 hover:text-brand-800">전체보기 →</Link>
          </div>
          {displayBatches.length === 0 ? (
            <p className="px-5 py-6 text-sm text-gray-400 text-center">발주 없음</p>
          ) : (
            <div className="divide-y divide-gray-100 max-h-96 overflow-y-auto">
              {/* 오늘 배치 */}
              {todayBatches.length > 0 && (
                <>
                  <div className="px-5 py-1.5 bg-blue-50">
                    <span className="text-xs font-bold text-blue-600">오늘 배송 ({today})</span>
                  </div>
                  {todayBatches.map(batch => {
                    const restRaw = batch.restaurants as unknown as { organizations: { name: string } | null } | null
                    const name = restRaw?.organizations?.name ?? '알 수 없음'
                    const count = itemCountByBatch[batch.id] ?? 0
                    return (
                      <Link key={batch.id} href={`/admin/orders/${batch.id}`}
                        className="grid grid-cols-[1fr_auto_auto] gap-3 items-center px-5 py-2.5 hover:bg-gray-50 transition-colors">
                        <span className="text-sm text-gray-800 truncate">{name}</span>
                        <span className="text-xs text-gray-500 text-center">{count}개</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLOR[batch.status] ?? 'bg-gray-100 text-gray-500'}`}>
                          {STATUS_LABEL[batch.status] ?? batch.status}
                        </span>
                      </Link>
                    )
                  })}
                </>
              )}
              {/* 내일 배치 */}
              {nextBatches.length > 0 && (
                <>
                  <div className="px-5 py-1.5 bg-green-50">
                    <span className="text-xs font-bold text-green-700">내일 배송 ({tomorrow})</span>
                  </div>
                  {nextBatches.map(batch => {
                    const restRaw = batch.restaurants as unknown as { organizations: { name: string } | null } | null
                    const name = restRaw?.organizations?.name ?? '알 수 없음'
                    const count = itemCountByBatch[batch.id] ?? 0
                    return (
                      <Link key={batch.id} href={`/admin/orders/${batch.id}`}
                        className="grid grid-cols-[1fr_auto_auto] gap-3 items-center px-5 py-2.5 hover:bg-gray-50 transition-colors">
                        <span className="text-sm text-gray-800 truncate">{name}</span>
                        <span className="text-xs text-gray-500 text-center">{count}개</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLOR[batch.status] ?? 'bg-gray-100 text-gray-500'}`}>
                          {STATUS_LABEL[batch.status] ?? batch.status}
                        </span>
                      </Link>
                    )
                  })}
                </>
              )}
              {/* 미처리 과거 발주 (배송완료 미진입) */}
              {pastDateGroups.map(date => {
                const batches = pendingPastBatches.filter(b => (b as unknown as { business_date: string }).business_date === date)
                return (
                  <React.Fragment key={date}>
                    <div className="px-5 py-1.5 bg-red-50">
                      <span className="text-xs font-bold text-red-600">⚠ 미처리 발주 ({date})</span>
                    </div>
                    {batches.map(batch => {
                      const restRaw = batch.restaurants as unknown as { organizations: { name: string } | null } | null
                      const name = restRaw?.organizations?.name ?? '알 수 없음'
                      const count = itemCountByBatch[batch.id] ?? 0
                      return (
                        <Link key={batch.id} href={`/admin/orders/${batch.id}`}
                          className="grid grid-cols-[1fr_auto_auto] gap-3 items-center px-5 py-2.5 hover:bg-gray-50 transition-colors">
                          <span className="text-sm text-gray-800 truncate">{name}</span>
                          <span className="text-xs text-gray-500 text-center">{count}개</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLOR[batch.status] ?? 'bg-gray-100 text-gray-500'}`}>
                            {STATUS_LABEL[batch.status] ?? batch.status}
                          </span>
                        </Link>
                      )
                    })}
                  </React.Fragment>
                )
              })}
            </div>
          )}
        </div>

        {/* 발주내역 (농산물) — 오늘+내일 */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-gray-700">발주내역 (농산물)</h2>
              <p className="text-xs text-gray-400 mt-0.5">새벽 02:30 문자 발송 대상</p>
            </div>
            <Link href="/admin/orders/dispatch" className="text-xs text-brand-600 hover:text-brand-800">전체보기 →</Link>
          </div>
          {supDispatches.length === 0 ? (
            <p className="px-5 py-6 text-sm text-gray-400 text-center">발주 없음</p>
          ) : (
            <div className="divide-y divide-gray-100 max-h-80 overflow-y-auto">
              {supDispatches.map(sup => (
                <div key={sup.supplierName} className="px-5 py-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-semibold text-blue-700">{sup.supplierName}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${sup.sent ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                      {sup.sent ? '전송완료' : '발송대기'}
                    </span>
                  </div>
                  <div className="space-y-1.5">
                    {sup.items.map(item => {
                      const fmtQty = (q: number) => q % 1 === 0 ? q : Number(q).toFixed(1)
                      // 긴 식당명 줄여서 표시 (예: "할매솥뚜껑삼겹살 천호점" → "천호점")
                      const shortName = (name: string) => {
                        const m = name.match(/\s(\S+점)$/)
                        return m ? m[1] : (name.length > 8 ? name.slice(-5) : name)
                      }
                      return (
                        <div key={`${sup.supplierName}-${item.name}`}>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {/* 품목 총합 */}
                            <span className="text-xs font-semibold bg-blue-50 text-blue-800 px-2 py-0.5 rounded">
                              {item.name} <span className="font-bold">{fmtQty(item.qty)}{item.unit}</span>
                            </span>
                            {/* 식당별 breakdown — 항상 표시 */}
                            {item.breakdown.map(b => (
                              <span key={b.restaurantName} className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">
                                {shortName(b.restaurantName)} {fmtQty(b.qty)}
                              </span>
                            ))}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 결제정보 (전체 미수금) */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700">결제정보 (미수금)</h2>
          <div className="flex items-center gap-3">
            <span className={`text-sm font-bold ${totalOutstanding > 0 ? 'text-red-600' : 'text-green-600'}`}>
              총 {fmt(totalOutstanding)}
            </span>
            <Link href="/admin/finance" className="text-xs text-brand-600 hover:text-brand-800">관리 →</Link>
          </div>
        </div>
        {orgOutstandingList.length === 0 ? (
          <p className="px-5 py-5 text-sm text-gray-400 text-center">미수금 없음</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {orgOutstandingList.map(([name, balance]) => (
              <div key={name} className="flex items-center justify-between px-5 py-2.5">
                <span className="text-sm text-gray-800">{name}</span>
                <span className="text-sm font-semibold text-red-600">{fmt(balance)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 공지사항 */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700">공지사항</h2>
          <Link href="/admin/notices/new"
            className="text-xs bg-brand-600 text-white px-3 py-1 rounded-lg font-semibold hover:bg-brand-700">
            글쓰기
          </Link>
        </div>
        {(notices ?? []).length === 0 ? (
          <p className="px-5 py-5 text-sm text-gray-400 text-center">등록된 공지 없음</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {(notices ?? []).map(n => (
              <Link key={n.id} href={`/admin/notices/${n.id}`}
                className="flex items-center justify-between px-5 py-3 hover:bg-gray-50 transition-colors">
                <span className="text-sm text-gray-800 truncate flex-1">{n.title}</span>
                <span className="text-xs text-gray-400 ml-3 shrink-0">
                  {new Date(n.created_at).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit' })}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
