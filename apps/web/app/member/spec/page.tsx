export const runtime = 'edge'

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/supabase/server'
import SettlementShell from '../settlement/SettlementShell'
import { PayButton, PrintButton } from './SpecActions'
import DeleteSpecLineButton from './DeleteSpecLineButton'

interface Props {
  searchParams: Promise<{ date?: string }>
}

export default async function MemberSpecPage({ searchParams }: Props) {
  const { date: dateParam } = await searchParams
  const { user, supabase } = await getSessionUser()
  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('memberships').select('organizations(id, name)').eq('user_id', user.id).single()
  const orgData = membership?.organizations
  const org = (Array.isArray(orgData) ? orgData[0] : orgData) as { id: string; name: string } | undefined

  if (!org) return (
    <SettlementShell orgName="" date="">
      <div className="flex items-center justify-center h-64 text-gray-400 text-sm">업체 정보가 없습니다.</div>
    </SettlementShell>
  )

  const today = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().split('T')[0]
  const targetDate = dateParam ?? today
  const fmt = (n: number) => `${n.toLocaleString()}원`

  const { data: restaurant } = await supabase
    .from('restaurants').select('id').eq('organization_id', org.id).single()

  if (!restaurant) return (
    <SettlementShell orgName={org.name} date={targetDate}>
      <div className="flex items-center justify-center h-64 text-gray-400 text-sm">식당 정보가 없습니다.</div>
    </SettlementShell>
  )

  const { data: spec } = await supabase
    .from('daily_specs')
    .select('id, total_amount, business_date')
    .eq('restaurant_id', restaurant.id)
    .eq('business_date', targetDate)
    .maybeSingle()

  type SpecLine = { id: string; product_id: string; qty: number; unit: string; unit_price: number; amount: number; products: { standard_name: string } }
  let lines: SpecLine[] = []
  if (spec) {
    const { data } = await supabase
      .from('daily_spec_lines')
      .select('id, product_id, qty, unit, unit_price, amount, products(standard_name)')
      .eq('daily_spec_id', spec.id)
    lines = (data ?? []) as unknown as SpecLine[]
  }

  const total = lines.reduce((sum, l) => sum + Number(l.amount ?? 0), 0)

  const { data: receivables } = await supabase
    .from('receivables')
    .select('balance')
    .eq('restaurant_id', restaurant.id)
    .in('status', ['unpaid', 'partial', 'overdue'])

  const totalOutstanding = (receivables ?? []).reduce((sum, r) => sum + Number(r.balance), 0)
  const isPaid = totalOutstanding === 0
  const prevOutstanding = Math.max(0, totalOutstanding - total)

  const [, mm, dd] = targetDate.split('-')
  const dateLabel = `${Number(mm)}월 ${Number(dd)}일`

  return (
    <SettlementShell orgName={org.name} date={targetDate}>
      <style>{`
        .spec-print-only { display: none; }
        @media print {
          * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          body * { visibility: hidden; }
          .spec-print-only, .spec-print-only * { visibility: visible; }
          .spec-print-only {
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
          .spec-print-only table { width: 100%; border-collapse: collapse; }
          .spec-print-only td, .spec-print-only th {
            border: 1px solid #000; padding: 3px 6px; font-size: 10pt;
          }
          @page { size: A4; margin: 10mm; }
        }
      `}</style>

      {/* 프린트 전용 레이아웃 */}
      <div className="spec-print-only">
        <h2 style={{ textAlign: 'center', fontSize: '16pt', fontWeight: 'bold', marginBottom: '4mm' }}>
          {dateLabel} 발주 명세표
        </h2>
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '3mm', border: 'none' }}>
          <tbody>
            <tr>
              <td style={{ border: 'none', width: '55%', verticalAlign: 'bottom' }}>
                <div style={{ borderBottom: '1px solid #000', paddingBottom: '2px', fontSize: '10pt' }}>{targetDate}</div>
              </td>
              <td style={{ border: 'none', width: '45%', textAlign: 'right', fontSize: '10pt', lineHeight: '1.8' }}>
                <div>상호: 커넥티드 &nbsp; 성명: 김성호</div>
                <div>사업장 소재지: 인천광역시 남동구 논고개로123번길 35</div>
                <div>전화번호: 010-8680-5475</div>
              </td>
            </tr>
          </tbody>
        </table>
        <div style={{ borderBottom: '1px solid #000', fontWeight: 'bold', padding: '3px 0', marginBottom: '2mm', fontSize: '11pt' }}>
          {org.name} 귀하
        </div>
        <div style={{ marginBottom: '3mm', fontSize: '10pt' }}>아래와 같이 계산합니다.</div>
        <table>
          <thead>
            <tr style={{ backgroundColor: '#f5f5f5' }}>
              <th style={{ width: '38%', textAlign: 'center' }}>품목명</th>
              <th style={{ width: '18%', textAlign: 'center' }}>수량</th>
              <th style={{ width: '18%', textAlign: 'center' }}>단가</th>
              <th style={{ width: '26%', textAlign: 'center', fontWeight: 'bold' }}>공급가</th>
            </tr>
          </thead>
          <tbody>
            {lines.map(l => {
              const qtyDisplay = Number(l.qty) % 1 === 0 ? Number(l.qty) : Number(l.qty).toFixed(1)
              return (
                <tr key={l.id}>
                  <td>{l.products.standard_name}</td>
                  <td style={{ textAlign: 'center' }}>{qtyDisplay} {l.unit}</td>
                  <td style={{ textAlign: 'right' }}>₩ {Number(l.unit_price).toLocaleString()}</td>
                  <td style={{ textAlign: 'right', fontWeight: 'bold' }}>₩ {Number(l.amount ?? 0).toLocaleString()}</td>
                </tr>
              )
            })}
            {lines.length < 3 && <tr key="pad-1"><td>&nbsp;</td><td /><td /><td style={{ textAlign: 'right' }}>₩ -</td></tr>}
            {lines.length < 2 && <tr key="pad-2"><td>&nbsp;</td><td /><td /><td style={{ textAlign: 'right' }}>₩ -</td></tr>}
            {lines.length < 1 && <tr key="pad-3"><td>&nbsp;</td><td /><td /><td style={{ textAlign: 'right' }}>₩ -</td></tr>}
          </tbody>
        </table>
        <table style={{ marginTop: '2mm' }}>
          <tbody>
            <tr>
              <td style={{ width: '74%', border: 'none' }} />
              <td style={{ textAlign: 'center', backgroundColor: '#f5f5f5' }}>합계</td>
              <td style={{ textAlign: 'right', fontWeight: 'bold' }}>₩ {total.toLocaleString()}</td>
            </tr>
            <tr>
              <td style={{ border: 'none' }} />
              <td style={{ textAlign: 'center', backgroundColor: '#f5f5f5' }}>전일미수금</td>
              <td style={{ textAlign: 'right', fontWeight: 'bold' }}>₩ {prevOutstanding.toLocaleString()}</td>
            </tr>
            <tr>
              <td style={{ border: 'none' }} />
              <td style={{ textAlign: 'center', backgroundColor: '#f5f5f5' }}>금일미수금</td>
              <td style={{ textAlign: 'right', fontWeight: 'bold', color: totalOutstanding > 0 ? '#cc0000' : 'inherit' }}>
                ₩ {totalOutstanding.toLocaleString()}
              </td>
            </tr>
          </tbody>
        </table>
        <table style={{ marginTop: '3mm' }}>
          <tbody>
            <tr><td style={{ textAlign: 'center', backgroundColor: '#f5f5f5', fontWeight: 'bold', width: '100%' }} colSpan={1}>기타사항</td></tr>
            <tr><td style={{ height: '20mm' }}>&nbsp;</td></tr>
          </tbody>
        </table>
      </div>

      {/* 화면 레이아웃 */}
      <div className="space-y-4 max-w-2xl">
        {dateParam && dateParam !== today && (
          <div className="flex items-center gap-2 no-print">
            <Link href="/member/spec" className="text-sm text-gray-400 hover:text-gray-600">← 오늘로</Link>
            <span className="text-sm font-semibold text-gray-700">{targetDate} 명세서</span>
          </div>
        )}

        {lines.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 py-16 text-center text-gray-400 text-sm">
            {targetDate} 납품 내역이 없습니다
          </div>
        ) : (
          <>
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="grid grid-cols-[2fr_1fr_1fr_1fr] gap-2 px-5 py-3 bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500">
                <span>품목</span>
                <span className="text-center">수량</span>
                <span className="text-center">단가</span>
                <span className="text-right">금액</span>
              </div>
              <div className="divide-y divide-gray-100">
                {lines.map(line => {
                  const isToday = targetDate === today
                  const qtyDisplay = Number(line.qty) % 1 === 0 ? Number(line.qty) : Number(line.qty).toFixed(1)
                  return (
                    <div key={line.id} className="grid grid-cols-[2fr_1fr_1fr_1fr] gap-2 items-center px-5 py-3">
                      <div className="flex items-center gap-1 min-w-0">
                        <span className="text-sm text-gray-800 bg-gray-100 px-2 py-1 rounded truncate">
                          {line.products.standard_name}
                        </span>
                        {isToday && spec && (
                          <DeleteSpecLineButton lineId={line.id} specId={spec.id} productName={line.products.standard_name} />
                        )}
                      </div>
                      <span className="text-sm text-gray-700 bg-gray-100 px-2 py-1 rounded text-center">
                        {qtyDisplay} {line.unit}
                      </span>
                      <span className="text-sm text-gray-700 bg-gray-100 px-2 py-1 rounded text-center">
                        {Number(line.unit_price).toLocaleString()}
                      </span>
                      <span className="text-sm text-gray-800 bg-gray-100 px-2 py-1 rounded text-right">
                        {Number(line.amount ?? 0).toLocaleString()}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="divide-y divide-gray-100">
                <div className="flex items-center justify-between px-5 py-3">
                  <span className="text-sm text-gray-600">합계금액:</span>
                  <span className="text-sm font-semibold text-gray-800 bg-gray-100 px-4 py-1.5 rounded min-w-28 text-right">
                    {fmt(total)}
                  </span>
                </div>
                <div className="flex items-center justify-between px-5 py-3">
                  <span className="text-sm text-gray-600">누적 미수금:</span>
                  <div className="flex items-center gap-3">
                    <span className={`text-sm font-semibold bg-gray-100 px-4 py-1.5 rounded min-w-28 text-right ${totalOutstanding > 0 ? 'text-red-600' : 'text-gray-800'}`}>
                      {fmt(totalOutstanding)}
                    </span>
                    <span className="no-print">
                      <PayButton disabled={isPaid} amount={totalOutstanding} orderName="미수금 결제" refType="receivable" />
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex gap-3 pt-1">
              <PrintButton date={targetDate} />
              <Link
                href="/member/order-confirm"
                className="flex-1 text-center rounded-lg bg-brand-600 text-white px-5 py-2.5 text-sm font-semibold hover:bg-brand-700"
              >
                확인
              </Link>
            </div>
          </>
        )}
      </div>
    </SettlementShell>
  )
}
