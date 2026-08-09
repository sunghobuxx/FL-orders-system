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
 * 금액을 훑고 골라서 확정한다. 발송은 되돌릴 수 없으므로 한 번은 눈으로 보고 넘어간다.
 * 안정화되면 「전체 확정」으로 바꾼다.
 */

export interface ConfirmRow {
  statementId: string
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

function todayKst() {
  return new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10)
}

function maskPhone(phone: string | null) {
  if (!phone) return null
  const d = phone.replace(/\D/g, '')
  return d.length >= 10 ? `${d.slice(0, 3)}-****-${d.slice(-4)}` : phone
}

export default async function SettlementConfirmPage() {
  const db = await requireAuthorizedAdminDb()
  const today = todayKst()

  const statements = await fetchAll<any>(() => db
    .from('sales_statements')
    .select('id, total_amount, confirmed_at, notified_at, restaurant_id, settlement_periods!inner(start_date, end_date, period_type), restaurants(settlement_cycle, organization_id, organizations(name))')
    .lt('settlement_periods.end_date', today))

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
    const cycle = rest?.settlement_cycle ?? 'weekly'
    const current = Number(s.total_amount ?? 0)
    const carryover = receivables
      .filter(r => r.restaurant_id === s.restaurant_id && r.statement_id !== s.id)
      .reduce((acc, r) => acc + Number(r.balance ?? 0), 0)
    const phone = phoneOf.get(rest?.organization_id) ?? null

    const sendable = cycle !== 'daily' && Boolean(phone)
    const reason = cycle === 'daily' ? '발송 대상 아님(일정산)' : (!phone ? '연락처 없음' : '')

    return {
      statementId: s.id,
      orgName: org?.name ?? '알 수 없음',
      cycle, start: period?.start_date ?? '', end: period?.end_date ?? '',
      current, carryover, total: current + carryover,
      confirmedAt: s.confirmed_at, notifiedAt: s.notified_at,
      phone: maskPhone(phone), sendable, reason,
    }
  }).sort((a, b) => b.end.localeCompare(a.end) || a.orgName.localeCompare(b.orgName, 'ko'))

  return (
    <AdminSettlementShell>
      <ConfirmPanel rows={rows} />
    </AdminSettlementShell>
  )
}
