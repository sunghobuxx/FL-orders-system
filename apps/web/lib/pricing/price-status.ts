/**
 * 당일 단가 확정 표시 — 상태 계산·표시 범위·문구.
 *
 * 업체가 명세서를 보는 시각과 사장님이 단가를 넣는 시각이 달라서, 업체가 본 금액이 나중에
 * 바뀌어 입금을 못 하거나 혼란이 생겼다(2026-09). 그래서 사장님이 「오늘 단가 확정」을
 * 누르면 「확정」, 그 전에는 「입력 중」, 확정 뒤에 그 날짜 단가가 또 등록되면 「수정됨」으로 보인다.
 *
 * 이 파일은 **순수 함수만** 둔다. DB 조회는 price-status-loader.ts 가 한다.
 * 설계: docs/superpowers/specs/2026-09-25-당일단가-확정-표시-design.md
 */

/**
 * 시행일. 이 날짜 **이전** 명세서에는 상태를 내지 않는다.
 * 안 그러면 월정산 업체(마산 등)의 9월 초 날짜가 전부 「입력 중」으로 뜬다.
 * 배포 당일(KST)로 맞춘다.
 */
export const PRICE_STATUS_FROM = '2026-09-26'

export type PriceStatus = 'none' | 'final' | 'modified' | 'confirmed' | 'pending'
export interface PriceStatusResult { status: PriceStatus; at: string | null }
export type ShownStatus = Exclude<PriceStatus, 'none'>
export interface ShownPriceStatus { status: ShownStatus; at: string | null }

export const NO_PRICE_STATUS: PriceStatusResult = { status: 'none', at: null }

export interface PriceStatusInput {
  /** 명세서 날짜 D (YYYY-MM-DD) */
  date: string
  /** price_confirmations.confirmed_at */
  confirmedAt: string | null
  /** 적용일이 D **이하**인 price_snapshots 중 확정 뒤에 등록된 것의 마지막 created_at (단가 등록은 이후 날짜 명세서까지 덮어쓴다) */
  lastPriceAt: string | null
  /** D 를 포함한 정산서가 확정됐는지 */
  statementConfirmed: boolean
  from?: string
}

const ms = (iso: string) => new Date(iso).getTime()

export function priceStatus(i: PriceStatusInput): PriceStatusResult {
  if (i.date < (i.from ?? PRICE_STATUS_FROM)) return NO_PRICE_STATUS
  if (i.statementConfirmed) return { status: 'final', at: null }
  if (i.confirmedAt) {
    // 같은 순간이면 수정이 아니다(경계). 확정 이후에 **더 늦게** 등록된 단가만 수정으로 본다.
    if (i.lastPriceAt && ms(i.lastPriceAt) > ms(i.confirmedAt)) return { status: 'modified', at: i.lastPriceAt }
    return { status: 'confirmed', at: i.confirmedAt }
  }
  return { status: 'pending', at: null }
}

function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

export interface DisplayContext {
  audience: 'member' | 'driver'
  /** KST 오늘 (YYYY-MM-DD) */
  today: string
  /** 업체 화면 종류. spec = 당일명세서·인쇄, settlement = 정산서 목록 */
  view?: 'spec' | 'settlement'
}

/**
 * 화면마다 보여주는 범위.
 *  - 업체: pending 은 오늘·어제만(놓친 날짜에 「입력 중」이 몇 주씩 남지 않게), confirmed 는 spec 에만,
 *          final·none 은 없음.
 *  - 배송앱: 전날 명세서를 골라 인쇄하므로, 표시가 없으면 「확정이라 표시가 없는 것」으로 오해한다.
 *          pending 은 나이와 관계없이 항상 보이고, final 은 「정산 확정」.
 *  - modified 는 금액이 실제로 바뀐 것이라 나이와 관계없이 둘 다 보인다.
 */
