export const runtime = 'edge'

import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import AutoPrint from '@/app/member/spec/print/AutoPrint'

interface Props {
  params: Promise<{ restaurantId: string; statementId: string }>
}

export default async function AdminStatementPrintPage({ params }: Props) {
  const { restaurantId, statementId } = await params
  const db = createAdminClient()

  const { data: stmt } = await db
    .from('sales_statements')
    .select('id, total_amount, outstanding_amount, settlement_periods(period_type, start_date, end_date), restaurants(organizations(name))')
    .eq('id', statementId)
    .eq('restaurant_id', restaurantId)
    .single()

  if (!stmt) notFound()

  type Period = { period_type: string; start_date: string; end_date: string }
  const period = stmt.settlement_periods as unknown as Period | null
  const orgName = (stmt.restaurants as unknown as { organizations: { name: string } | null } | null)?.organizations?.name ?? '알 수 없음'
  const totalAmount = Number(stmt.total_amount ?? 0)
  const outstandingAmount = Number(stmt.outstanding_amount ?? 0)
  const paidAmount = totalAmount - outstandingAmount

  const { data: dailySpecsRaw } = period
    ? await db
        .from('daily_specs')
        .select('id, business_date, total_amount')
        .eq('restaurant_id', restaurantId)
        .gte('business_date', period.start_date)
        .lte('business_date', period.end_date)
        .order('business_date', { ascending: true })
    : { data: [] }
  const dailySpecs = dailySpecsRaw ?? []

  const specIds = dailySpecs.map(s => s.id)
  type SpecLineRow = { daily_spec_id: string; qty: number; unit: string; products: { standard_name: string } | null }
  const linesBySpec: Record<string, SpecLineRow[]> = {}
  if (specIds.length > 0) {
    const { data: allSpecLines } = await db
      .from('daily_spec_lines')
      .select('daily_spec_id, qty, unit, products(standard_name)')
      .in('daily_spec_id', specIds)
    for (const l of allSpecLines ?? []) {
      const row = l as unknown as SpecLineRow
      if (!linesBySpec[row.daily_spec_id]) linesBySpec[row.daily_spec_id] = []
      linesBySpec[row.daily_spec_id].push(row)
    }
  }

  function summarize(specId: string): string {
    const rows = linesBySpec[specId] ?? []
    if (!rows.length) return '-'
    return rows.map(l => {
      const name = l.products?.standard_name ?? '품목'
      const q = Number(l.qty) % 1 === 0 ? Number(l.qty) : Number(l.qty).toFixed(1)
      return `${name} ${q}${l.unit}`
    }).join(' + ')
  }

  const fmtWon = (n: number) => `₩ ${n.toLocaleString()}`

  const pYear = period ? Number(period.start_date.split('-')[0]) : 0
  const pMon  = period ? Number(period.start_date.split('-')[1]) : 0
  const pDay  = period ? Number(period.start_date.split('-')[2]) : 0
  const weekNum  = Math.ceil(pDay / 7)
  const endDay   = period ? Number(period.end_date.split('-')[2]) : 0
  const printTitle = period?.period_type === 'monthly'
    ? `${pMon}월 발주 정산서`
    : `${pMon}월 ${weekNum}주 발주 정산서`
  const printDate = period ? `${pYear}.${pMon}.${endDay}` : ''

  return (
    <>
      <AutoPrint />
      <style>{`
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Malgun Gothic', '맑은 고딕', Arial, sans-serif; font-size: 11pt; padding: 10mm; background: white; }
        table { width: 100%; border-collapse: collapse; }
        td, th { border: 1px solid #000; padding: 4px 8px; font-size: 10pt; }
        .no-b td { border: none; }
        h2 { text-align: center; font-size: 16pt; font-weight: bold; margin-bottom: 6mm; }
        @media print { @page { size: A4; margin: 10mm; } }
      `}</style>

      <h2>{printTitle}</h2>

      <table className="no-b" style={{marginBottom:'3mm'}}>
        <tbody>
          <tr>
            <td style={{width:'50%', borderBottom:'1px solid #000', paddingBottom:'3px'}}>{printDate}</td>
            <td style={{width:'50%', textAlign:'right', fontSize:'10pt', lineHeight:'1.9'}}>
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
          <tr style={{backgroundColor:'#f0f0f0'}}>
            <th style={{width:'18%', textAlign:'center'}}>납품일자</th>
            <th style={{width:'10%', textAlign:'center'}}>품목수</th>
            <th style={{width:'52%', textAlign:'center'}}>내용</th>
            <th style={{width:'20%', textAlign:'center'}}>금액</th>
          </tr>
        </thead>
        <tbody>
          {dailySpecs.map(spec => {
            const [, sm, sd] = spec.business_date.split('-')
            const lines = linesBySpec[spec.id] ?? []
            return (
              <tr key={spec.id}>
                <td style={{textAlign:'center'}}>{pYear}.{Number(sm)}.{Number(sd)}</td>
                <td style={{textAlign:'center'}}>{lines.length}</td>
                <td style={{fontSize:'9pt'}}>{summarize(spec.id)}</td>
                <td style={{textAlign:'right', fontWeight:'bold'}}>{fmtWon(Number(spec.total_amount))}</td>
              </tr>
            )
          })}
          {Array.from({length: Math.max(0, 5 - dailySpecs.length)}).map((_, i) => (
            <tr key={`e${i}`}><td>&nbsp;</td><td></td><td></td><td style={{textAlign:'right'}}>₩ -</td></tr>
          ))}
          <tr style={{backgroundColor:'#f9f9f9'}}>
            <td colSpan={3} style={{textAlign:'right', fontWeight:'bold'}}>합계</td>
            <td style={{textAlign:'right', fontWeight:'bold', fontSize:'11pt'}}>{fmtWon(totalAmount)}</td>
          </tr>
          {paidAmount > 0 && (
            <tr>
              <td colSpan={3} style={{textAlign:'right', color:'#555'}}>납부액</td>
              <td style={{textAlign:'right', color:'#555'}}>{fmtWon(paidAmount)}</td>
            </tr>
          )}
          <tr style={{backgroundColor:'#fff5f5'}}>
            <td colSpan={3} style={{textAlign:'right', fontWeight:'bold', color:'#cc0000'}}>미수금</td>
            <td style={{textAlign:'right', fontWeight:'bold', color:'#cc0000', fontSize:'12pt'}}>{fmtWon(outstandingAmount)}</td>
          </tr>
        </tbody>
      </table>

      <table style={{marginTop:'4mm'}}>
        <tbody>
          <tr>
            <td style={{backgroundColor:'#f0f0f0', textAlign:'center', fontWeight:'bold', width:'30%'}}>입금 계좌 안내</td>
            <td style={{fontSize:'10pt', lineHeight:'1.8', padding:'6px 10px'}}>
              농협 302-1748-8091-81 &nbsp;|&nbsp; 예금주: 차숙희(커넥티드)<br/>
              문의: 010-8680-5475 (김성호)
            </td>
          </tr>
        </tbody>
      </table>
    </>
  )
}
