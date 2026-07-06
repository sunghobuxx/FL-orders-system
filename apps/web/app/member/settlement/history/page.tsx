export const runtime = 'edge'

import Link from 'next/link'
import { redirect } from 'next/navigation'

import { getSessionUser } from '@/lib/supabase/server'

import SettlementShell from '../SettlementShell'
import MonthPicker from './MonthPicker'
import HistoryPrintButton from './HistoryPrintButton'

interface Props {
  searchParams: Promise<{ month?: string; from?: string; to?: string }>
}

export default async function SpecHistoryPage({ searchParams }: Props) {
  const { month: monthParam, from: fromParam, to: toParam } = await searchParams
  const { user, supabase } = await getSessionUser()
  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('memberships').select('organizations(id, name)').eq('user_id', user.id).single()

  const orgData = membership?.organizations
  const org = (Array.isArray(orgData) ? orgData[0] : orgData) as { id: string; name: string } | undefined
  if (!org) return (
    <SettlementShell orgName="" date="">
      <div className="text-gray-400 text-sm text-center py-16">업체 정보가 없습니다.</div>
    </SettlementShell>
  )

  const { data: restaurant } = await supabase
    .from('restaurants').select('id').eq('organization_id', org.id).single()

  const todayDate = new Date()
  const todayStr = todayDate.toISOString().split('T')[0]
  const fmt = (n: number) => `${n.toLocaleString()}원`
  const fmtWon = (n: number) => `₩ ${n.toLocaleString()}`

  let startDate: string, endDate: string, currentMonth: string, periodLabel: string
  const isWeekRange = !!(fromParam && toParam)

  if (fromParam && toParam) {
    startDate = fromParam
    endDate = toParam
    currentMonth = fromParam.slice(0, 7)
    periodLabel = `${fromParam} ~ ${toParam}`
  } else {
    currentMonth = monthParam ?? `${todayDate.getFullYear()}-${String(todayDate.getMonth() + 1).padStart(2, '0')}`
    const [year, mon] = currentMonth.split('-').map(Number)
    startDate = `${year}-${String(mon).padStart(2, '0')}-01`
    endDate = new Date(year ?? 2026, mon ?? 1, 0).toISOString().split('T')[0]
    periodLabel = currentMonth
  }

  const { data: specs } = restaurant
    ? await supabase
        .from('daily_specs').select('id, business_date, total_amount')
        .eq('restaurant_id', restaurant.id)
        .gte('business_date', startDate).lte('business_date', endDate)
        .order('business_date', { ascending: true })
    : { data: [] }

  // 주간 정산서용: 각 spec의 품목 lines 조회
  const specIds = (specs ?? []).map(s => s.id)
  type LineRow = { daily_spec_id: string; qty: number; unit: string; products: { standard_name: string } | null }
  let linesBySpec: Record<string, LineRow[]> = {}
  if (specIds.length > 0) {
    const { data: allLines } = await supabase
      .from('daily_spec_lines')
      .select('daily_spec_id, qty, unit, products(standard_name)')
      .in('daily_spec_id', specIds)
    for (const line of allLines ?? []) {
      const l = line as unknown as LineRow
      if (!linesBySpec[l.daily_spec_id]) linesBySpec[l.daily_spec_id] = []
      linesBySpec[l.daily_spec_id].push(l)
    }
  }

  // 품목 요약 텍스트: "콩나물 10봉 + 미나리 1박" 형식
  function summarizeLines(specId: string): string {
    const lines = linesBySpec[specId] ?? []
    if (!lines.length) return '-'
    return lines
      .map(l => {
        const name = l.products?.standard_name ?? '품목'
        const qtyStr = Number(l.qty) % 1 === 0 ? String(Number(l.qty)) : Number(l.qty).toFixed(1)
        return `${name} ${qtyStr}${l.unit}`
      })
      .join(' + ')
  }

  const totalAmount = (specs ?? []).reduce((s, sp) => s + Number(sp.total_amount), 0)

  // 이전 미수금: 이 기간 시작일 이전 due_date를 가진 미납 receivable 합산
  const { data: prevRecvs } = restaurant
    ? await supabase
        .from('receivables')
        .select('balance')
        .eq('restaurant_id', restaurant.id)
        .in('status', ['unpaid', 'partial', 'overdue'])
        .lt('due_date', startDate)
    : { data: [] }
  const prevOutstanding = (prevRecvs ?? []).reduce((s, r) => s + Number(r.balance), 0)
  const totalWithPrev = totalAmount + prevOutstanding

  // 프린트 제목 계산
  const [pYear, pMon, pDay] = startDate.split('-').map(Number)
  const weekNum = Math.ceil(pDay / 7)
  const printTitle = isWeekRange
    ? `${pMon}월 ${weekNum}주 발주 정산서`
    : `${pMon}월 발주 정산서`
  const printDate = `${pYear}.${pMon}.${Number(endDate.split('-')[2])}`

  return (
    <SettlementShell orgName={org.name} date={todayStr}>
      <style>{`
        .history-print-only { display: none; }
        @media print {
          * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          body * { visibility: hidden; }
          .history-print-only, .history-print-only * { visibility: visible; }
          .history-print-only {
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
          .history-print-only table { width: 100%; border-collapse: collapse; }
          .history-print-only td, .history-print-only th {
            border: 1px solid #000; padding: 4px 8px; font-size: 10pt;
          }
          @page { size: A4; margin: 10mm; }
        }
      `}</style>

      {/* ── 프린트 전용 주간 정산서 ── */}
      <div className="history-print-only">
        {/* 제목 */}
        <h2 style={{textAlign:'center', fontSize:'16pt', fontWeight:'bold', marginBottom:'5mm'}}>
          {printTitle}
        </h2>

        {/* 발행인 / 수신인 */}
        <table style={{width:'100%', borderCollapse:'collapse', marginBottom:'3mm', border:'none'}}>
          <tbody>
            <tr>
              <td style={{border:'none', width:'50%', verticalAlign:'bottom'}}>
                <div style={{borderBottom:'1px solid #000', paddingBottom:'2px', fontSize:'10pt'}}>
                  {printDate}
                </div>
              </td>
              <td style={{border:'none', width:'50%', textAlign:'right', fontSize:'10pt', lineHeight:'1.9'}}>
                <div>상호: 커넥티드 &nbsp; 성명: 김성호</div>
                <div>사업장 소재지: 인천 남동구 청능대로 559</div>
                <div>전화번호: 010-8680-5475</div>
              </td>
            </tr>
          </tbody>
        </table>

        {/* 수신인 */}
        <div style={{borderBottom:'1px solid #000', fontWeight:'bold', padding:'4px 0', marginBottom:'3mm', fontSize:'12pt'}}>
          {org.name} 귀하
        </div>
        <div style={{marginBottom:'4mm', fontSize:'10pt'}}>아래와 같이 계산합니다.</div>

        {/* 납품 내역 테이블 */}
        <table>
          <thead>
            <tr style={{backgroundColor:'#f5f5f5'}}>
              <th style={{width:'18%', textAlign:'center'}}>납품일자</th>
              <th style={{width:'12%', textAlign:'center'}}>품목종수</th>
              <th style={{width:'50%', textAlign:'center'}}>내용</th>
              <th style={{width:'20%', textAlign:'center', fontWeight:'bold'}}>금액</th>
            </tr>
          </thead>
          <tbody>
            {(specs ?? []).map(spec => {
              const lines = linesBySpec[spec.id] ?? []
              const [, sm, sd] = spec.business_date.split('-')
              const dateLabel = `${pYear}.${Number(sm)}.${Number(sd)}`
              return (
                <tr key={spec.id}>
                  <td style={{textAlign:'center'}}>{dateLabel}</td>
                  <td style={{textAlign:'center'}}>{lines.length}</td>
                  <td>{summarizeLines(spec.id)}</td>
                  <td style={{textAlign:'right', fontWeight:'bold'}}>{fmtWon(Number(spec.total_amount))}</td>
                </tr>
              )
            })}
            {/* 빈 줄 */}
            {Array.from({length: Math.max(0, 5 - (specs ?? []).length)}).map((_, i) => (
              <tr key={`e${i}`}>
                <td>&nbsp;</td><td></td><td></td>
                <td style={{textAlign:'right'}}>₩ -</td>
              </tr>
            ))}
            {/* 합계 */}
            <tr style={{backgroundColor:'#f9f9f9'}}>
              <td colSpan={3} style={{textAlign:'right', fontWeight:'bold'}}>합계</td>
              <td style={{textAlign:'right', fontWeight:'bold', fontSize:'11pt'}}>{fmtWon(totalAmount)}</td>
            </tr>
          </tbody>
        </table>

        {/* 기타사항 */}
        <table style={{marginTop:'3mm'}}>
          <tbody>
            <tr>
              <td style={{textAlign:'center', backgroundColor:'#f5f5f5', fontWeight:'bold'}} colSpan={1}>기타사항</td>
            </tr>
            <tr><td style={{height:'18mm', fontSize:'10pt', verticalAlign:'bottom', paddingBottom:'4px'}}>
              농협 302-1748-8091-81 차숙희(커넥티드)
            </td></tr>
          </tbody>
        </table>
      </div>

      {/* ── 화면 레이아웃 ── */}
      <div className="space-y-4 max-w-2xl">
        <div className="flex items-center justify-between">
          <MonthPicker value={currentMonth} />
          <div className="flex items-center gap-3">
            <div className="text-xs text-gray-400 text-right">
              <div>{periodLabel} 납품합계: <span className="font-semibold text-gray-700">{fmt(totalAmount)}</span></div>
              {prevOutstanding > 0 && (
                <>
                  <div>이전 미수금: <span className="font-semibold text-red-500">{fmt(prevOutstanding)}</span></div>
                  <div>최종 정산금액: <span className="font-bold text-red-700">{fmt(totalWithPrev)}</span></div>
                </>
              )}
            </div>
            {isWeekRange && (specs ?? []).length > 0 && (
              <HistoryPrintButton from={startDate} to={endDate} />
            )}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {(specs ?? []).length === 0 ? (
            <div className="py-16 text-center text-sm text-gray-400">{currentMonth} 명세서 내역이 없습니다</div>
          ) : (
            <>
              <div className="grid grid-cols-[auto_1fr_auto] gap-4 px-5 py-3 bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500">
                <span className="w-10 text-center">No</span>
                <span>날짜</span>
                <span className="w-28 text-right">금액</span>
              </div>
              <div className="divide-y divide-gray-100">
                {(specs ?? []).map((spec, idx) => (
                  <div key={spec.id} className="grid grid-cols-[auto_1fr_auto] gap-4 items-center px-5 py-3">
                    <span className="w-10 text-center text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded">
                      {idx + 1}
                    </span>
                    <div>
                      <Link
                        href={`/member/spec?date=${spec.business_date}`}
                        className="text-sm text-brand-600 font-medium bg-gray-100 px-3 py-1.5 rounded hover:bg-gray-200 transition-colors"
                      >
                        {spec.business_date}
                      </Link>
                      {linesBySpec[spec.id]?.length > 0 && (
                        <p className="text-xs text-gray-400 mt-1 px-1 truncate">
                          {summarizeLines(spec.id)}
                        </p>
                      )}
                    </div>
                    <span className="w-28 text-right text-sm text-gray-800 bg-gray-100 px-3 py-1.5 rounded">
                      {fmt(Number(spec.total_amount))}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </SettlementShell>
  )
}
