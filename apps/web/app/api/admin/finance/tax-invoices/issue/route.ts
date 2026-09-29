export const runtime = 'edge'

import { NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-member-user'
import { loadPopbillConfig } from '@/lib/popbill/config'
import { PopbillClient, PopbillError } from '@/lib/popbill/client'
import { registerAndIssue } from '@/lib/popbill/taxinvoice'
import { buildTaxinvoicePayload, generateMgtKey } from '@/lib/payments/tax-invoice'

/**
 * 세금계산서 발행(2단계). 정산기간 하나(업체 1곳)를 등록+즉시발행(RegistIssue)한다.
 * 세액은 그 기간에 걸린 일일명세(daily_specs)의 vat_amount 합을 그대로 쓴다(2026-09-16 정정 이후
 * daily_spec_lines 에 저장되는, 이미 나뉜 값 — ground truth). 품목별 상세(detailList)는 이 단계에서
 * 넣지 않는다(기간 합계 한 건만 발행).
 *
 * TAX_INVOICE_ISSUE_ENABLED=true 로 켜기 전까지는 항상 403 — 계획서(2026-09-25) §5 공통 원칙(기본 OFF).
 * 이미 발행된(status='issued') 건은 다시 부르지 않는다(이중 발행 차단, unique 제약과 별개의 응답 차원 방어).
 * 결과가 불명(status='unknown', 팝빌 응답을 못 받음)이면 자동 재시도하지 않는다 — 실제 처리 여부를
 * 조회로 먼저 확인해야 한다(PopbillClient 의 outcome 규칙과 같은 정책).
 */
const INVOICER = {
  corpName: '커넥티드',
  ceoName: '김성호',
  addr: '인천 남동구 청능대로 559',
  tel: '010-8680-5475',
}

export async function POST(req: Request) {
  try {
    const { restaurantId, settlementPeriodId } = await req.json() as { restaurantId?: string; settlementPeriodId?: string }
    if (!restaurantId || !settlementPeriodId) {
      return NextResponse.json({ error: '필수 값이 없습니다.' }, { status: 400 })
    }

    if (process.env.TAX_INVOICE_ISSUE_ENABLED !== 'true') {
      return NextResponse.json({ error: '세금계산서 발행 기능이 꺼져 있습니다.' }, { status: 403 })
    }

    const session = await getAdminSession()
    if (!session) return NextResponse.json({ error: '권한이 없습니다' }, { status: 403 })
    const { user, db } = session

    const { data: restaurant } = await db
      .from('restaurants')
      .select('id, biz_no, ceo_name, organizations(name)')
      .eq('id', restaurantId)
      .maybeSingle()
    if (!restaurant) return NextResponse.json({ error: '업체를 찾을 수 없습니다.' }, { status: 404 })

    const bizNo = (restaurant.biz_no ?? '').replace(/-/g, '')
    if (!/^\d{10}$/.test(bizNo)) {
      return NextResponse.json({ error: '이 업체는 사업자번호가 없습니다. 회원 정보에서 먼저 입력해 주세요.' }, { status: 400 })
    }

    const { data: period } = await db.from('settlement_periods').select('id, start_date, end_date').eq('id', settlementPeriodId).maybeSingle()
    if (!period) return NextResponse.json({ error: '정산기간을 찾을 수 없습니다.' }, { status: 404 })

    const { data: statement } = await db
      .from('sales_statements')
      .select('id, total_amount')
      .eq('restaurant_id', restaurantId)
      .eq('settlement_period_id', settlementPeriodId)
      .maybeSingle()
    if (!statement) return NextResponse.json({ error: '이 기간의 명세서가 없습니다.' }, { status: 404 })

    // 같은 업체·같은 정산기간은 한 번만 발행한다(migration 20260929030000 의 unique 와 같은 정책).
    const { data: existing } = await db
      .from('tax_invoices')
      .select('id, status, nts_confirm_num')
      .eq('restaurant_id', restaurantId)
      .eq('settlement_period_id', settlementPeriodId)
      .maybeSingle()
    if (existing?.status === 'issued') {
      return NextResponse.json({ success: true, alreadyIssued: true, ntsConfirmNum: existing.nts_confirm_num })
    }
    if (existing?.status === 'unknown') {
      return NextResponse.json({ error: '이전 시도의 처리 결과를 알 수 없습니다. 조회로 먼저 확인해 주세요.' }, { status: 409 })
    }

    const { data: lineRows } = await db
      .from('sales_statement_lines')
      .select('source_doc_id')
      .eq('sales_statement_id', statement.id)
      .eq('source_doc_type', 'daily_spec')
    const specIds = (lineRows ?? []).map((r: { source_doc_id: string }) => r.source_doc_id)

    let taxTotal = 0
    if (specIds.length > 0) {
      const { data: specs } = await db.from('daily_specs').select('vat_amount').in('id', specIds)
      taxTotal = (specs ?? []).reduce((sum: number, s: { vat_amount: number | null }) => sum + Number(s.vat_amount ?? 0), 0)
    }
    const totalAmount = Number(statement.total_amount ?? 0)
    const supplyCostTotal = totalAmount - taxTotal

    const config = loadPopbillConfig(process.env as Record<string, string | undefined>)
    const mgtKey = await generateMgtKey(restaurantId, settlementPeriodId)
    type RestRow = { organizations: { name: string } | null }
    const orgName = (restaurant as unknown as RestRow).organizations?.name ?? '알 수 없음'

    const payload = buildTaxinvoicePayload({
      mgtKey,
      writeDate: period.end_date.replace(/-/g, ''),
      invoicer: { corpNum: config.corpNum, ...INVOICER },
      invoicee: { corpNum: bizNo, corpName: orgName, ceoName: restaurant.ceo_name ?? undefined },
      supplyCostTotal, taxTotal,
    })

    const client = new PopbillClient(config)
    try {
      const result = await registerAndIssue(client, payload) as { ntsconfirmNum?: string } | null
      await db.from('tax_invoices').upsert({
        restaurant_id: restaurantId, settlement_period_id: settlementPeriodId, mgt_key: mgtKey,
        status: 'issued', supply_cost_total: supplyCostTotal, tax_total: taxTotal, total_amount: totalAmount,
        nts_confirm_num: result?.ntsconfirmNum ?? null, issued_at: new Date().toISOString(), error_message: null, created_by: user.id,
      }, { onConflict: 'restaurant_id,settlement_period_id' })
      return NextResponse.json({ success: true, ntsConfirmNum: result?.ntsconfirmNum ?? null })
    } catch (e) {
      const outcome = e instanceof PopbillError ? e.outcome : 'unknown'
      const message = e instanceof Error ? e.message : String(e)
      await db.from('tax_invoices').upsert({
        restaurant_id: restaurantId, settlement_period_id: settlementPeriodId, mgt_key: mgtKey,
        status: outcome, supply_cost_total: supplyCostTotal, tax_total: taxTotal, total_amount: totalAmount,
        error_message: message, created_by: user.id,
      }, { onConflict: 'restaurant_id,settlement_period_id' })
      console.error('[tax-invoices/issue] 발행 실패', message)
      return NextResponse.json({ error: `세금계산서 발행 실패: ${message}` }, { status: outcome === 'rejected' ? 400 : 502 })
    }
  } catch (e) {
    console.error('[tax-invoices/issue] unexpected error', e)
    return NextResponse.json({ error: '요청 처리 중 오류가 발생했습니다.' }, { status: 500 })
  }
}
