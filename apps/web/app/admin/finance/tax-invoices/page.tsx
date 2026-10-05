export const runtime = 'edge'

import { createAdminClient } from '@/lib/supabase/admin'
import { fetchAll } from '@/lib/supabase/fetch-all'
import AdminSettlementShell from '@/app/admin/settlement/AdminSettlementShell'
import FinanceTabs from '../FinanceTabs'
import { aggregateMonthlyTax, monthRange, previousMonthKst } from '@/lib/payments/tax-invoice-month'
import IssueTaxInvoiceButton from './IssueTaxInvoiceButton'

/**
 * 「세금계산서」 화면. 정산주기(주/일/월)와 무관하게 **달력상 한 달**(1일~말일)을 업체별로 모아 보여준다
 * (2026-09-30 — 정산기간 단위로는 주/일정산 업체 45곳이 "이번 달치 한 번에" 발행이 안 됐다).
 * 기본으로 지난달을 보여준다 — 월합계세금계산서는 지난달분을 이번달 10일까지 내는 게 실무라서.
 */
interface Props {
  searchParams: Promise<{ month?: string }>
}

export default async function TaxInvoicesPage({ searchParams }: Props) {
  const { month: monthParam } = await searchParams
  const month = monthParam ?? previousMonthKst()
  const range = monthRange(month)
  const db = createAdminClient()

  const { data: restaurantRows } = await db
    .from('restaurants')
    .select('id, biz_no, organizations(name, organization_type, status)')
    .eq('organizations.organization_type', 'restaurant')
  type RestRow = { id: string; biz_no: string | null; organizations: { name: string; organization_type: string; status: string } | null }
  const restaurants = ((restaurantRows ?? []) as unknown as RestRow[])
    .filter(r => r.organizations?.organization_type === 'restaurant' && r.organizations?.status === 'active')

  // 이 달 daily_specs 를 업체별로 묶어 집계한다. 정산서·정산기간을 거치지 않는다.
  const specRows = await fetchAll(() => db
    .from('daily_specs')
    .select('restaurant_id, total_amount, vat_amount')
    .gte('business_date', range.start)
    .lte('business_date', range.end))
  const specsByRestaurant = new Map<string, Array<{ total_amount: number; vat_amount: number | null }>>()
  for (const s of specRows as Array<{ restaurant_id: string; total_amount: number; vat_amount: number | null }>) {
    const list = specsByRestaurant.get(s.restaurant_id) ?? []
    list.push({ total_amount: s.total_amount, vat_amount: s.vat_amount })
    specsByRestaurant.set(s.restaurant_id, list)
  }

  // 과세·면세는 한 업체·한 달에 장이 두 개일 수 있다. 상태는 가장 나쁜 쪽을 보여준다(불명 > 거절 > 발행).
  const { data: existingRows } = await db
    .from('tax_invoices')
    .select('restaurant_id, status')
    .eq('invoice_month', range.start)
  const SEVERITY: Record<string, number> = { issued: 1, rejected: 2, unknown: 3 }
  const existingByRestaurant = new Map<string, string>()
  for (const r of (existingRows ?? []) as Array<{ restaurant_id: string; status: string }>) {
    const prev = existingByRestaurant.get(r.restaurant_id)
    if (!prev || (SEVERITY[r.status] ?? 0) > (SEVERITY[prev] ?? 0)) existingByRestaurant.set(r.restaurant_id, r.status)
  }

  const rows = restaurants
    .map(r => {
      const { totalAmount } = aggregateMonthlyTax(specsByRestaurant.get(r.id) ?? [])
      return {
        id: r.id,
        name: r.organizations?.name ?? '알 수 없음',
        bizNo: r.biz_no,
        totalAmount,
        status: existingByRestaurant.get(r.id) ?? null,
      }
    })
    .filter(r => r.totalAmount > 0 || r.status) // 이 달 거래가 없고 발행 이력도 없으면 목록에서 뺀다
    .sort((a, b) => b.totalAmount - a.totalAmount)

  const [y, mo] = month.split('-').map(Number)
  const prevMonth = `${mo === 1 ? y - 1 : y}-${String(mo === 1 ? 12 : mo - 1).padStart(2, '0')}`
  const nextMonth = `${mo === 12 ? y + 1 : y}-${String(mo === 12 ? 1 : mo + 1).padStart(2, '0')}`

  const fmt = (n: number) => `${Math.round(n).toLocaleString()}원`
  const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
    issued: { label: '발행완료', cls: 'bg-green-50 text-green-700' },
    unknown: { label: '결과불명', cls: 'bg-amber-50 text-amber-700' },
    rejected: { label: '발행거절', cls: 'bg-red-50 text-red-700' },
  }

  return (
    <AdminSettlementShell>
      <div className="space-y-3 max-w-4xl">
        <FinanceTabs />
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-sm font-semibold text-gray-700">세금계산서 — {month} 월합계</h1>
          <div className="ml-auto flex items-center gap-2 text-xs">
            <a href={`?month=${prevMonth}`} className="px-2 py-1 rounded border border-gray-200 hover:bg-gray-50">← 이전달</a>
            <a href={`?month=${nextMonth}`} className="px-2 py-1 rounded border border-gray-200 hover:bg-gray-50">다음달 →</a>
          </div>
        </div>
        <p className="text-xs text-gray-400">
          정산주기(주/일/월)와 무관하게 달력상 1일~말일 거래를 모아 월합계로 발행합니다.
          작성일자는 말일, 국세청 신고 기한은 다음달 10일입니다.
        </p>

        {rows.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 py-14 text-center text-sm text-gray-400">
            이 달에는 거래 내역이 없습니다
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
            {rows.map(r => {
              const st = r.status ? STATUS_LABEL[r.status] : { label: '미발행', cls: 'bg-gray-100 text-gray-500' }
              const hasBizNo = Boolean(r.bizNo)
              return (
                <div key={r.id} className="px-5 py-3 flex items-center gap-3 flex-wrap">
                  <span className="text-sm font-medium w-44 shrink-0 truncate">{r.name}</span>
                  <span className="text-xs text-gray-400 w-28 shrink-0">{hasBizNo ? r.bizNo : '사업자번호 없음'}</span>
                  <span className="text-sm font-semibold w-28 shrink-0 text-right">{fmt(r.totalAmount)}</span>
                  <span className={`text-xs px-2 py-1 rounded shrink-0 ${st.cls}`}>{st.label}</span>
                  <div className="ml-auto">
                    <IssueTaxInvoiceButton restaurantId={r.id} month={month} disabled={!hasBizNo || r.status === 'issued'} />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </AdminSettlementShell>
  )
}
