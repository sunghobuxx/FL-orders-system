# 어드민 전체 매출관리 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 어드민이 한 화면(`/admin/sales`)에서 월별 매출·매입 요약, 일별 매출 달력, 일자 클릭 시 업체별 상세를 확인한다.

**Architecture:** Next.js App Router 서버 컴포넌트 한 개(`app/admin/sales/page.tsx`)가 `createAdminClient()`로 데이터를 읽고, 순수 집계/날짜 로직은 `lib/sales-overview.ts` 헬퍼로 분리해 vitest로 단위 테스트한다. 상태는 URL 쿼리 파라미터(`?month`, `?date`)로 관리하며 달력 칸·식당 행은 모두 `<Link>`라 클라이언트 JS가 거의 없다.

**Tech Stack:** Next.js 15.5 (App Router, `runtime='edge'`), React 19, Supabase JS (service-role admin client), Tailwind CSS 4, vitest.

## Global Constraints

- 파일 최상단에 `export const runtime = 'edge'` 필수 (모든 admin 페이지 규칙).
- 데이터 조회는 `createAdminClient()` 사용 (RLS 우회 — 과거 RLS로 품목이 사라진 버그 이력 때문에 admin 페이지는 service-role 사용). 인증은 페이지 첫 줄 `await getSessionUser()` + admin `layout.tsx`의 권한 가드에 의존.
- 기존 작동 코드(`daily_specs`, `purchase_items`, `receivables`, `payables` 쿼리 및 기존 페이지)는 **수정 금지** — 읽기/신규 추가만.
- 금액 표시: `const fmt = (n: number) => \`${n.toLocaleString()}원\``.
- KST 오늘: `getKstToday()` (`@/lib/date-kst`).
- 업체명 추출: `restRaw?.organizations?.name ?? '알 수 없음'`.
- import 경로 별칭: `@/lib/...`, `@/...`.

---

### Task 1: 집계/날짜 헬퍼 (`lib/sales-overview.ts`)

순수 함수 모음. DB 의존 없음 → vitest로 전부 단위 테스트.

**Files:**
- Create: `apps/web/lib/sales-overview.ts`
- Test: `apps/web/lib/sales-overview.test.ts`

**Interfaces:**
- Consumes: 없음 (순수 함수).
- Produces (Task 2·3이 import):
  - `interface SpecRow { id: string; business_date: string; total_amount: number | string; restaurants: { organizations: { name: string } | null } | null }`
  - `interface RestaurantSales { specId: string; name: string; amount: number }`
  - `interface CalendarCell { date: string | null; amount: number }`
  - `getMonthRange(month: string): { startDate: string; endDate: string }`
  - `getPrevMonth(month: string): string`
  - `getNextMonth(month: string): string`
  - `aggregateDailySales(specs: SpecRow[]): Map<string, number>`
  - `sumSpecs(specs: SpecRow[]): number`
  - `countSalesDays(dailyMap: Map<string, number>): number`
  - `dailyAverage(total: number, salesDays: number): number`
  - `computeDelta(current: number, previous: number): number | null`
  - `buildCalendarGrid(month: string, dailyMap: Map<string, number>): CalendarCell[][]`
  - `aggregateByRestaurant(specs: SpecRow[], date: string): RestaurantSales[]`

- [ ] **Step 1: 실패하는 테스트 작성**

