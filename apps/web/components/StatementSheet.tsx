/**
 * 정산서 양식 한 장.
 *
 * 어드민 인쇄 화면과 거래처가 문자로 받는 링크 화면이 **같은 양식**을 쓰도록 여기 모은다.
 * 예전에는 둘이 따로 만들어져 있어서, 종이에는 있는 상호·품목 내용·계좌 안내가
 * 문자로 받는 화면에는 없었다. 보고 바로 입금하라고 보내는 화면인데 계좌가 없었다.
 *
 * 데이터는 받아서 그리기만 한다. db 를 건드리지 않는다 — 두 화면이 각자 다른 방식으로
 * 모아 온 값을 넣을 수 있어야 한다.
 *
 * 스타일은 `.stmt-sheet` 안으로 한정한다. 인쇄 화면은 전역 CSS 로 A4 를 잡고 있어서
 * 여기서 전역을 또 건드리면 서로 어긋난다.
 */

export interface StatementSheetRow {
  key: string
  /** "2026.7.16" 처럼 이미 다듬은 문자열 */
  date: string
  itemCount: number
  /** "꽃상추 1box + 곱슬이 1box" */
  summary: string
  amount: number
}

export interface StatementSheetProps {
  title: string
  /** 발행일. "2026.7.31" */
  issuedOn: string
  orgName: string
  rows: StatementSheetRow[]
  /** 당기 합계 */
  totalAmount: number
  /** 이전 미수금 */
  carryover: number
  /** 이번 정산서에 이미 들어온 금액 */
  paidAmount: number
  /** 이번 정산서의 남은 미수금 */
  outstandingAmount: number
  /** 이전 미수금까지 더한 받을 금액 */
  totalDue: number
  /** 종이 균형을 위해 빈 줄을 채운다. 링크 화면에서는 0 */
  minRows?: number
}

const fmtWon = (n: number) => `₩ ${Math.round(Number(n ?? 0)).toLocaleString('ko-KR')}`

export default function StatementSheet({
  title, issuedOn, orgName, rows,
  totalAmount, carryover, paidAmount, outstandingAmount, totalDue,
  minRows = 0,
}: StatementSheetProps) {
  const filler = Math.max(0, minRows - rows.length)

  return (
    <div className="stmt-sheet">
      <style>{`
        .stmt-sheet { font-family: 'Malgun Gothic', '맑은 고딕', Arial, sans-serif; color: #000; }
        .stmt-sheet h2 { text-align: center; font-size: 16pt; font-weight: bold; margin: 0 0 6mm; }
        .stmt-sheet table { width: 100%; border-collapse: collapse; }
        .stmt-sheet td, .stmt-sheet th { border: 1px solid #000; padding: 4px 8px; font-size: 10pt; }
        .stmt-sheet .no-b td { border: none; }
      `}</style>

      <h2>{title}</h2>

      <table className="no-b" style={{ marginBottom: '3mm' }}>
        <tbody>
          <tr>
            <td style={{ width: '50%', borderBottom: '1px solid #000', paddingBottom: '3px' }}>{issuedOn}</td>
            <td style={{ width: '50%', textAlign: 'right', fontSize: '10pt', lineHeight: 1.9 }}>
              상호: 커넥티드 &nbsp; 성명: 김성호<br />
              사업장 소재지: 인천 남동구 청능대로 559<br />
              전화번호: 010-8680-5475
            </td>
          </tr>
        </tbody>
      </table>

      <div style={{ borderBottom: '1px solid #000', fontWeight: 'bold', fontSize: '12pt', padding: '4px 0', marginBottom: '3mm' }}>
        {orgName} 귀하
      </div>
      <div style={{ fontSize: '10pt', marginBottom: '4mm' }}>아래와 같이 계산합니다.</div>

      <table>
        <thead>
          <tr style={{ backgroundColor: '#f0f0f0' }}>
            <th style={{ width: '18%', textAlign: 'center' }}>납품일자</th>
            <th style={{ width: '10%', textAlign: 'center' }}>품목수</th>
            <th style={{ width: '52%', textAlign: 'center' }}>내용</th>
            <th style={{ width: '20%', textAlign: 'center' }}>금액</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.key}>
              <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>{r.date}</td>
              <td style={{ textAlign: 'center' }}>{r.itemCount}</td>
              <td style={{ fontSize: '9pt' }}>{r.summary}</td>
              <td style={{ textAlign: 'right', fontWeight: 'bold', whiteSpace: 'nowrap' }}>{fmtWon(r.amount)}</td>
            </tr>
          ))}
          {Array.from({ length: filler }).map((_, i) => (
            <tr key={`e${i}`}><td>&nbsp;</td><td></td><td></td><td style={{ textAlign: 'right' }}>₩ -</td></tr>
          ))}

          <tr style={{ backgroundColor: '#f9f9f9' }}>
            <td colSpan={3} style={{ textAlign: 'right', fontWeight: 'bold' }}>당기 합계</td>
            <td style={{ textAlign: 'right', fontWeight: 'bold', fontSize: '11pt', whiteSpace: 'nowrap' }}>{fmtWon(totalAmount)}</td>
          </tr>
          {carryover > 0 && (
            <tr style={{ backgroundColor: '#fffbf0' }}>
              <td colSpan={3} style={{ textAlign: 'right', fontWeight: 'bold', color: '#b45309' }}>이전 미수금</td>
              <td style={{ textAlign: 'right', fontWeight: 'bold', color: '#b45309', whiteSpace: 'nowrap' }}>{fmtWon(carryover)}</td>
            </tr>
          )}
          {paidAmount > 0 && (
            <tr>
              <td colSpan={3} style={{ textAlign: 'right', color: '#555' }}>납부액</td>
              <td style={{ textAlign: 'right', color: '#555', whiteSpace: 'nowrap' }}>{fmtWon(paidAmount)}</td>
            </tr>
          )}
          <tr style={{ backgroundColor: '#fff5f5' }}>
            <td colSpan={3} style={{ textAlign: 'right', fontWeight: 'bold', color: '#cc0000' }}>미수금</td>
            <td style={{ textAlign: 'right', fontWeight: 'bold', color: '#cc0000', fontSize: '12pt', whiteSpace: 'nowrap' }}>{fmtWon(outstandingAmount)}</td>
          </tr>
          {carryover > 0 && (
            <tr style={{ backgroundColor: '#fff5f5' }}>
              <td colSpan={3} style={{ textAlign: 'right', fontWeight: 'bold', color: '#cc0000' }}>받을 금액</td>
              <td style={{ textAlign: 'right', fontWeight: 'bold', color: '#cc0000', fontSize: '13pt', whiteSpace: 'nowrap' }}>{fmtWon(totalDue)}</td>
            </tr>
          )}
        </tbody>
      </table>

      <table style={{ marginTop: '4mm' }}>
        <tbody>
          <tr>
            <td style={{ backgroundColor: '#f0f0f0', textAlign: 'center', fontWeight: 'bold', width: '30%' }}>입금 계좌 안내</td>
            <td style={{ fontSize: '10pt', lineHeight: 1.8, padding: '6px 10px' }}>
              농협 302-1748-8091-81 &nbsp;|&nbsp; 예금주: 차숙희(커넥티드)<br />
              문의: 010-8680-5475 (김성호)
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}
