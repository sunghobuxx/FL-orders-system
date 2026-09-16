// Mirrors member/dashboard/page.tsx: latest delivery's highest-amount line,
// fourteen calendar days of carried-forward prices, and that product's totals.
export type DashboardLine = {
  daily_spec_id: string; product_id: string; qty: number | null; unit: string | null;
  unit_price: number | null; amount: number | null;
  products: { standard_name: string } | { standard_name: string }[] | null;
}
export type DashboardSpec = { id: string; business_date: string; total_amount: number | null }
export type DashboardSnapshot = { sale_price: number; unit?: string | null; effective_from: string }
export function productName(line: DashboardLine) {
  const product = Array.isArray(line.products) ? line.products[0] : line.products
  return product?.standard_name ?? '최근 납품'
}
export function latestDashboardLine(specs: DashboardSpec[], lines: DashboardLine[]) {
  for (const spec of [...specs].sort((a, b) => b.business_date.localeCompare(a.business_date))) {
    const line = lines.filter(l => l.daily_spec_id === spec.id).sort((a, b) => Number(b.amount) - Number(a.amount))[0]
    if (line) return line
  }
  return null
}
export function buildDashboardTrend(specs: DashboardSpec[], lines: DashboardLine[], snapshots: DashboardSnapshot[], start: string, today: string) {
  const latest = latestDashboardLine(specs, lines)
  if (!latest) return null
  const sorted = snapshots.filter(s => s.effective_from <= today).sort((a, b) => a.effective_from.localeCompare(b.effective_from))
  const points: Array<{ date: string; value: number }> = []
  for (let t = Date.parse(`${start}T00:00:00Z`); t <= Date.parse(`${today}T00:00:00Z`); t += 86400000) {
    const date = new Date(t).toISOString().slice(0, 10)
    const snapshot = [...sorted].reverse().find(s => s.effective_from <= date)
    const spec = specs.find(s => s.business_date === date)
    const line = spec ? lines.filter(l => l.daily_spec_id === spec.id).sort((a, b) => Number(b.amount) - Number(a.amount))[0] : null
    const value = Number(snapshot?.sale_price ?? line?.unit_price ?? spec?.total_amount ?? latest.unit_price ?? 0)
    if (value > 0) points.push({ date, value })
  }
  const matching = lines.filter(l => l.product_id === latest.product_id || productName(l) === productName(latest))
  const qty = matching.reduce((sum, l) => sum + Number(l.qty ?? 0), 0)
  const currentPrice = points.at(-1)?.value ?? Number(latest.unit_price ?? 0)
  const totalCost = matching.reduce((sum, l) => sum + Number(l.amount ?? 0), 0) || currentPrice * (qty || 1)
  const orderDays = Math.max(1, new Set(matching.map(l => l.daily_spec_id)).size || specs.length)
  const first = points[0]?.value ?? 0
  return { name: productName(latest), unit: latest.unit ?? '', points, currentPrice,
    changeRate: first > 0 ? (currentPrice - first) / first * 100 : 0,
    qty, totalCost, orderDays, deliveryDays: specs.length, start, today }
}
