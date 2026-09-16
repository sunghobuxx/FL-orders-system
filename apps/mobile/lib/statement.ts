export type StatementLine = { id: string; specId: string; name: string; qty: number; unit: string; unitPrice: number; amount: number }
export type StatementSpec = { id: string; business_date: string; total_amount: number }
export type SettlementData = {
  organizationName: string; today: string; date: string; from: string; to: string; cycle: string;
  outstanding: number; previousOutstanding: number; selectedSpec: StatementSpec | null;
  periods: Array<{ key: string; start: string; end: string; total: number; outstanding: number; billed: boolean; specs: StatementSpec[] }>;
  lines: StatementLine[];
}
const escape = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
export function statementHtml(name: string, specs: StatementSpec[], lines: StatementLine[], outstanding: number) {
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>body{font-family:Arial,sans-serif;padding:24px;color:#111}table{border-collapse:collapse;width:100%;margin:20px 0}th,td{border:1px solid #ddd;padding:8px;text-align:right}td:first-child,th:first-child{text-align:left}h2{margin-top:24px}tr{page-break-inside:avoid}</style></head><body><h1>납품 명세서</h1><h2>${escape(name)}</h2>${specs.map(spec => `<h2>${escape(spec.business_date)}</h2><table><thead><tr><th>품목</th><th>수량</th><th>단가</th><th>금액</th></tr></thead><tbody>${lines.filter(l => l.specId === spec.id).map(l => `<tr><td>${escape(l.name)}</td><td>${escape(l.qty)} ${escape(l.unit)}</td><td>${l.unitPrice.toLocaleString()}원</td><td>${l.amount.toLocaleString()}원</td></tr>`).join('')}</tbody></table><p>납품 합계: ${Number(spec.total_amount).toLocaleString()}원</p>`).join('')}<p>조회 시점 미수금: ${outstanding.toLocaleString()}원</p></body></html>`
}
