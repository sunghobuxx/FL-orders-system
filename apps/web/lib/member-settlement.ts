export function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const d = new Date(`${value}T00:00:00Z`)
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === value
}
export function settlementPeriod(date: string, weekly: boolean) {
  const d = new Date(`${date}T00:00:00Z`)
  if (weekly) {
    d.setUTCDate(d.getUTCDate() - (d.getUTCDay() === 0 ? 6 : d.getUTCDay() - 1))
    const start = d.toISOString().slice(0, 10)
    d.setUTCDate(d.getUTCDate() + 6)
    return { key: start, start, end: d.toISOString().slice(0, 10) }
  }
  const start = date.slice(0, 7) + '-01'
  d.setUTCMonth(d.getUTCMonth() + 1, 0)
  return { key: date.slice(0, 7), start, end: d.toISOString().slice(0, 10) }
}
export function unpaidBalance(row: { status: string; balance: number | string | null }) {
  return row.status !== 'paid' ? Math.max(0, Number(row.balance ?? 0)) : 0
}