`apps/web/lib/sales-overview.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  getMonthRange, getPrevMonth, getNextMonth,
  aggregateDailySales, sumSpecs, countSalesDays, dailyAverage,
  computeDelta, buildCalendarGrid, aggregateByRestaurant,
  type SpecRow,
} from './sales-overview'

const spec = (id: string, date: string, amount: number, name: string | null = '가게'): SpecRow => ({
  id,
  business_date: date,
  total_amount: amount,
  restaurants: name === null ? null : { organizations: { name } },
})

describe('getMonthRange', () => {
  it('일반 달은 1일~말일', () => {
    expect(getMonthRange('2026-06')).toEqual({ startDate: '2026-06-01', endDate: '2026-06-30' })
  })
  it('31일 달', () => {
    expect(getMonthRange('2026-07')).toEqual({ startDate: '2026-07-01', endDate: '2026-07-31' })
  })
  it('윤년 2월', () => {
    expect(getMonthRange('2024-02')).toEqual({ startDate: '2024-02-01', endDate: '2024-02-29' })
  })
  it('평년 2월', () => {
    expect(getMonthRange('2026-02')).toEqual({ startDate: '2026-02-01', endDate: '2026-02-28' })
  })
})

describe('getPrevMonth / getNextMonth', () => {
  it('연 경계를 넘어간다', () => {
    expect(getPrevMonth('2026-01')).toBe('2025-12')
    expect(getNextMonth('2026-12')).toBe('2027-01')
  })
  it('일반 이동', () => {
    expect(getPrevMonth('2026-06')).toBe('2026-05')
    expect(getNextMonth('2026-06')).toBe('2026-07')
  })
})

describe('aggregateDailySales', () => {
  it('같은 날짜를 합산하고 문자열 금액도 처리', () => {
    const map = aggregateDailySales([
      spec('a', '2026-06-01', 1000),
      spec('b', '2026-06-01', 2000),
      spec('c', '2026-06-02', 500),
    ])
    expect(map.get('2026-06-01')).toBe(3000)
    expect(map.get('2026-06-02')).toBe(500)
  })
  it('빈 배열은 빈 맵', () => {
    expect(aggregateDailySales([]).size).toBe(0)
  })
})

describe('sumSpecs', () => {
  it('전체 합계', () => {
    expect(sumSpecs([spec('a', '2026-06-01', 1000), spec('b', '2026-06-02', 2500)])).toBe(3500)
  })
})

describe('countSalesDays', () => {
  it('매출 0인 날은 제외', () => {
    const map = new Map([['2026-06-01', 1000], ['2026-06-02', 0], ['2026-06-03', 500]])
    expect(countSalesDays(map)).toBe(2)
  })
})

describe('dailyAverage', () => {
  it('총매출 / 매출발생일', () => {
    expect(dailyAverage(3000, 2)).toBe(1500)
  })
  it('발생일 0이면 0 (0 나눗셈 방지)', () => {
    expect(dailyAverage(0, 0)).toBe(0)
  })
  it('반올림', () => {
    expect(dailyAverage(1000, 3)).toBe(333)
  })
})

describe('computeDelta', () => {
  it('증가율 % (소수 1자리)', () => {
    expect(computeDelta(1500, 1000)).toBe(50)
  })
  it('감소율', () => {
    expect(computeDelta(800, 1000)).toBe(-20)
  })
  it('전월 0이면 null (계산 불가)', () => {
    expect(computeDelta(1000, 0)).toBeNull()
  })
})

describe('buildCalendarGrid', () => {
  it('2026-06은 6주 이내, 1일은 월요일 칸', () => {
    const weeks = buildCalendarGrid('2026-06', new Map([['2026-06-01', 1000]]))
    // 2026-06-01은 월요일 → 첫 주 [null(일), 1일(월), 2,3,4,5,6]
    expect(weeks[0][0].date).toBeNull()
    expect(weeks[0][1].date).toBe('2026-06-01')
    expect(weeks[0][1].amount).toBe(1000)
    // 모든 주는 7칸
    weeks.forEach(w => expect(w).toHaveLength(7))
    // 날짜 칸 개수 = 30
    const dayCells = weeks.flat().filter(c => c.date !== null)
    expect(dayCells).toHaveLength(30)
  })
  it('매출 없는 날 amount=0', () => {
    const weeks = buildCalendarGrid('2026-06', new Map())
    expect(weeks.flat().find(c => c.date === '2026-06-15')?.amount).toBe(0)
  })
})

describe('aggregateByRestaurant', () => {
  it('선택 날짜만 필터, 금액 큰 순 정렬', () => {
    const rows = aggregateByRestaurant([
      spec('a', '2026-06-01', 1000, '가게A'),
      spec('b', '2026-06-01', 3000, '가게B'),
      spec('c', '2026-06-02', 9999, '가게C'),
    ], '2026-06-01')
    expect(rows).toEqual([
      { specId: 'b', name: '가게B', amount: 3000 },
      { specId: 'a', name: '가게A', amount: 1000 },
    ])
  })
  it('업체명 없으면 알 수 없음', () => {
    const rows = aggregateByRestaurant([spec('a', '2026-06-01', 100, null)], '2026-06-01')
    expect(rows[0].name).toBe('알 수 없음')
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd apps/web && npx vitest run lib/sales-overview.test.ts`
Expected: FAIL — `Failed to resolve import "./sales-overview"` (파일 없음)

