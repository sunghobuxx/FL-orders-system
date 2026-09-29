/**
 * 세금계산서 발행 단위는 정산기간이 아니라 달력상 월이다(2026-09-30 정정 — 정산주기가 주/일인
 * 업체는 정산기간이 한 달과 안 맞아 "이번 달치 한 번에" 발행이 안 됐다). 여기서는 월 계산과
 * 집계만 한다(순수 함수) — DB 조회는 라우트가 한다.
 */

const MONTH_RE = /^(\d{4})-(\d{2})(?:-\d{2})?$/

/** 'YYYY-MM' 또는 'YYYY-MM-01' 을 받아 그 달의 첫날·마지막날(yyyy-mm-dd)을 낸다. */
export function monthRange(month: string): { start: string; end: string } {
  const m = MONTH_RE.exec(month)
  if (!m) throw new Error('month 는 YYYY-MM(-DD) 형식이어야 합니다')
  const year = Number(m[1])
  const mon = Number(m[2])
  if (mon < 1 || mon > 12) throw new Error('month 의 월은 01~12 여야 합니다')

  const start = `${m[1]}-${m[2]}-01`
  // UTC 로 다음 달 0일 = 이번 달 마지막 날(로컬 타임존 영향 없이 안전하게 계산한다)
  const lastDay = new Date(Date.UTC(year, mon, 0)).getUTCDate()
  const end = `${m[1]}-${m[2]}-${String(lastDay).padStart(2, '0')}`
  return { start, end }
}

/** KST 기준 지난달 1일(YYYY-MM-01). 세금계산서는 지난달분을 이번달 10일까지 내는 게 실무라 기본값으로 쓴다. */
export function previousMonthKst(now: Date = new Date()): string {
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000)
  const d = new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), 1))
  d.setUTCMonth(d.getUTCMonth() - 1)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`
}

export interface DailySpecAmounts {
  total_amount: number | string
  vat_amount: number | string | null
}

/** 그 달의 daily_specs(총액·부가세)를 더해 공급가·세액·합계를 낸다. */
export function aggregateMonthlyTax(specs: DailySpecAmounts[]): { totalAmount: number; taxTotal: number; supplyCostTotal: number } {
  const totalAmount = specs.reduce((sum, s) => sum + Number(s.total_amount ?? 0), 0)
  const taxTotal = specs.reduce((sum, s) => sum + Number(s.vat_amount ?? 0), 0)
  return { totalAmount, taxTotal, supplyCostTotal: totalAmount - taxTotal }
}
