export const runtime = 'edge'

import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import AutoPrint from '@/app/member/spec/print/AutoPrint'

interface Props {
  searchParams: Promise<{ specId?: string }>
}

export default async function AdminSpecPrintPage({ searchParams }: Props) {
  const { specId } = await searchParams
  if (!specId) return <div>specId 누락</div>

  const { user, supabase } = await getSessionUser()
  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('memberships').select('organizations(organization_type)').eq('user_id', user.id).single()
  const orgData = membership?.organizations
  const orgType = ((Array.isArray(orgData) ? orgData[0] : orgData) as { organization_type: string } | undefined)?.organization_type
  if (orgType !== 'platform' && orgType !== 'operator') redirect('/member/dashboard')

  const db = createAdminClient()

  const { data: spec } = await db
    .from('daily_specs')
    .select('id, business_date, restaurant_id, restaurants(organizations(name), settlement_cycle)')
    .eq('id', specId)
    .single()

  if (!spec) return <div>명세서를 찾을 수 없습니다</div>

  const restRaw = spec.restaurants as unknown as { organizations: { name: string } | null; settlement_cycle: string } | null
  const orgName = restRaw?.organizations?.name ?? '알 수 없음'
  const settlementCycle = restRaw?.settlement_cycle ?? 'weekly'

  type SpecLine = { id: string; qty: number; unit: string; unit_price: number; amount: number; vat_amount: number; products: { standard_name: string } }
  const { data: rawLines } = await db
    .from('daily_spec_lines')
    .select('id, qty, unit, unit_price, amount, vat_amount, products(standard_name)')
    .eq('daily_spec_id', specId)
  const lines = (rawLines ?? []) as unknown as SpecLine[]

  // totalAmount = 공급가 + 세액 (daily_specs.total_amount 기준과 일치)
  const totalAmount = lines.reduce((s, l) => s + Number(l.amount ?? 0) + Number(l.vat_amount ?? 0), 0)

  // 전일미수금 = 미납(outstanding) 정산서에 포함된 spec 중 오늘 이전 날짜 합계
  // 입금 처리 전까지 자동 누적
  let prevOutstanding = 0
  // settlement_cycle에 맞는 period_type의 정산서만 조회 (주간/월간 혼합 방지)
  // 1단계: settlement_cycle과 일치하는 period IDs + 날짜 정보
  const { data: matchingPeriods } = await db
    .from('settlement_periods')
    .select('id, start_date, end_date')
    .eq('period_type', settlementCycle)
  const periodIds = (matchingPeriods ?? []).map((p: { id: string }) => p.id)
  const periodById = new Map(
    (matchingPeriods ?? []).map((p: { id: string; start_date: string; end_date: string }) => [p.id, p])
  )

  // 2단계: 해당 periods의 이 식당 statements
  if (periodIds.length > 0) {
    const { data: matchingStmts } = await db
      .from('sales_statements')
      .select('id, settlement_period_id, total_amount')
      .eq('restaurant_id', spec.restaurant_id)
      .in('settlement_period_id', periodIds)

    const stmtIds = (matchingStmts ?? []).map((s: { id: string }) => s.id)
    const stmtPeriodMap = new Map(
      (matchingStmts ?? []).map((s: { id: string; settlement_period_id: string }) => [s.id, s.settlement_period_id])
    )
    const stmtTotalMap = new Map(
      (matchingStmts ?? []).map((s: { id: string; total_amount: number }) => [s.id, Number(s.total_amount ?? 0)])
    )

    // 3단계: 미납 receivables
    if (stmtIds.length > 0) {
      const { data: outstandingRecvs } = await db
        .from('receivables')
        .select('statement_id, balance')
        .in('statement_id', stmtIds)
        .in('status', ['unpaid', 'partial', 'overdue'])

      // receivable이 있는 statement는 모두 covered (paid 포함) — open period check에서 제외
      const { data: allRecvs } = await db
        .from('receivables')
        .select('statement_id')
        .in('statement_id', stmtIds)
      const coveredStmtIds = new Set<string>(
        (allRecvs ?? []).map((r: { statement_id: string }) => r.statement_id)
      )

      for (const recv of outstandingRecvs ?? []) {
        const r = recv as { statement_id: string; balance: number }
        const periodId = stmtPeriodMap.get(r.statement_id)
        const period = periodId ? periodById.get(periodId) : null
        if (!period) continue
        coveredStmtIds.add(r.statement_id)

        if (period.start_date > spec.business_date) {
          // 아직 시작 안 된 기간 → 건너뜀 (이 spec 날짜보다 미래 기간)
        } else if (period.end_date < spec.business_date) {
          // 이미 끝난 기간 → 실제 미납 잔액 사용 (부분납부 정확히 반영)
          prevOutstanding += Number(r.balance ?? 0)
        } else {
          // 현재 진행중인 기간 → 오늘 이전 spec 금액 합산
          const { data: stmtLines } = await db
            .from('sales_statement_lines')
            .select('source_doc_id, amount')
            .eq('sales_statement_id', r.statement_id)
            .eq('source_doc_type', 'daily_spec')

          const specIdToAmount: Record<string, number> = Object.fromEntries(
            (stmtLines ?? []).map((l: { source_doc_id: string; amount: number }) => [l.source_doc_id, Number(l.amount)])
          )
          const specIds = Object.keys(specIdToAmount)

          if (specIds.length > 0) {
            const { data: prevSpecs } = await db
              .from('daily_specs')
              .select('id')
              .in('id', specIds)
              .lt('business_date', spec.business_date)

            prevOutstanding += (prevSpecs ?? []).reduce(
              (s: number, ps: { id: string }) => s + (specIdToAmount[ps.id] ?? 0), 0
            )
          }

          // 이월 미수금: statement.total_amount - statement_lines 합계 (전주에서 이월된 금액)
          const stmtTotal = stmtTotalMap.get(r.statement_id) ?? 0
          const stmtSpecTotal = Object.values(specIdToAmount).reduce((s, v) => s + v, 0)
          const carryover = Math.round(stmtTotal - stmtSpecTotal)
          if (carryover > 0) prevOutstanding += carryover
        }
      }

      // receivable 없는 open 기간 statement도 spec 합산 (receivable 삭제된 경우 대비)
      for (const stmt of matchingStmts ?? []) {
        const s = stmt as { id: string; settlement_period_id: string }
        if (coveredStmtIds.has(s.id)) continue
        const period = periodById.get(s.settlement_period_id)
        if (!period || period.end_date < spec.business_date) continue
        // open 기간 + receivable 없음 → statement_lines에서 직접 합산
        const { data: stmtLines } = await db
          .from('sales_statement_lines')
          .select('source_doc_id, amount')
          .eq('sales_statement_id', s.id)
          .eq('source_doc_type', 'daily_spec')
        const specIdToAmount: Record<string, number> = Object.fromEntries(
          (stmtLines ?? []).map((l: { source_doc_id: string; amount: number }) => [l.source_doc_id, Number(l.amount)])
        )
        const specIds = Object.keys(specIdToAmount)
        if (specIds.length > 0) {
          const { data: prevSpecs } = await db
            .from('daily_specs').select('id')
            .in('id', specIds).lt('business_date', spec.business_date)
          prevOutstanding += (prevSpecs ?? []).reduce(
            (sum: number, ps: { id: string }) => sum + (specIdToAmount[ps.id] ?? 0), 0
          )
        }
      }
    }
  }

  // 정산서가 아직 생성되지 않은 과거 명세서도 미수금에 반영
  // 범위: 현재 + 직전 정산기간 / 납부 추적 불가 → spec 전액을 미수금으로 간주
  // 정산서에 이미 포함된 spec은 제외 → 위 합산과 이중 계산 방지
  {
    const sortedPeriods = (matchingPeriods ?? [])
      .slice()
      .sort((a, b) => (a as { start_date: string }).start_date.localeCompare((b as { start_date: string }).start_date)) as { id: string; start_date: string; end_date: string }[]
    // business_date 시점에 이미 시작된 기간들 (오름차순)
    const priorPeriods = sortedPeriods.filter(p => p.start_date <= spec.business_date)
    let windowStart: string | null = null
    if (priorPeriods.length > 0) {
      const anchor = priorPeriods[priorPeriods.length - 1] // 가장 최근 시작 기간
      if (anchor.end_date >= spec.business_date) {
        // business_date가 anchor 기간 안 → anchor=현재 기간, 그 직전 기간부터 합산
        const prev = priorPeriods[priorPeriods.length - 2]
        windowStart = (prev ?? anchor).start_date
      } else {
        // business_date가 anchor 종료 이후 (이번 기간 record 아직 없음)
        // → anchor=직전 기간, 그 이후 미정산 날짜들=현재 기간으로 보고 anchor 시작부터 합산
        windowStart = anchor.start_date
      }
    }

    if (windowStart) {
      const { data: windowSpecs } = await db
        .from('daily_specs')
        .select('id, total_amount')
        .eq('restaurant_id', spec.restaurant_id)
        .gte('business_date', windowStart)
        .lt('business_date', spec.business_date)

      const candidateSpecs = (windowSpecs ?? []) as { id: string; total_amount: number }[]
      const candidateIds = candidateSpecs.map(s => s.id)

      if (candidateIds.length > 0) {
        // 어떤 정산서에든 포함된(=위에서 합산했거나 납부완료) spec 제외
        const { data: coveredLines } = await db
          .from('sales_statement_lines')
          .select('source_doc_id')
          .eq('source_doc_type', 'daily_spec')
          .in('source_doc_id', candidateIds)
        const coveredIds = new Set(
          (coveredLines ?? []).map((l: { source_doc_id: string }) => l.source_doc_id)
        )

        prevOutstanding += candidateSpecs.reduce(
          (sum, s) => (coveredIds.has(s.id) ? sum : sum + Number(s.total_amount ?? 0)),
          0
        )
      }
    }
  }

  const outstanding = prevOutstanding + totalAmount

  const [, pM, pD] = spec.business_date.split('-')
  const printDateLabel = `${Number(pM)}월 ${Number(pD)}일`

  return (
    <>
      <AutoPrint />
      <style>{`
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Malgun Gothic', '맑은 고딕', Arial, sans-serif; font-size: 11pt; padding: 10mm; background: white; }
        table { width: 100%; border-collapse: collapse; }
        td, th { border: 1px solid #000; padding: 4px 8px; font-size: 10pt; }
        .info-table td { border: none; font-size: 10pt; line-height: 1.8; }
        h2 { text-align: center; font-size: 16pt; font-weight: bold; margin-bottom: 6mm; }
        .th-bg { background-color: #f0f0f0; }
        @media print { @page { size: A4; margin: 10mm; } }
      `}</style>

      <h2>{printDateLabel} 발주 명세표</h2>

      <table className="info-table" style={{marginBottom:'3mm'}}>
        <tbody>
          <tr>
            <td style={{width:'50%', borderBottom:'1px solid #000', paddingBottom:'3px'}}>{spec.business_date}</td>
            <td style={{width:'50%', textAlign:'right', verticalAlign:'top'}}>
              상호: 커넥티드 &nbsp; 성명: 김성호<br/>
              사업장 소재지: 인천 남동구 청능대로 559<br/>
              전화번호: 010-8680-5475
            </td>
          </tr>
        </tbody>
      </table>

      <div style={{borderBottom:'1px solid #000', fontWeight:'bold', fontSize:'12pt', padding:'4px 0', marginBottom:'3mm'}}>
        {orgName} 귀하
      </div>
      <div style={{fontSize:'10pt', marginBottom:'4mm'}}>아래와 같이 계산합니다.</div>

      <table>
        <thead>
          <tr>
            <th className="th-bg" style={{width:'38%', textAlign:'center'}}>품목명</th>
            <th className="th-bg" style={{width:'18%', textAlign:'center'}}>수량</th>
            <th className="th-bg" style={{width:'18%', textAlign:'center'}}>단가</th>
            <th className="th-bg" style={{width:'26%', textAlign:'center'}}>공급가</th>
          </tr>
        </thead>
        <tbody>
          {lines.map(line => {
            const p = line.products as unknown as { standard_name: string }
            const qtyStr = Number(line.qty) % 1 === 0 ? Number(line.qty) : Number(line.qty).toFixed(1)
            return (
              <tr key={line.id}>
                <td>{p.standard_name}</td>
                <td style={{textAlign:'center'}}>{qtyStr} {line.unit}</td>
                <td style={{textAlign:'right'}}>₩ {Number(line.unit_price).toLocaleString()}</td>
                <td style={{textAlign:'right', fontWeight:'bold'}}>₩ {Number(line.amount ?? 0).toLocaleString()}</td>
              </tr>
            )
          })}
          {Array.from({length: Math.max(0, 3 - lines.length)}).map((_, i) => (
            <tr key={`e${i}`}><td>&nbsp;</td><td></td><td></td><td style={{textAlign:'right'}}>₩ -</td></tr>
          ))}
        </tbody>
      </table>

      <table style={{marginTop:'2mm'}}>
        <tbody>
          <tr>
            <td style={{width:'74%', border:'none'}}></td>
            <td className="th-bg" style={{textAlign:'center', fontWeight:'bold'}}>합계</td>
            <td style={{textAlign:'right', fontWeight:'bold'}}>₩ {totalAmount.toLocaleString()}</td>
          </tr>
          <tr>
            <td style={{border:'none'}}></td>
            <td className="th-bg" style={{textAlign:'center'}}>전일미수금</td>
            <td style={{textAlign:'right', fontWeight:'bold'}}>₩ {prevOutstanding.toLocaleString()}</td>
          </tr>
          <tr>
            <td style={{border:'none'}}></td>
            <td className="th-bg" style={{textAlign:'center'}}>금일미수금</td>
            <td style={{textAlign:'right', fontWeight:'bold', color: outstanding > 0 ? '#cc0000' : 'inherit'}}>
              ₩ {outstanding.toLocaleString()}
            </td>
          </tr>
        </tbody>
      </table>

      <table style={{marginTop:'3mm'}}>
        <tbody>
          <tr><td className="th-bg" style={{textAlign:'center', fontWeight:'bold'}}>기타사항</td></tr>
          <tr><td style={{height:'20mm'}}>&nbsp;</td></tr>
        </tbody>
      </table>
    </>
  )
}
