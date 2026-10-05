export const runtime = 'edge'

import { NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-member-user'
import { loadPopbillConfig } from '@/lib/popbill/config'
import { PopbillClient, PopbillError } from '@/lib/popbill/client'
import { registerAndIssue } from '@/lib/popbill/taxinvoice'
import { buildTaxinvoicePayload, generateMgtKey } from '@/lib/payments/tax-invoice'
import { monthRange } from '@/lib/payments/tax-invoice-month'
import { splitTaxByTaxability } from '@/lib/payments/tax-invoice-split'

/**
 * 세금계산서 발행(2단계). 업체 1곳의 달력상 한 달(1일~말일)을 등록+즉시발행(RegistIssue)한다.
 *
 * **정산기간이 아니라 달력상 월 단위다**(2026-09-30 정정) — 정산주기가 주/일인 업체(45/61)는 정산기간이
 * 한 달과 안 맞아, 정산기간 단위로는 "이번 달치 한 번에" 발행이 안 됐다. 한국 실무의 월합계세금계산서
 * (작성일자=말일, 익월 10일까지 발행)를 따르려면 정산주기와 무관하게 달력상 월로 집계해야 한다.
 * 그 달의 daily_specs(총액·부가세, 이미 splitVat 으로 나뉜 ground truth 값)를 restaurant_id·business_date
 * 로 직접 더한다 — 정산서·정산기간을 거치지 않는다(daily_specs 는 overwrite-in-place 라 날짜로 바로
 * 조회해도 중복·고아 행 걱정이 없다).
 *
 * 공급받는자 대표자성명은 별도 컬럼을 만들지 않는다 — 회원 수정 화면의 "대표자"(contacts.name, is_primary)
 * 가 이미 61곳 중 59곳에 채워져 있어 그대로 쓴다(2026-09-29).
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
    const { restaurantId, month } = await req.json() as { restaurantId?: string; month?: string }
    if (!restaurantId || !month) {
      return NextResponse.json({ error: '필수 값이 없습니다.' }, { status: 400 })
    }
    let range: { start: string; end: string }
    try {
      range = monthRange(month)
    } catch {
      return NextResponse.json({ error: 'month 형식이 올바르지 않습니다(YYYY-MM).' }, { status: 400 })
    }

    if (process.env.TAX_INVOICE_ISSUE_ENABLED !== 'true') {
      return NextResponse.json({ error: '세금계산서 발행 기능이 꺼져 있습니다.' }, { status: 403 })
    }

    const session = await getAdminSession()
    if (!session) return NextResponse.json({ error: '권한이 없습니다' }, { status: 403 })
    const { user, db } = session

    const { data: restaurant } = await db
      .from('restaurants')
      .select('id, biz_no, organization_id, organizations(name)')
      .eq('id', restaurantId)
      .maybeSingle()
    if (!restaurant) return NextResponse.json({ error: '업체를 찾을 수 없습니다.' }, { status: 404 })

    const bizNo = (restaurant.biz_no ?? '').replace(/-/g, '')
    if (!/^\d{10}$/.test(bizNo)) {
      return NextResponse.json({ error: '이 업체는 사업자번호가 없습니다. 회원 정보에서 먼저 입력해 주세요.' }, { status: 400 })
    }

    const { data: primaryContact } = await db
      .from('contacts')
      .select('name')
      .eq('organization_id', restaurant.organization_id)
      .eq('is_primary', true)
      .maybeSingle()

    // 같은 업체·같은 달·같은 과세구분은 한 번만 발행한다. 과세·면세는 따로 장이 나간다.
    const { data: existingRows } = await db
      .from('tax_invoices')
      .select('tax_type, status, nts_confirm_num')
      .eq('restaurant_id', restaurantId)
      .eq('invoice_month', range.start)
    const existingByType = new Map((existingRows ?? []).map(
      (r: { tax_type: string; status: string; nts_confirm_num: string | null }) => [r.tax_type, r]))
    if ((existingRows ?? []).some((r: { status: string }) => r.status === 'unknown')) {
      return NextResponse.json({ error: '이전 시도의 처리 결과를 알 수 없습니다. 조회로 먼저 확인해 주세요.' }, { status: 409 })
    }

    const { data: specs } = await db
      .from('daily_specs')
      .select('id')
      .eq('restaurant_id', restaurantId)
      .gte('business_date', range.start)
      .lte('business_date', range.end)
    if (!specs || specs.length === 0) {
      return NextResponse.json({ error: '이 달에는 거래 내역이 없습니다.' }, { status: 404 })
    }
    const specIds = specs.map((sp: { id: string }) => sp.id)
    const { data: lines } = await db
      .from('daily_spec_lines')
      .select('product_id, amount, vat_amount')
      .in('daily_spec_id', specIds)
    const productIds = [...new Set((lines ?? []).map((l: { product_id: string }) => l.product_id))]
    const { data: productRows } = productIds.length
      ? await db.from('products').select('id, taxable_flag').in('id', productIds)
      : { data: [] as Array<{ id: string; taxable_flag: boolean | null }> }
    const taxableOf = new Map((productRows ?? []).map((p: { id: string; taxable_flag: boolean | null }) => [p.id, Boolean(p.taxable_flag)]))

    const groups = splitTaxByTaxability((lines ?? []).map((l: { product_id: string; amount: number; vat_amount: number | null }) => ({
      amount: Number(l.amount),
      vat: Number(l.vat_amount ?? 0),
      taxable: taxableOf.get(l.product_id) ?? false,
    })))
    if (groups.length === 0) {
      return NextResponse.json({ error: '이 달에는 거래 내역이 없습니다.' }, { status: 404 })
    }

    const config = loadPopbillConfig(process.env as Record<string, string | undefined>)
    type RestRow = { organizations: { name: string } | null }
    const orgName = (restaurant as unknown as RestRow).organizations?.name ?? '알 수 없음'

    const results: Array<{ taxType: string; status: string; ntsConfirmNum: string | null }> = []
    for (const group of groups) {
      const prior = existingByType.get(group.taxType)
      if (prior?.status === 'issued') {
        results.push({ taxType: group.taxType, status: 'issued', ntsConfirmNum: prior.nts_confirm_num ?? null })
        continue
      }

      const mgtKey = await generateMgtKey(restaurantId, `${range.start}:${group.taxType}`)
      const payload = buildTaxinvoicePayload({
        mgtKey,
        // 월합계세금계산서 작성일자는 그 달의 말일(한국 실무).
        writeDate: range.end.replace(/-/g, ''),
        invoicer: { corpNum: config.corpNum, ...INVOICER },
        invoicee: { corpNum: bizNo, corpName: orgName, ceoName: primaryContact?.name ?? undefined },
        supplyCostTotal: group.supplyCostTotal,
        taxTotal: group.taxTotal,
        taxType: group.taxType,
      })

      const client = new PopbillClient(config)
      try {
        const result = await registerAndIssue(client, payload) as { ntsconfirmNum?: string } | null
        const ntsConfirmNum = result?.ntsconfirmNum ?? null
        await db.from('tax_invoices').upsert({
          restaurant_id: restaurantId, invoice_month: range.start, tax_type: group.taxType, mgt_key: mgtKey,
          status: 'issued', supply_cost_total: group.supplyCostTotal, tax_total: group.taxTotal,
          total_amount: group.supplyCostTotal + group.taxTotal,
          nts_confirm_num: ntsConfirmNum, issued_at: new Date().toISOString(), error_message: null, created_by: user.id,
        }, { onConflict: 'restaurant_id,invoice_month,tax_type' })
        results.push({ taxType: group.taxType, status: 'issued', ntsConfirmNum })
      } catch (e) {
        const outcome = e instanceof PopbillError ? e.outcome : 'unknown'
        const message = e instanceof Error ? e.message : String(e)
        await db.from('tax_invoices').upsert({
          restaurant_id: restaurantId, invoice_month: range.start, tax_type: group.taxType, mgt_key: mgtKey,
          status: outcome, supply_cost_total: group.supplyCostTotal, tax_total: group.taxTotal,
          total_amount: group.supplyCostTotal + group.taxTotal,
          error_message: message, created_by: user.id,
        }, { onConflict: 'restaurant_id,invoice_month,tax_type' })
        console.error('[tax-invoices/issue] 발행 실패', group.taxType, message)
        return NextResponse.json({
          error: `${group.taxType} 세금계산서 발행 실패: ${message}`,
          results,
        }, { status: outcome === 'rejected' ? 400 : 502 })
      }
    }

    return NextResponse.json({ success: true, results, ntsConfirmNum: results[0]?.ntsConfirmNum ?? null })
  } catch (e) {
    console.error('[tax-invoices/issue] unexpected error', e)
    return NextResponse.json({ error: '요청 처리 중 오류가 발생했습니다.' }, { status: 500 })
  }
}
