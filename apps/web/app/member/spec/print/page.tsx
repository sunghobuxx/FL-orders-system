export const runtime = 'edge'

import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/supabase/server'
import AutoPrint from './AutoPrint'

interface Props {
  searchParams: Promise<{ date?: string; type?: string }>
}

export default async function SpecPrintPage({ searchParams }: Props) {
  const { date: dateParam, type } = await searchParams
  const { user, supabase } = await getSessionUser()
  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('memberships').select('organizations(id, name)').eq('user_id', user.id).single()
  const orgData = membership?.organizations
  const org = (Array.isArray(orgData) ? orgData[0] : orgData) as { id: string; name: string } | undefined
  if (!org) return <div>업체 정보 없음</div>

  const { data: restaurant } = await supabase
    .from('restaurants').select('id').eq('organization_id', org.id).single()
  if (!restaurant) return <div>식당 정보 없음</div>

  const today = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().split('T')[0]
  const targetDate = dateParam ?? today

  const { data: spec } = await supabase
    .from('daily_specs').select('id, total_amount, business_date')
    .eq('restaurant_id', restaurant.id).eq('business_date', targetDate).maybeSingle()

  type SpecLine = { id: string; qty: number; unit: string; unit_price: number; amount: number; products: { standard_name: string } }
  let lines: SpecLine[] = []
  if (spec) {
    const { data: rawLines } = await supabase
      .from('daily_spec_lines').select('id, qty, unit, unit_price, amount, products(standard_name)')
      .eq('daily_spec_id', spec.id)
    lines = (rawLines ?? []) as unknown as SpecLine[]
  }

  const totalAmount = lines.reduce((s, l) => s + Number(l.amount ?? 0), 0)

  // 미수금
  const { data: receivable } = await supabase
    .from('receivables').select('balance, status')
    .eq('restaurant_id', restaurant.id)
    .in('status', ['unpaid', 'partial', 'overdue'])
    .order('due_date').limit(1).maybeSingle()
  const outstanding = Number(receivable?.balance ?? 0)
  const prevOutstanding = Math.max(0, outstanding - totalAmount)

  // 날짜 포맷
  const [, pM, pD] = targetDate.split('-')
  const printDateLabel = `${Number(pM)}월 ${Number(pD)}일`

  return (
    <>
      <AutoPrint />
      <style>{`
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Malgun Gothic', '맑은 고딕', Arial, sans-serif; font-size: 11pt; padding: 10mm; background: white; }
        table { width: 100%; border-collapse: collapse; }
        td, th { border: 1px solid #000; padding: 4px 8px; font-size: 10pt; }
        .no-border td { border: none; }
        h2 { text-align: center; font-size: 16pt; font-weight: bold; margin-bottom: 6mm; }
        .info-table { margin-bottom: 3mm; }
        .info-table td { border: none; font-size: 10pt; line-height: 1.8; }
        .recipient { border-bottom: 1px solid #000; font-weight: bold; font-size: 12pt; padding: 4px 0; margin-bottom: 3mm; }
        .sub { font-size: 10pt; margin-bottom: 4mm; }
        .th-bg { background-color: #f0f0f0; }
        .total-row td { font-weight: bold; }
        .memo { margin-top: 3mm; }
        @media print { @page { size: A4; margin: 10mm; } }
      `}</style>

      <h2>{printDateLabel} 발주 명세표</h2>

      <table className="info-table">
        <tbody>
          <tr>
            <td style={{width:'50%', borderBottom:'1px solid #000', paddingBottom:'3px'}}>{targetDate}</td>
            <td style={{width:'50%', textAlign:'right', verticalAlign:'top'}}>
              상호: 커넥티드 &nbsp; 성명: 김성호<br/>
              사업장 소재지: 인천 남동구 청능대로 559<br/>
              전화번호: 010-8680-5475
            </td>
          </tr>
        </tbody>
      </table>

      <div className="recipient">{org.name} 귀하</div>
      <div className="sub">아래와 같이 계산합니다.</div>

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
          <tr className="total-row">
            <td style={{width:'74%', border:'none'}}></td>
            <td className="th-bg" style={{textAlign:'center'}}>합계</td>
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

      <table className="memo" style={{marginTop:'3mm'}}>
        <tbody>
          <tr><td className="th-bg" style={{textAlign:'center', fontWeight:'bold'}}>기타사항</td></tr>
          <tr><td style={{height:'20mm'}}>&nbsp;</td></tr>
        </tbody>
      </table>
    </>
  )
}
