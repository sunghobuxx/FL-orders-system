export const runtime = 'edge'

import { createAdminClient } from '@/lib/supabase/admin'
import { fetchAll } from '@/lib/supabase/fetch-all'
import { getCarryover } from '@/lib/settlement/carryover'
import StatementSheet, { type StatementSheetRow } from '@/components/StatementSheet'
import PrintButton from './PrintButton'

/**
 * 로그인 없이 보는 정산서.
 *
 * 문자·알림톡을 받은 거래처가 그 자리에서 열 수 있어야 한다. 로그인부터 하라고 하면
 * 아무도 안 본다. 대신 명세서 내역이 담기므로 유효기간(7일)으로 노출을 제한한다.
 */

/**
 * 검색 색인을 막는다. 청구 금액이 담긴 페이지라 링크가 카톡·블로그로 퍼졌을 때
 * 검색에 잡히면 안 된다.
 */
export const metadata = {
  robots: { index: false, follow: false },
}

interface Props {
  params: Promise<{ token: string }>
}

export default async function SharedStatementPage({ params }: Props) {
  const { token } = await params
  const db = createAdminClient()

  const { data: link } = await db
    .from('statement_share_links')
    .select('statement_id, expires_at')
    .eq('token', token)
    .maybeSingle()

  if (!link || new Date(link.expires_at) < new Date()) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-gray-50 px-6">
        <div className="max-w-sm text-center space-y-2">
          <p className="text-lg font-semibold text-gray-800">기간이 지난 링크입니다</p>
          <p className="text-sm text-gray-500">
            정산서는 발송일로부터 7일간 볼 수 있습니다. 다시 필요하시면 담당자에게 문의해 주세요.
          </p>
        </div>
      </main>
    )
  }

  const { data: stmt } = await db
    .from('sales_statements')
    .select('id, total_amount, restaurant_id, settlement_periods(period_type, start_date, end_date), restaurants(organizations(name))')
    .eq('id', link.statement_id)
    .maybeSingle()

  if (!stmt) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-gray-50 px-6">
        <p className="text-sm text-gray-500">정산서를 찾을 수 없습니다.</p>
      </main>
    )
  }

  const rest = Array.isArray(stmt.restaurants) ? stmt.restaurants[0] : stmt.restaurants
  const org = Array.isArray(rest?.organizations) ? rest.organizations[0] : rest?.organizations
  const period = Array.isArray(stmt.settlement_periods) ? stmt.settlement_periods[0] : stmt.settlement_periods

  const lines = await fetchAll<{ amount: number; source_doc_id: string }>(() => db
    .from('sales_statement_lines')
    .select('amount, source_doc_id')
    .eq('sales_statement_id', stmt.id))

  // 금액이 0 인 줄은 빼고 보여준다. 청구하지 않기로 한 옛 명세서가 그렇게 남아 있는데
  // 거래처 정산서에 「₩ 0」으로 찍히면 무슨 돈인지 묻게 된다.
  const billed = lines.filter(l => Number(l.amount ?? 0) > 0 && l.source_doc_id)

  const specIds = billed.map(l => l.source_doc_id)
  const specs = specIds.length
    ? await fetchAll<{ id: string; business_date: string; total_amount: number }>(() => db
        .from('daily_specs').select('id, business_date, total_amount').in('id', specIds))
    : []
  const dateOf = new Map(specs.map(s => [s.id, s.business_date]))

  // 납품 내용 — 종이 정산서와 같은 「꽃상추 1box + 곱슬이 1box」 형태
  type SpecLine = { daily_spec_id: string; qty: number; unit: string; products: { standard_name: string } | null }
  const specLines = specIds.length
    ? await fetchAll<SpecLine>(() => db
        .from('daily_spec_lines')
        .select('daily_spec_id, qty, unit, products(standard_name)')
        .in('daily_spec_id', specIds))
    : []
  const linesBySpec = new Map<string, SpecLine[]>()
  for (const raw of specLines) {
    const l = raw as unknown as SpecLine
    const arr = linesBySpec.get(l.daily_spec_id) ?? []
    arr.push(l)
    linesBySpec.set(l.daily_spec_id, arr)
  }

  function summarize(specId: string): string {
    const rows = linesBySpec.get(specId) ?? []
    if (!rows.length) return '-'
    return rows.map(l => {
      const p = Array.isArray(l.products) ? l.products[0] : l.products
      const name = p?.standard_name ?? '품목'
      const q = Number(l.qty) % 1 === 0 ? Number(l.qty) : Number(l.qty).toFixed(1)
      return `${name} ${q}${l.unit}`
    }).join(' + ')
  }

  const sheetRows: Array<StatementSheetRow & { sortKey: string }> = billed
    .map(l => {
      const date = dateOf.get(l.source_doc_id) ?? ''
      const [y, m, d] = date.split('-')
      return {
        key: l.source_doc_id,
        sortKey: date,
        date: date ? `${Number(y)}.${Number(m)}.${Number(d)}` : '-',
        itemCount: (linesBySpec.get(l.source_doc_id) ?? []).length,
        summary: summarize(l.source_doc_id),
        amount: Number(l.amount ?? 0),
      }
    })
    .sort((a, b) => a.sortKey.localeCompare(b.sortKey))

  // 이전 미수금은 getCarryover 하나로만 구한다. 어드민 화면·인쇄·문자가 같은 함수를 쓴다.
  // 「이 정산서만 빼고 전부 더하기」로 하면 그 뒤에 생긴 정산서까지 이전 미수금으로 잡힌다
  // (2026-08-02 정직한 푸드 368,500). 거래처가 보는 숫자와 어드민 숫자가 달라지면 안 된다.
  const { data: recvSelf } = await db
    .from('receivables').select('balance').eq('statement_id', stmt.id)
  const currentOutstanding = (recvSelf ?? [])
    .reduce((s: number, r: { balance: number }) => s + Number(r.balance ?? 0), 0)

  const { previous: carryover } = await getCarryover(
    db, stmt.restaurant_id, stmt.id, currentOutstanding, period?.start_date ?? null,
  )

  const current = Number(stmt.total_amount ?? 0)
  const paidAmount = Math.max(0, current - currentOutstanding)

  const pStart = period?.start_date ?? ''
  const pEnd = period?.end_date ?? ''
  const pYear = Number(pStart.split('-')[0] ?? 0)
  const pMon = Number(pStart.split('-')[1] ?? 0)
  const pDay = Number(pStart.split('-')[2] ?? 0)
  const endDay = Number(pEnd.split('-')[2] ?? 0)
  const title = period?.period_type === 'monthly'
    ? `${pMon}월 발주 정산서`
    : `${pMon}월 ${Math.ceil(pDay / 7)}주 발주 정산서`
  const issuedOn = pStart ? `${pYear}.${pMon}.${endDay}` : ''

  return (
    <main className="min-h-screen bg-gray-100 py-6 px-3 print:bg-white print:p-0">
      <div className="mx-auto max-w-3xl space-y-3">
        {/* 좁은 화면에서는 표가 눌리지 않게 가로로 넘긴다. 종이와 같은 칸 비율을 지킨다. */}
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white p-4 print:border-0 print:p-0">
          <div className="min-w-[560px]">
            <StatementSheet
              title={title}
              issuedOn={issuedOn}
              orgName={org?.name ?? '거래처'}
              rows={sheetRows}
              totalAmount={current}
              carryover={carryover}
              paidAmount={paidAmount}
              outstandingAmount={currentOutstanding}
              totalDue={currentOutstanding + carryover}
            />
          </div>
        </div>

        <PrintButton />

        <p className="px-1 text-center text-xs text-gray-400 print:hidden">
          이 링크는 발송일로부터 7일간 볼 수 있습니다.
        </p>
      </div>
    </main>
  )
}
