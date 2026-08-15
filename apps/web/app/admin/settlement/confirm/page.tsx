export const runtime = 'edge'

import { requireAuthorizedAdminDb } from '@/lib/admin-member-user'
import { fetchAll } from '@/lib/supabase/fetch-all'
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
  current: number
  carryover: number
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
    .lt('end_date', today)
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

  const rows: ConfirmRow[] = statements.map(s => {
    const rest = Array.isArray(s.restaurants) ? s.restaurants[0] : s.restaurants
    const org = Array.isArray(rest?.organizations) ? rest.organizations[0] : rest?.organizations
    const period = Array.isArray(s.settlement_periods) ? s.settlement_periods[0] : s.settlement_periods
    const restCycle = rest?.settlement_cycle ?? 'weekly'
    const current = Number(s.total_amount ?? 0)
    const carryover = receivables
      .filter(r => r.restaurant_id === s.restaurant_id && r.statement_id !== s.id)
      .reduce((acc, r) => acc + Number(r.balance ?? 0), 0)
    const phone = phoneOf.get(rest?.organization_id) ?? null

    const sendable = restCycle !== 'daily' && Boolean(phone)
    const reason = restCycle === 'daily' ? '발송 대상 아님(일정산)' : (!phone ? '연락처 없음' : '')

    return {
      statementId: s.id,
      restaurantId: s.restaurant_id,
      orgName: org?.name ?? '알 수 없음',
      cycle: restCycle, start: period?.start_date ?? '', end: period?.end_date ?? '',
      current, carryover, total: current + carryover,
      confirmedAt: s.confirmed_at, notifiedAt: s.notified_at,
      phone: maskPhone(phone), sendable, reason,
    }
  }).sort((a, b) => a.orgName.localeCompare(b.orgName, 'ko'))

  return (
    <AdminSettlementShell>
      <ConfirmPanel
        rows={rows}
        cycle={cycle}
        periods={periods.slice(0, 12)}
        selectedPeriodId={selected?.id ?? null}
      />
    </AdminSettlementShell>
  )
}
