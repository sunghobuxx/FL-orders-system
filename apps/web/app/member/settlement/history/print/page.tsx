export const runtime = 'edge'

import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/supabase/server'
import AutoPrint from '../../../spec/print/AutoPrint'

interface Props {
  searchParams: Promise<{ from?: string; to?: string }>
}

export default async function WeeklyPrintPage({ searchParams }: Props) {
  const { from: fromParam, to: toParam } = await searchParams
  const { user, supabase } = await getSessionUser()
  if (!user) redirect('/login')

  if (!fromParam || !toParam) return <div>기간을 지정해주세요</div>

  const { data: membership } = await supabase
    .from('memberships').select('organizations(id, name)').eq('user_id', user.id).single()
  const orgData = membership?.organizations
  const org = (Array.isArray(orgData) ? orgData[0] : orgData) as { id: string; name: string } | undefined
  if (!org) return <div>업체 정보 없음</div>

  const { data: restaurant } = await supabase
    .from('restaurants').select('id').eq('organization_id', org.id).single()
  if (!restaurant) return <div>식당 정보 없음</div>

  const { data: specs } = await supabase
    .from('daily_specs').select('id, business_date, total_amount')
    .eq('restaurant_id', restaurant.id)
    .gte('business_date', fromParam).lte('business_date', toParam)
    .order('business_date', { ascending: true })

  const specIds = (specs ?? []).map(s => s.id)
  type LineRow = { daily_spec_id: string; qty: number; unit: string; products: { standard_name: string } | null }
  const linesBySpec: Record<string, LineRow[]> = {}
  if (specIds.length > 0) {
    const { data: allLines } = await supabase
      .from('daily_spec_lines').select('daily_spec_id, qty, unit, products(standard_name)')
      .in('daily_spec_id', specIds)
    for (const line of allLines ?? []) {
      const l = line as unknown as LineRow
      if (!linesBySpec[l.daily_spec_id]) linesBySpec[l.daily_spec_id] = []
      linesBySpec[l.daily_spec_id].push(l)
    }
  }

  function summarize(specId: string) {
    const lines = linesBySpec[specId] ?? []
    if (!lines.length) return '-'
    return lines.map(l => {
      const name = l.products?.standard_name ?? '품목'
      const q = Number(l.qty) % 1 === 0 ? Number(l.qty) : Number(l.qty).toFixed(1)
      return `${name} ${q}${l.unit}`
    }).join(' + ')
  }

  const totalAmount = (specs ?? []).reduce((s, sp) => s + Number(sp.total_amount), 0)

  // 제목
  const [pYear, pMon, pDay] = fromParam.split('-').map(Number)
  const weekNum = Math.ceil(pDay / 7)
  const printTitle = `${pMon}월 ${weekNum}주 발주 정산서`
  const endDay = Number(toParam.split('-')[2])
  const printDate = `${pYear}.${pMon}.${endDay}`

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
        .th-bg { background-color: #f0f0f0; }
        @media print { @page { size: A4; margin: 10mm; } }
      `}</style>

      <h2>{printTitle}</h2>

      <table style={{marginBottom:'3mm'}}>
        <tbody>
          <tr>
            <td style={{width:'50%', border:'none', borderBottom:'1px solid #000', paddingBottom:'3px'}}>{printDate}</td>
            <td style={{width:'50%', border:'none', textAlign:'right', fontSize:'10pt', lineHeight:'1.9'}}>
              상호: 커넥티드 &nbsp; 성명: 김성호<br/>
              사업장 소재지: 인천 남동구 청능대로 559<br/>
              전화번호: 010-8680-5475
            </td>
          </tr>
        </tbody>
      </table>

      <div style={{borderBottom:'1px solid #000', fontWeight:'bold', fontSize:'12pt', padding:'4px 0', marginBottom:'3mm'}}>
        {org.name} 귀하
      </div>
      <div style={{fontSize:'10pt', marginBottom:'4mm'}}>아래와 같이 계산합니다.</div>

      <table>
        <thead>
          <tr>
            <th className="th-bg" style={{width:'18%', textAlign:'center'}}>납품일자</th>
            <th className="th-bg" style={{width:'12%', textAlign:'center'}}>품목종수</th>
            <th className="th-bg" style={{width:'50%', textAlign:'center'}}>내용</th>
            <th className="th-bg" style={{width:'20%', textAlign:'center'}}>금액</th>
          </tr>
        </thead>
        <tbody>
          {(specs ?? []).map(spec => {
            const [,sm,sd] = spec.business_date.split('-')
            const lines = linesBySpec[spec.id] ?? []
            return (
              <tr key={spec.id}>
                <td style={{textAlign:'center'}}>{pYear}.{Number(sm)}.{Number(sd)}</td>
                <td style={{textAlign:'center'}}>{lines.length}</td>
                <td>{summarize(spec.id)}</td>
                <td style={{textAlign:'right', fontWeight:'bold'}}>₩ {Number(spec.total_amount).toLocaleString()}</td>
              </tr>
            )
          })}
          {Array.from({length: Math.max(0, 5 - (specs ?? []).length)}).map((_, i) => (
            <tr key={`e${i}`}><td>&nbsp;</td><td></td><td></td><td style={{textAlign:'right'}}>₩ -</td></tr>
          ))}
          <tr>
            <td colSpan={3} style={{textAlign:'right', fontWeight:'bold', backgroundColor:'#f9f9f9'}}>합계</td>
            <td style={{textAlign:'right', fontWeight:'bold', fontSize:'11pt'}}>₩ {totalAmount.toLocaleString()}</td>
          </tr>
        </tbody>
      </table>

      <table style={{marginTop:'3mm'}}>
        <tbody>
          <tr><td className="th-bg" style={{textAlign:'center', fontWeight:'bold'}}>기타사항</td></tr>
          <tr><td style={{height:'18mm', fontSize:'10pt', verticalAlign:'bottom', paddingBottom:'4px'}}>
            농협 302-1748-8091-81 차숙희(커넥티드)
          </td></tr>
        </tbody>
      </table>
    </>
  )
}