export function displayFor(r: PriceStatusResult, date: string, ctx: DisplayContext): ShownPriceStatus | null {
  const shown = (status: ShownStatus): ShownPriceStatus => ({ status, at: r.at })
  switch (r.status) {
    case 'none':
      return null
    case 'final':
      return ctx.audience === 'driver' ? shown('final') : null
    case 'modified':
      return shown('modified')
    case 'confirmed':
      return ctx.audience === 'driver' || ctx.view !== 'settlement' ? shown('confirmed') : null
    case 'pending':
      return ctx.audience === 'driver' || date >= addDays(ctx.today, -1) ? shown('pending') : null
  }
}

/** UTC ISO → KST 'HH:MM' */
export function kstClock(iso: string): string {
  return new Date(ms(iso) + 9 * 3600000).toISOString().slice(11, 16)
}

export function priceStatusText(s: ShownPriceStatus): string {
  switch (s.status) {
    case 'pending': return '단가 입력 중 · 금액이 바뀔 수 있습니다 (이전 단가 기준)'
    case 'confirmed': return `✓ 당일 단가 확정 (${kstClock(s.at as string)})`
    case 'modified': return `단가 수정됨 · 금액이 바뀔 수 있습니다 (${kstClock(s.at as string)} 수정)`
    case 'final': return '정산 확정'
  }
}

/** 인쇄물 맨 위에 찍는 문구. 정산 확정(final)은 찍지 않는다. */
export function priceStatusPrintText(s: ShownPriceStatus): string | null {
  return s.status === 'final' ? null : priceStatusText(s)
}

/** 어드민(사장님)에게 보여주는 문구 */
export function adminStatusText(r: PriceStatusResult): string {
  switch (r.status) {
    case 'pending': return '입력 중 (아직 확정 전)'
    case 'confirmed': return `확정됨 (${kstClock(r.at as string)})`
    case 'modified': return `확정 후 단가가 수정됨 (${kstClock(r.at as string)} 수정) — 다시 확정해 주세요`
    case 'final': return '정산 확정된 날짜입니다'
    case 'none': return '시행일 이전 날짜입니다'
  }
}

export interface PriceWarning {
  kind: 'today_pending' | 'modified' | 'old_pending'
  message: string
  dates: string[]
}

const md = (date: string) => {
  const [, m, d] = date.split('-')
  return `${Number(m)}/${Number(d)}`
}

/**
 * 대시보드가 경고를 따질 날짜 = **명세서가 있는 날짜**뿐(중복 제거, 오래된 순).
 * 오늘을 억지로 넣지 않는다 — 배송이 없는 날(일요일 등)에 「오늘 단가 미확정」 경고가 뜨면
 * 사장님이 경고를 무시하게 된다.
 */
export function warningDates(specDates: string[]): string[] {
  return [...new Set(specDates)].sort()
}

/** 대시보드 경고. items 에는 명세서가 있는 날짜만 넣는다(warningDates). */
export function priceWarnings(today: string, items: Array<{ date: string; status: PriceStatus }>): PriceWarning[] {
  const out: PriceWarning[] = []
  const sorted = [...items].sort((a, b) => a.date.localeCompare(b.date))

  if (sorted.some(i => i.date === today && i.status === 'pending')) {
    out.push({
      kind: 'today_pending', dates: [today],
      message: `오늘(${md(today)}) 단가가 아직 확정되지 않았습니다 — 업체 화면에 "단가 입력 중"으로 보입니다`,
    })
  }
  const modified = sorted.filter(i => i.status === 'modified').map(i => i.date)
  if (modified.length) {
    out.push({
      kind: 'modified', dates: modified,
      message: `확정 뒤 단가가 수정된 날짜가 있습니다 — 다시 확정해 주세요: ${modified.map(md).join(', ')}`,
    })
  }
  const oldPending = sorted.filter(i => i.status === 'pending' && i.date < today).map(i => i.date)
  if (oldPending.length) {
    out.push({
      kind: 'old_pending', dates: oldPending,
      message: `확정하지 않은 지난 날짜가 있습니다: ${oldPending.map(md).join(', ')}`,
    })
  }
  return out
}
