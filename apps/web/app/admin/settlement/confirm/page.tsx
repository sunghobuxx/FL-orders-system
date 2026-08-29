export const runtime = 'edge'

import { requireAuthorizedAdminDb } from '@/lib/admin-member-user'
import { fetchAll } from '@/lib/supabase/fetch-all'
import { getCarryover } from '@/lib/settlement/carryover'
import AdminSettlementShell from '../AdminSettlementShell'
import ConfirmPanel from './ConfirmPanel'

/**
 * 정산 확정 화면.
 *
 * 마감된 기간(기간 종료일 < 오늘 KST)만 보인다. 진행 중인 기간은 아직 금액이
 * 늘어날 수 있어 확정 대상이 아니다.
 *
 * **한 번에 한 기간만 보여준다.** 마감된 것을 전부 늘어놓으면 195줄이 되어
 * 이번 주에 넘길 것이 어느 것인지 알 수 없다. 주정산을 고르면 그 주에 정산하는
 * 업체만, 월정산을 고르면 그 달 업체만 나온다.
 *
 * 금액을 훑고 골라서 확정한다. 발송은 되돌릴 수 없으므로 한 번은 눈으로 보고 넘어간다.
 */

export interface ConfirmRow {
  statementId: string
  /** 정산 내역 화면으로 가려면 식당 id 가 함께 있어야 한다 */
  restaurantId: string
  orgName: string
  cycle: string
  start: string
  end: string
  /** 당기 청구액 — 이 기간에 청구한 금액 */
  current: number
  /** 이전 미수금 — 이 기간이 시작되기 전에 끝난 정산서들의 미납 잔액 */
  carryover: number
  /** 이 정산서에서 아직 안 받은 금액 */
  outstanding: number
  /** 지금 실제로 받아야 할 금액 = outstanding + carryover (종이 정산서의 「받을 금액」) */
  total: number
  confirmedAt: string | null
  notifiedAt: string | null
  phone: string | null
  sendable: boolean
  reason: string
}

export interface PeriodOption {
  id: string
  start: string
  end: string
  count: number
  pending: number
  /** 아직 안 끝난 기간(종료일이 오늘보다 뒤). 금액이 더 늘 수 있다. */
  ongoing: boolean
}

interface Props {
  searchParams: Promise<{ cycle?: string; period?: string }>
}

function todayKst() {
  return new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10)
}

function maskPhone(phone: string | null) {
  if (!phone) return null
  const d = phone.replace(/\D/g, '')
  return d.length >= 10 ? `${d.slice(0, 3)}-****-${d.slice(-4)}` : phone
}