- [ ] **Step 3: 최소 구현 작성**

`apps/web/lib/sales-overview.ts`:

```ts
export interface SpecRow {
  id: string
  business_date: string
  total_amount: number | string
  restaurants: { organizations: { name: string } | null } | null
}

export interface RestaurantSales {
  specId: string
  name: string
  amount: number
}

export interface CalendarCell {
  date: string | null
  amount: number
}

/** 'YYYY-MM' → 해당 월 1일/말일 (서버 TZ 무관, UTC 기준 일수 계산) */
export function getMonthRange(month: string): { startDate: string; endDate: string } {
  const [y, m] = month.split('-').map(Number)
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return { startDate: `${month}-01`, endDate: `${month}-${String(lastDay).padStart(2, '0')}` }
}

export function getPrevMonth(month: string): string {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 2, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

export function getNextMonth(month: string): string {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(Date.UTC(y, m, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

export function aggregateDailySales(specs: SpecRow[]): Map<string, number> {
  const map = new Map<string, number>()
  for (const s of specs) {
    const amt = Number(s.total_amount) || 0
    map.set(s.business_date, (map.get(s.business_date) ?? 0) + amt)
  }
  return map
}

export function sumSpecs(specs: SpecRow[]): number {
  return specs.reduce((acc, s) => acc + (Number(s.total_amount) || 0), 0)
}

export function countSalesDays(dailyMap: Map<string, number>): number {
  let n = 0
  for (const v of dailyMap.values()) if (v > 0) n++
  return n
}

export function dailyAverage(total: number, salesDays: number): number {
  if (salesDays <= 0) return 0
  return Math.round(total / salesDays)
}

/** 전월 대비 증감률(%). 전월이 0이면 계산 불가 → null */
export function computeDelta(current: number, previous: number): number | null {
  if (previous === 0) return null
  return Math.round(((current - previous) / previous) * 1000) / 10
}

/** 월 달력 그리드: 일요일 시작, 7칸 단위 주 배열 */
export function buildCalendarGrid(month: string, dailyMap: Map<string, number>): CalendarCell[][] {
  const [y, m] = month.split('-').map(Number)
  const firstDow = new Date(Date.UTC(y, m - 1, 1)).getUTCDay() // 0=일
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const cells: CalendarCell[] = []
  for (let i = 0; i < firstDow; i++) cells.push({ date: null, amount: 0 })
  for (let d = 1; d <= lastDay; d++) {
    const date = `${month}-${String(d).padStart(2, '0')}`
    cells.push({ date, amount: dailyMap.get(date) ?? 0 })
  }
  while (cells.length % 7 !== 0) cells.push({ date: null, amount: 0 })
  const weeks: CalendarCell[][] = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))
  return weeks
}

/** 선택 날짜의 업체(식당)별 매출, 금액 내림차순 */
export function aggregateByRestaurant(specs: SpecRow[], date: string): RestaurantSales[] {
  return specs
    .filter(s => s.business_date === date)
    .map(s => ({
      specId: s.id,
      name: s.restaurants?.organizations?.name ?? '알 수 없음',
      amount: Number(s.total_amount) || 0,
    }))
    .sort((a, b) => b.amount - a.amount)
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd apps/web && npx vitest run lib/sales-overview.test.ts`
Expected: PASS (전체 통과)

- [ ] **Step 5: 커밋**

```bash
cd apps/web && git add lib/sales-overview.ts lib/sales-overview.test.ts
git commit -m "feat(sales): 매출 집계/달력 헬퍼 + 단위 테스트"
```

---

### Task 2: 매출관리 페이지 — 요약 카드 + 달력 (`app/admin/sales/page.tsx`)

