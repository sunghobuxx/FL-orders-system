export const runtime = 'edge'

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import AdminSettlementShell from '../../../AdminSettlementShell'
import { AdminStatementPrintButton } from '@/app/admin/settlement/AdminPrintButtons'

interface Props {
  params: Promise<{ restaurantId: string; statementId: string }>
}

export default async function AdminSettlementStatementPage({ params }: Props) {
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

  // daily_specs for the settlement period
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

  type SpecLineRow = { daily_spec_id: string; qty: number; unit: string; products: { standard_name: string } | null }
  const linesBySpec: Record<string, SpecLineRow[]> = {}
  const specIds = dailySpecs.map(s => s.id)
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

  const fmt = (n: number) => `${n.toLocaleString('ko-KR')}원`
  const fmtWon = (n: number) => `₩ ${n.toLocaleString()}`
  const periodStr = period ? `${period.start_date} ~ ${period.end_date}` : ''

  const pYear = period ? Number(period.start_date.split('-')[0]) : 0
  const pMon = period ? Number(period.start_date.split('-')[1]) : 0
  const pDay = period ? Number(period.start_date.split('-')[2]) : 0
  const weekNum = Math.ceil(pDay / 7)
  const printTitle = period?.period_type === 'weekly' ? `${pMon}월 ${weekNum}주 발주 정산서` : `${pMon}월 발주 정산서`
  const printDate = period ? `${pYear}.${pMon}.${Number(period.end_date.split('-')[2])}` : ''

  return (
    <AdminSettlementShell>
      <style>{`
        .stmt-print-only { display: none; }
        @media print {
          * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          body * { visibility: hidden; }
          .stmt-print-only, .stmt-print-only * { visibility: visible; }
          .stmt-print-only {
            display: block !important;
            visibility: visible !important;
            position: absolute;
            left: 0; top: 0;
            width: 190mm;
            padding: 10mm;
            background: white;
            font-family: 'Malgun Gothic', '맑은 고딕', Arial, sans-serif;
            font-size: 11pt;
          }
          .stmt-print-only table { width: 100%; border-collapse: collapse; }
          .stmt-print-only td, .stmt-print-only th { border: 1px solid #000; padding: 4px 8px; font-size: 10pt; }
          @page { size: A4; margin: 10mm; }
        }
      `}</style>

      {/* 프린트 전용 레이아웃 */}
      <div className="stmt-print-only">
        <h2 style={{textAlign:'center', fontSize:'16pt', fontWeight:'bold', marginBottom:'6mm'}}>{printTitle}</h2>
        <table style={{width:'100%', borderCollapse:'collapse', marginBottom:'3mm', border:'none'}}>
          <tbody>
            <tr>
              <td style={{border:'none', width:'50%', borderBottom:'1px solid #000', paddingBottom:'3px'}}>{printDate}</td>
              <td style={{border:'none', width:'50%', textAlign:'right', fontSize:'10pt', lineHeight:'1.9'}}>
                상호: 커넥티드 &nbsp; 성명: 김성호<br/>
                사업장 소재지: 인천 남동구 청능대로 559<br/>
                전화번호: 010-8680-5475
              </td>
            </tr>
          </tbody>
        </table>
        <div style={{borderBottom:'1px solid #000', fontWeight:'bold', fontSize:'12pt', padding:'4px 0', marginBottom:'3mm'}}>{orgName} 귀하</div>
        <div style={{fontSize:'10pt', marginBottom:'4mm'}}>아래와 같이 계산합니다.</div>
        <table>
          <thead>
            <tr style={{backgroundColor:'#f5f5f5'}}>
              <th style={{width:'18%', textAlign:'center'}}>납품일자</th>
              <th style={{width:'12%', textAlign:'center'}}>품목종수</th>
              <th style={{width:'50%', textAlign:'center'}}>내용</th>
              <th style={{width:'20%', textAlign:'center'}}>금액</th>
            </tr>
          </thead>
          <tbody>
            {dailySpecs.map(spec => {
              const [,sm,sd] = spec.business_date.split('-')
              const specLineItems = linesBySpec[spec.id] ?? []
              return (
                <tr key={spec.id}>
                  <td style={{textAlign:'center'}}>{pYear}.{Number(sm)}.{Number(sd)}</td>
                  <td style={{textAlign:'center'}}>{specLineItems.length}</td>
                  <td>{summarize(spec.id)}</td>
                  <td style={{textAlign:'right', fontWeight:'bold'}}>{fmtWon(Number(spec.total_amount))}</td>
                </tr>
              )
            })}
            {(['e0','e1','e2','e3','e4']).slice(0, Math.max(0, 5 - dailySpecs.length)).map(k => (
              <tr key={k}><td>&nbsp;</td><td></td><td></td><td style={{textAlign:'right'}}>₩ -</td></tr>
            ))}
            <tr style={{backgroundColor:'#f9f9f9'}}>
              <td colSpan={3} style={{textAlign:'right', fontWeight:'bold'}}>합계</td>
              <td style={{textAlign:'right', fontWeight:'bold', fontSize:'11pt'}}>{fmtWon(totalAmount)}</td>
            </tr>
          </tbody>
        </table>
        <table style={{marginTop:'3mm'}}>
          <tbody>
            <tr><td style={{textAlign:'center', backgroundColor:'#f5f5f5', fontWeight:'bold'}}>기타사항</td></tr>
            <tr><td style={{height:'18mm', fontSize:'10pt', verticalAlign:'bottom', paddingBottom:'4px'}}>
              농협 302-1748-8091-81 차숙희(커넥티드)
            </td></tr>
          </tbody>
        </table>
      </div>

      {/* 화면 레이아웃 */}
      <div className="space-y-4 max-w-3xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href={`/admin/settlement/restaurant/${restaurantId}`} className="text-sm text-gray-400 hover:text-gray-700">← 정산목록</Link>
            {period && (
              <span className="text-sm bg-gray-100 px-4 py-1.5 rounded font-medium text-gray-700">{periodStr}</span>
            )}
          </div>
          <AdminStatementPrintButton />
        </div>

        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="grid grid-cols-[1fr_auto] gap-3 px-5 py-3 bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500">
            <span>날짜 (클릭 → 명세서)</span>
            <span className="w-32 text-right">금액</span>
          </div>

          {dailySpecs.length === 0 ? (
            <div className="py-10 text-center text-sm text-gray-400">항목이 없습니다</div>
          ) : (
            <div className="divide-y divide-gray-100">
              {dailySpecs.map(spec => (
                <div key={spec.id} className="grid grid-cols-[1fr_auto] gap-3 items-center px-5 py-3">
                  <Link href={`/admin/settlement/specs/${spec.id}`} className="text-sm text-brand-600 font-medium bg-gray-100 px-3 py-1.5 rounded hover:bg-gray-200 transition-colors self-start">
                    {spec.business_date}
                  </Link>
                  <span className="w-32 text-right text-sm font-medium text-gray-900">{fmt(Number(spec.total_amount))}</span>
                </div>
              ))}
            </div>
          )}

          <div className="divide-y divide-gray-100 border-t border-gray-200 bg-gray-50">
            <div className="grid grid-cols-[1fr_auto] gap-3 items-center px-5 py-3">
              <span className="text-sm font-semibold text-gray-700">합계</span>
              <span className="w-32 text-right text-sm font-bold text-gray-900 bg-gray-100 px-3 py-1.5 rounded">{fmt(totalAmount)}</span>
            </div>
            <div className="grid grid-cols-[1fr_auto] gap-3 items-center px-5 py-3">
              <span className="text-sm text-gray-500">납부액</span>
              <span className="w-32 text-right text-sm font-medium text-gray-900 bg-gray-100 px-3 py-1.5 rounded">{fmt(paidAmount)}</span>
            </div>
            <div className="grid grid-cols-[1fr_auto] gap-3 items-center px-5 py-3">
              <span className="text-sm text-gray-500">미수금</span>
              <span className={`w-32 text-right text-sm font-medium bg-gray-100 px-3 py-1.5 rounded ${outstandingAmount > 0 ? 'text-red-600' : 'text-gray-900'}`}>{fmt(outstandingAmount)}</span>
            </div>
          </div>
        </div>
      </div>
    </AdminSettlementShell>
  )
}