export default async function SettlementConfirmPage({ searchParams }: Props) {
  const { cycle: cycleParam, period: periodParam } = await searchParams
  const db = await requireAuthorizedAdminDb()
  const today = todayKst()

  // 일정산은 여기 두지 않는다. 매일 보내면 월 30통이라 문자 대상이 아니고,
  // 목록에 섞이면 이번 주 넘길 것을 고르는 데 방해만 된다.
  const cycle = cycleParam === 'monthly' ? 'monthly' : 'weekly'

  // 마감된 기간 목록. 어느 주를 고를지는 여기서 정한다.
  const closedPeriods = await fetchAll<{ id: string; start_date: string; end_date: string }>(() => db
    .from('settlement_periods')
    .select('id, start_date, end_date')
    .eq('period_type', cycle)
    // **시작한 기간**은 아직 안 끝났어도 넣는다.
    //
    // 예전에는 `end_date <= 오늘` 이라 진행 중인 기간이 통째로 빠졌다. 월정산은
    // 말일에 끝나므로 그 달 내내 화면에 없었다 — 8월 중에 8월 월정산을 볼 수 없었다
    // (2026-08-29 지적). 중간에 얼마나 쌓였는지 보려면 보여야 한다.
    // 진행 중인 기간은 `ongoing` 으로 표시해 확정 전에 알아채게 한다.
    .lte('start_date', today)
    .order('end_date', { ascending: false }))

  // 정산서가 없는 기간은 고를 이유가 없다.
  const periodIds = closedPeriods.map(p => p.id)
  const counts = periodIds.length
    ? await fetchAll<{ settlement_period_id: string; confirmed_at: string | null }>(() => db
        .from('sales_statements')
        .select('settlement_period_id, confirmed_at')
        .in('settlement_period_id', periodIds))
    : []

  const periods: PeriodOption[] = closedPeriods
    .map(p => {
      const mine = counts.filter(c => c.settlement_period_id === p.id)
      return {
        id: p.id,
        start: p.start_date,
        end: p.end_date,
        count: mine.length,
        pending: mine.filter(c => !c.confirmed_at).length,
        ongoing: p.end_date > today,
      }
    })
    .filter(p => p.count > 0)

  const selected = periods.find(p => p.id === periodParam) ?? periods[0] ?? null

  const statements = selected
    ? await fetchAll<any>(() => db
        .from('sales_statements')
        .select('id, total_amount, confirmed_at, notified_at, restaurant_id, settlement_periods!inner(start_date, end_date, period_type), restaurants(settlement_cycle, organization_id, organizations(name))')
        .eq('settlement_period_id', selected.id))
    : []

  const restaurantIds = [...new Set(statements.map(s => s.restaurant_id))]
  const receivables = restaurantIds.length
    ? await fetchAll<{ restaurant_id: string; statement_id: string; balance: number }>(() => db
        .from('receivables').select('restaurant_id, statement_id, balance').in('restaurant_id', restaurantIds))
    : []

  const orgIds = [...new Set(statements
    .map(s => (Array.isArray(s.restaurants) ? s.restaurants[0] : s.restaurants)?.organization_id)
    .filter(Boolean))]
  const contacts = orgIds.length
    ? await fetchAll<{ organization_id: string; phone: string; is_primary: boolean }>(() => db
        .from('contacts').select('organization_id, phone, is_primary').in('organization_id', orgIds))
    : []
  const phoneOf = new Map<string, string>()
  for (const c of [...contacts].sort((a, b) => Number(b.is_primary) - Number(a.is_primary))) {
    const digits = (c.phone ?? '').replace(/\D/g, '')
    if (!/^01\d{8,9}$/.test(digits)) continue
    if (!phoneOf.has(c.organization_id)) phoneOf.set(c.organization_id, c.phone)
  }

  const rows: ConfirmRow[] = (await Promise.all(statements.map(async s => {
    const rest = Array.isArray(s.restaurants) ? s.restaurants[0] : s.restaurants
    const org = Array.isArray(rest?.organizations) ? rest.organizations[0] : rest?.organizations
    const period = Array.isArray(s.settlement_periods) ? s.settlement_periods[0] : s.settlement_periods
    const restCycle = rest?.settlement_cycle ?? 'weekly'
    const current = Number(s.total_amount ?? 0)

    // 이 정산서의 남은 미수금
    const outstanding = receivables
      .filter(r => r.statement_id === s.id)
      .reduce((acc, r) => acc + Number(r.balance ?? 0), 0)

    // 이전 미수금은 getCarryover 하나로만 구한다.
    //
    // 예전에는 「이 정산서만 빼고 전부 더하기」였다. 그러면 지난 기간을 열었을 때
    // **그 뒤에 생긴 정산서까지 이전 미수금으로 잡힌다.** 2026-08-15 확인:
    // 용산점 08-02~08-08(이미 완납) 줄에 127,200 이 떴는데 그건 다음 주 미수금이었다.
    // 정산서 상세·인쇄·문자는 이미 이 함수를 쓴다. 확정 화면만 옛 방식으로 남아 있었다.
    const { previous: carryover } = await getCarryover(
      db, s.restaurant_id, s.id, outstanding, period?.start_date ?? null)

    const phone = phoneOf.get(rest?.organization_id) ?? null
    const sendable = restCycle !== 'daily' && Boolean(phone)
    const reason = restCycle === 'daily' ? '발송 대상 아님(일정산)' : (!phone ? '연락처 없음' : '')

    return {
      statementId: s.id,
      restaurantId: s.restaurant_id,
      orgName: org?.name ?? '알 수 없음',
      cycle: restCycle, start: period?.start_date ?? '', end: period?.end_date ?? '',
      current,
      carryover,
      outstanding,
      // 이미 받은 돈은 또 달라고 하지 않는다. 종이 정산서·문자와 같은 계산이다.
      total: outstanding + carryover,
      confirmedAt: s.confirmed_at, notifiedAt: s.notified_at,
      phone: maskPhone(phone), sendable, reason,
    }
  }))).sort((a, b) => a.orgName.localeCompare(b.orgName, 'ko'))

  return (
    <AdminSettlementShell>
      <ConfirmPanel
        rows={rows}
        cycle={cycle}
        today={today}
        periods={periods.slice(0, 12)}
        selectedPeriodId={selected?.id ?? null}
      />
    </AdminSettlementShell>
  )
}