서버 컴포넌트. 데이터 조회 + 요약 카드 6종 + 월 달력. 일자 클릭 시 `?date=`만 세팅(상세 패널은 Task 3).

**Files:**
- Create: `apps/web/app/admin/sales/page.tsx`

**Interfaces:**
- Consumes (Task 1): `getMonthRange`, `getPrevMonth`, `aggregateDailySales`, `sumSpecs`, `countSalesDays`, `dailyAverage`, `computeDelta`, `buildCalendarGrid`, `type SpecRow`.
- Produces: `?date=YYYY-MM-DD` 쿼리 파라미터를 세팅하는 달력 링크 (Task 3가 이 파라미터로 패널을 렌더).

> 이 페이지는 DB 의존 서버 컴포넌트라 단위 테스트 대신 `tsc --noEmit` + `eslint` + dev 서버 수동 확인으로 검증한다.

- [ ] **Step 1: 페이지 작성**

`apps/web/app/admin/sales/page.tsx`:

```tsx
export const runtime = 'edge'

import Link from 'next/link'

import { getSessionUser } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getKstToday } from '@/lib/date-kst'
import {
  getMonthRange, getPrevMonth, getNextMonth,
  aggregateDailySales, sumSpecs, countSalesDays, dailyAverage,
  computeDelta, buildCalendarGrid,
  type SpecRow,
} from '@/lib/sales-overview'

import AdminSettlementShell from '../settlement/AdminSettlementShell'

interface Props {
  searchParams: Promise<{ month?: string; date?: string }>
}

export default async function AdminSalesPage({ searchParams }: Props) {
  const { month: monthParam, date: selectedDate } = await searchParams
  await getSessionUser() // 인증 확인 (권한 가드는 admin layout)
  const db = createAdminClient()

  const today = getKstToday()
  const month = monthParam ?? today.slice(0, 7)
  const { startDate, endDate } = getMonthRange(month)
  const prevMonth = getPrevMonth(month)
  const { startDate: prevStart, endDate: prevEnd } = getMonthRange(prevMonth)

  // ── 당월 매출 (daily_specs) ──
  const { data: specsData } = await db
    .from('daily_specs')
    .select('id, business_date, total_amount, restaurants(organizations(name))')
    .gte('business_date', startDate)
    .lte('business_date', endDate)
  const specs = (specsData ?? []) as unknown as SpecRow[]

  // ── 당월 매입 (purchase_items) ──
  const { data: purchaseData } = await db
    .from('purchase_items')
    .select('amount')
    .gte('business_date', startDate)
    .lte('business_date', endDate)
  const totalPurchase = (purchaseData ?? []).reduce((a, p) => a + (Number(p.amount) || 0), 0)

  // ── 전월 매출/매입 (증감 계산용) ──
  const { data: prevSpecsData } = await db
    .from('daily_specs').select('total_amount')
    .gte('business_date', prevStart).lte('business_date', prevEnd)
  const prevSales = (prevSpecsData ?? []).reduce((a, s) => a + (Number(s.total_amount) || 0), 0)
  const { data: prevPurchData } = await db
    .from('purchase_items').select('amount')
    .gte('business_date', prevStart).lte('business_date', prevEnd)
  const prevPurchase = (prevPurchData ?? []).reduce((a, p) => a + (Number(p.amount) || 0), 0)

  // ── 미수금 / 미지급 (현재 잔액, 월 무관) ──
  const { data: recvData } = await db
    .from('receivables').select('balance')
    .in('status', ['unpaid', 'partial', 'overdue'])
  const outstandingReceivable = (recvData ?? []).reduce((a, r) => a + (Number(r.balance) || 0), 0)
  const { data: payData } = await db
    .from('payables').select('balance')
    .in('status', ['unpaid', 'partial', 'overdue'])
  const outstandingPayable = (payData ?? []).reduce((a, p) => a + (Number(p.balance) || 0), 0)

  // ── 집계 ──
  const dailyMap = aggregateDailySales(specs)
  const totalSales = sumSpecs(specs)
  const salesDays = countSalesDays(dailyMap)
  const avgSales = dailyAverage(totalSales, salesDays)
  const netProfit = totalSales - totalPurchase
  const salesDelta = computeDelta(totalSales, prevSales)
  const purchaseDelta = computeDelta(totalPurchase, prevPurchase)
  const weeks = buildCalendarGrid(month, dailyMap)

  const [y, m] = month.split('-').map(Number)
  const fmt = (n: number) => `${n.toLocaleString()}원`
  const thisMonth = today.slice(0, 7)
  const nextMonth = getNextMonth(month)

  const DeltaBadge = ({ delta }: { delta: number | null }) => {
    if (delta === null) return <span className="text-[11px] text-gray-400">전월 데이터 없음</span>
    const up = delta >= 0
    return (
      <span className={`text-[11px] font-semibold ${up ? 'text-red-500' : 'text-blue-500'}`}>
        {up ? '▲' : '▼'} {Math.abs(delta)}%
      </span>
    )
  }

  const dows = ['일', '월', '화', '수', '목', '금', '토']

  return (
    <AdminSettlementShell>
      <div className="space-y-4 max-w-3xl">
        {/* 월 네비게이터 */}
        <div className="flex items-center gap-2">
          <Link href={`/admin/sales?month=${prevMonth}`} className="px-2 py-1 text-gray-500 hover:text-gray-800 text-sm border border-gray-200 rounded-lg">‹</Link>
          <span className="bg-gray-100 px-4 py-1.5 rounded-lg text-sm font-semibold text-gray-700">{y}년 {m}월</span>
          <Link href={`/admin/sales?month=${nextMonth}`} className="px-2 py-1 text-gray-500 hover:text-gray-800 text-sm border border-gray-200 rounded-lg">›</Link>
          {month !== thisMonth && (
            <Link href="/admin/sales" className="text-xs text-brand-600 hover:underline ml-1">이번달</Link>
          )}
        </div>

        {/* 요약 카드 */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-500 mb-1">총매출</p>
            <p className="text-lg font-bold text-gray-900">{fmt(totalSales)}</p>
            <DeltaBadge delta={salesDelta} />
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-500 mb-1">총매입</p>
            <p className="text-lg font-bold text-gray-900">{fmt(totalPurchase)}</p>
            <DeltaBadge delta={purchaseDelta} />
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-500 mb-1">순이익</p>
            <p className={`text-lg font-bold ${netProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>{fmt(netProfit)}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-500 mb-1">미수금 (받을 돈)</p>
            <p className="text-lg font-bold text-orange-600">{fmt(outstandingReceivable)}</p>
            <Link href="/admin/finance" className="text-[11px] text-brand-600 hover:underline">미수금 관리 →</Link>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-500 mb-1">미지급 (줄 돈)</p>
            <p className="text-lg font-bold text-gray-700">{fmt(outstandingPayable)}</p>
            <Link href="/admin/purchase" className="text-[11px] text-brand-600 hover:underline">매입 정산 →</Link>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-500 mb-1">일평균 매출</p>
            <p className="text-lg font-bold text-gray-900">{fmt(avgSales)}</p>
            <span className="text-[11px] text-gray-400">매출 {salesDays}일 기준</span>
          </div>
        </div>

        {/* 월 달력 (일별 매출) */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="grid grid-cols-7 border-b border-gray-200 bg-gray-50 text-xs font-semibold text-gray-500">
            {dows.map((d, i) => (
              <div key={d} className={`px-2 py-2 text-center ${i === 0 ? 'text-red-500' : i === 6 ? 'text-blue-500' : ''}`}>{d}</div>
            ))}
          </div>
          <div className="divide-y divide-gray-100">
            {weeks.map((week, wi) => (
              <div key={wi} className="grid grid-cols-7 divide-x divide-gray-100">
                {week.map((cell, ci) => {
                  if (cell.date === null) return <div key={ci} className="h-20 bg-gray-50/40" />
                  const day = Number(cell.date.slice(-2))
                  const isSelected = cell.date === selectedDate
                  const hasSales = cell.amount > 0
                  return (
                    <Link
                      key={ci}
                      href={`/admin/sales?month=${month}&date=${cell.date}`}
                      className={`h-20 p-1.5 flex flex-col transition-colors hover:bg-brand-50 ${isSelected ? 'ring-2 ring-inset ring-brand-500 bg-brand-50' : ''}`}
                    >
                      <span className={`text-xs font-medium ${ci === 0 ? 'text-red-500' : ci === 6 ? 'text-blue-500' : 'text-gray-600'}`}>{day}</span>
                      {hasSales && (
                        <span className="mt-auto text-[11px] font-semibold text-green-700 text-right truncate">{fmt(cell.amount)}</span>
                      )}
                    </Link>
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </AdminSettlementShell>
  )
}
```

- [ ] **Step 2: 타입 체크**

Run: `cd apps/web && npx tsc --noEmit`
Expected: 에러 없음 (이 파일 관련 출력 없음)

- [ ] **Step 3: 린트**

Run: `cd apps/web && npx eslint app/admin/sales/page.tsx`
Expected: 에러 없음

- [ ] **Step 4: dev 서버 수동 확인**

Run: `cd apps/web && npm run dev` 후 브라우저에서 `/admin/sales` 접속 (관리자 로그인 상태).
Expected:
- 상단에 이번 달 월 네비게이터, 요약 카드 6종(총매출/총매입/순이익/미수금/미지급/일평균) 표시
- 월 달력에 요일 헤더 + 날짜 칸, 매출 있는 날에 금액 표시
- `‹`/`›` 클릭 시 전/다음 달로 이동, 데이터 갱신
- 날짜 칸 클릭 시 URL에 `&date=...`가 붙고 해당 칸에 테두리 강조 (아직 하단 패널은 없음 — Task 3에서 추가)

- [ ] **Step 5: 커밋**

```bash
cd apps/web && git add app/admin/sales/page.tsx
git commit -m "feat(sales): 매출관리 페이지 - 월 요약 카드 + 일별 매출 달력"
```

---

### Task 3: 일자별 업체 상세 인라인 패널 + 사이드바 메뉴

선택 날짜의 업체(식당)별 매출 패널을 달력 아래에 렌더하고, admin 사이드바에 "전체 매출관리" 링크 추가.

**Files:**
- Modify: `apps/web/app/admin/sales/page.tsx` (Task 2가 만든 파일에 패널 추가)
- Modify: `apps/web/app/admin/layout.tsx` (사이드바 링크 1줄 추가)

**Interfaces:**
- Consumes (Task 1): `aggregateByRestaurant`, `type RestaurantSales`.
- Consumes (Task 2): `selectedDate`, `specs`, `month`, `fmt`, `AdminSettlementShell` 컨테이너.
- Produces: 없음 (말단 기능).

- [ ] **Step 1: 상세 패널 집계 추가**

`apps/web/app/admin/sales/page.tsx` — import 구문에 `aggregateByRestaurant` 추가:

```tsx
import {
  getMonthRange, getPrevMonth, getNextMonth,
  aggregateDailySales, sumSpecs, countSalesDays, dailyAverage,
  computeDelta, buildCalendarGrid, aggregateByRestaurant,
  type SpecRow,
} from '@/lib/sales-overview'
```

그리고 `const weeks = buildCalendarGrid(month, dailyMap)` 다음 줄에 추가:

```tsx
  const dayDetail = selectedDate ? aggregateByRestaurant(specs, selectedDate) : null
  const dayTotal = dayDetail ? dayDetail.reduce((a, r) => a + r.amount, 0) : 0
```

- [ ] **Step 2: 패널 JSX 추가**

달력 `</div>` 블록(가장 바깥 달력 컨테이너) 바로 다음, 최상위 `</div>`(`space-y-4`) 닫기 전에 삽입:

```tsx
        {/* 선택 일자 업체별 상세 */}
        {selectedDate && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 bg-gray-50 border-b border-gray-200">
              <span className="text-sm font-semibold text-gray-700">{selectedDate} 업체별 매출</span>
              <Link href={`/admin/sales?month=${month}`} className="text-xs text-gray-400 hover:text-gray-700">닫기 ✕</Link>
            </div>
            {dayDetail && dayDetail.length > 0 ? (
              <>
                <div className="divide-y divide-gray-100">
                  {dayDetail.map(r => (
                    <Link
                      key={r.specId}
                      href={`/admin/settlement/specs/${r.specId}`}
                      className="grid grid-cols-[1fr_auto] gap-3 items-center px-5 py-3 hover:bg-gray-50 transition-colors"
                    >
                      <span className="text-sm text-gray-800">{r.name}</span>
                      <span className="text-sm font-semibold text-green-700">{fmt(r.amount)}</span>
                    </Link>
                  ))}
                </div>
                <div className="grid grid-cols-[1fr_auto] gap-3 px-5 py-3 bg-gray-50 border-t border-gray-200">
                  <span className="text-sm font-semibold text-gray-600">합계</span>
                  <span className="text-sm font-bold text-gray-900">{fmt(dayTotal)}</span>
                </div>
              </>
            ) : (
              <div className="py-10 text-center text-sm text-gray-400">해당 일자 매출이 없습니다</div>
            )}
          </div>
        )}
```

- [ ] **Step 3: 사이드바 메뉴 링크 추가**

`apps/web/app/admin/layout.tsx` — 정산 섹션에서 `<SideLink href="/admin/purchase" label="매입 정산" />` 다음 줄에 추가:

```tsx
          <SideLink href="/admin/sales" label="전체 매출관리" />
```

- [ ] **Step 4: 타입 체크 + 린트**

Run: `cd apps/web && npx tsc --noEmit && npx eslint app/admin/sales/page.tsx app/admin/layout.tsx`
Expected: 에러 없음

- [ ] **Step 5: dev 서버 수동 확인**

Run: dev 서버에서 `/admin/sales` 접속.
Expected:
- 매출 있는 날짜 칸 클릭 → 달력 아래에 "YYYY-MM-DD 업체별 매출" 패널 표시, 식당별 금액이 큰 순으로 나열, 하단 합계 행
- 식당 행 클릭 → 해당 당일명세서 상세(`/admin/settlement/specs/[specId]`)로 이동
- "닫기 ✕" 클릭 → `date` 파라미터 제거되어 패널 사라짐
- 매출 없는 날 클릭 → "해당 일자 매출이 없습니다"
- 사이드바에 "전체 매출관리" 메뉴 노출, 클릭 시 페이지 이동

- [ ] **Step 6: 커밋**

```bash
cd apps/web && git add app/admin/sales/page.tsx app/admin/layout.tsx
git commit -m "feat(sales): 일자별 업체 상세 패널 + 사이드바 메뉴 추가"
```

---

## Self-Review

**Spec coverage:**
- 월별 전체 매출·매입 요약 → Task 2 요약 카드 (총매출/총매입/순이익/미수금/미지급/일평균 + 전월 대비) ✅
- 일별 매출 달력 → Task 2 월 달력 ✅
- 일자 클릭 → 업체별 상세 (합계 + 명세서 링크) → Task 3 인라인 패널 ✅
- 달력은 매출만, 요약에만 매입 → 달력 칸은 `daily_specs`만, 매입은 카드에서만 ✅
- 인라인 패널 방식 → Task 3 ✅
- 라이브러리 없이 CSS-grid 달력 → `buildCalendarGrid` + `grid-cols-7` ✅
- 엣지 케이스(매출 없는 날/달, 업체명 없음, 미래 달) → 헬퍼/패널에서 처리 ✅
- 집계 헬퍼 분리 + 단위 테스트 → Task 1 ✅
- 기존 코드 수정 금지 → layout.tsx는 메뉴 1줄 추가(기존 로직 불변), 나머지 신규 파일 ✅

**Placeholder scan:** TBD/TODO/"적절히 처리" 없음. 모든 코드 단계에 실제 코드 포함.

**Type consistency:** `SpecRow`, `RestaurantSales`, `CalendarCell` 및 함수 시그니처가 Task 1 정의와 Task 2·3 사용처에서 일치. `computeDelta` 반환 `number | null` → `DeltaBadge`가 null 분기 처리. `aggregateByRestaurant` 반환 `{specId,name,amount}` → 패널에서 동일 필드 사용.
