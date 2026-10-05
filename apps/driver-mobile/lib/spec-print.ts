import { getKstToday } from './format'
import { priceStatusPrintText, type SpecPriceStatus } from './price-status'

export type PrintableSpec = {
    id: string
    restaurantName: string
    businessDate: string
    totalAmount: number
    previousOutstanding: number
    outstanding: number
    priceStatus?: SpecPriceStatus | null
    itemCount: number
    lines: Array<{ id: string; productName: string; qty: number; unit: string; unitPrice: number; amount: number }>
}

export function createSpecHtml(spec: PrintableSpec) {
  const printStatus = priceStatusPrintText(spec.priceStatus)
  const [, month, day] = spec.businessDate.split('-')
  const printDateLabel = `${Number(month)}월 ${Number(day)}일`
  const rows = spec.lines.map((line) => `
    <tr>
      <td>${escapeHtml(line.productName)}</td>
      <td class="center">${formatQty(line.qty)} ${escapeHtml(line.unit)}</td>
      <td class="right">₩ ${formatNumber(line.unitPrice)}</td>
      <td class="right strong">₩ ${formatNumber(line.amount)}</td>
    </tr>
  `).join('')
  const emptyRows = Array.from({ length: Math.max(0, 3 - spec.lines.length) }, () => `
    <tr><td>&nbsp;</td><td></td><td></td><td class="right">₩ -</td></tr>
  `).join('')

  return `<!DOCTYPE html>
  <html lang="ko">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <style>
        @page { size: A4; margin: 10mm; }
        * { box-sizing: border-box; }
        body { margin: 0; padding: 10mm; color: #000; background: #fff; font-family: Arial, "Malgun Gothic", sans-serif; font-size: 11pt; }
        h2 { margin: 0 0 6mm; text-align: center; font-size: 16pt; }
        .price-status { text-align: center; font-size: 10pt; font-weight: bold; border: 1px solid #000; padding: 3px 0; margin: -3mm 0 4mm; }
        table { width: 100%; border-collapse: collapse; }
        td, th { border: 1px solid #000; padding: 4px 8px; font-size: 10pt; }
        .info td { border: 0; line-height: 1.8; }
        .recipient { margin-bottom: 3mm; padding: 4px 0; border-bottom: 1px solid #000; font-size: 12pt; font-weight: 700; }
        .sub { margin-bottom: 4mm; font-size: 10pt; }
        .bg { background: #f0f0f0; }
        .center { text-align: center; }
        .right { text-align: right; }
        .strong { font-weight: 700; }
        .summary { margin-top: 2mm; }
        .summary td:first-child { width: 60%; border: 0; }
        .memo { margin-top: 3mm; }
      </style>
    </head>
    <body>
      <h2>${printDateLabel} 발주 명세표</h2>
      ${printStatus ? `<p class="price-status">${escapeHtml(printStatus)}</p>` : ''}
      <table class="info">
        <tbody>
          <tr>
            <td style="width:50%;border-bottom:1px solid #000;padding-bottom:3px">${spec.businessDate}</td>
            <td style="width:50%;text-align:right;vertical-align:top">
              상호: 커넥티드 &nbsp; 성명: 김성호<br />
              사업장 소재지: 인천 남동구 청능대로 559<br />
              전화번호: 010-8680-5475
            </td>
          </tr>
        </tbody>
      </table>
      <div class="recipient">${escapeHtml(spec.restaurantName)} 귀하</div>
      <div class="sub">아래와 같이 계산합니다.</div>
      <table>
        <thead>
          <tr>
            <th class="bg" style="width:38%">품목명</th>
            <th class="bg" style="width:18%">수량</th>
            <th class="bg" style="width:18%">단가</th>
            <th class="bg" style="width:26%">공급가</th>
          </tr>
        </thead>
        <tbody>${rows}${emptyRows}</tbody>
      </table>
      <table class="summary">
        <tbody>
          <tr><td></td><td class="bg center strong">합계</td><td class="right strong">₩ ${formatNumber(spec.totalAmount)}</td></tr>
          ${spec.businessDate === getKstToday() ? `<tr><td></td><td class="bg center">전일미수금</td><td class="right strong">₩ ${formatNumber(spec.previousOutstanding)}</td></tr>` : ''}
          <tr><td></td><td class="bg center">${spec.businessDate === getKstToday() ? '금일미수금' : '조회 시점 미수금'}</td><td class="right strong">₩ ${formatNumber(spec.outstanding)}</td></tr>
        </tbody>
      </table>
      <table class="memo">
        <tbody>
          <tr><td class="bg center strong">기타사항</td></tr>
          <tr><td style="height:20mm">&nbsp;</td></tr>
        </tbody>
      </table>
    </body>
  </html>`
}

function formatQty(qty: number) {
  return Number.isInteger(qty) ? String(qty) : String(Number(qty.toFixed(1)))
}

function formatNumber(value: number) {
  return Number(value ?? 0).toLocaleString('ko-KR')
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}
