export const runtime = 'edge'
import { NextRequest, NextResponse } from 'next/server'
import { getMemberSession } from '@/lib/member-session'
import { settlementPeriod, unpaidBalance, validDate } from '@/lib/member-settlement'

function one<T>(value: T | T[] | null): T | null { return Array.isArray(value) ? value[0] ?? null : value }
export async function GET(req: NextRequest) {
  const { user, supabase: db } = await getMemberSession(req)
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
  const { data: member, error: memberError } = await db.from('memberships').select('organization_id, organizations(name)').eq('user_id', user.id).maybeSingle()
  if (memberError || !member) return NextResponse.json({ error: '업체 정보를 확인할 수 없습니다.' }, { status: 403 })
  const { data: restaurant, error: restError } = await db.from('restaurants').select('id, settlement_cycle').eq('organization_id', member.organization_id).maybeSingle()
  if (restError || !restaurant) return NextResponse.json({ error: '식당 정보를 확인할 수 없습니다.' }, { status: 404 })
  const today = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10)
  const date = req.nextUrl.searchParams.get('date') ?? today
  const defaultFrom = new Date(`${today}T00:00:00Z`); defaultFrom.setUTCMonth(defaultFrom.getUTCMonth() - 6)
  const from = req.nextUrl.searchParams.get('from') ?? defaultFrom.toISOString().slice(0, 10)
  const to = req.nextUrl.searchParams.get('to') ?? today
  if (![date, from, to].every(validDate) || from > to) return NextResponse.json({ error: '올바른 날짜를 선택해주세요.' }, { status: 400 })
  const [specResult, selectedResult, recResult] = await Promise.all([
    db.from('daily_specs').select('id, business_date, total_amount').eq('restaurant_id', restaurant.id).gte('business_date', from).lte('business_date', to).order('business_date', { ascending: false }),
    db.from('daily_specs').select('id, business_date, total_amount').eq('restaurant_id', restaurant.id).eq('business_date', date).maybeSingle(),
    db.from('receivables').select('id, balance, status, due_date, sales_statements(settlement_periods(start_date, end_date))').eq('restaurant_id', restaurant.id),
  ])
  if (specResult.error || selectedResult.error || recResult.error) return NextResponse.json({ error: '정산 자료 조회에 실패했습니다.' }, { status: 500 })
  const specs = specResult.data ?? [], recs = recResult.data ?? []
  const specIds = [...new Set([...specs.map(s => s.id), ...(selectedResult.data ? [selectedResult.data.id] : [])])]
  const lineResult = specIds.length ? await db.from('daily_spec_lines').select('id, daily_spec_id, qty, unit, unit_price, amount, products(standard_name)').in('daily_spec_id', specIds) : { data: [], error: null }
  if (lineResult.error) return NextResponse.json({ error: '명세서 품목 조회에 실패했습니다.' }, { status: 500 })
  const lines = (lineResult.data ?? []).map(line => ({ id: line.id, specId: line.daily_spec_id, name: one(line.products)?.standard_name ?? '품목', qty: Number(line.qty), unit: line.unit, unitPrice: Number(line.unit_price), amount: Number(line.amount) }))
  const weekly = restaurant.settlement_cycle === 'weekly'
  type Period = { key: string; start: string; end: string; total: number; outstanding: number; billed: boolean; specs: typeof specs }
  const periods = new Map<string, Period>()
  for (const spec of specs) {
    const p = settlementPeriod(spec.business_date, weekly)
    const group = periods.get(p.key) ?? { ...p, total: 0, outstanding: 0, billed: false, specs: [] }
    group.total += Number(spec.total_amount); group.specs.push(spec); periods.set(p.key, group)
  }
  for (const rec of recs) {
    const range = one(one(rec.sales_statements)?.settlement_periods ?? null)
    if (!range?.start_date) continue // Do not guess a bill's period from its due date.
    const key = weekly ? range.start_date : range.start_date.slice(0, 7)
    const period = periods.get(key)
    if (period) { period.billed = true; period.outstanding += unpaidBalance(rec) }
  }
  return NextResponse.json({ organizationName: one(member.organizations)?.name ?? '', today, date, from, to,
    cycle: weekly ? 'weekly' : 'monthly', outstanding: recs.reduce((sum, row) => sum + unpaidBalance(row), 0),
    previousOutstanding: recs.filter(r => r.due_date && r.due_date < from).reduce((sum, row) => sum + unpaidBalance(row), 0),
    selectedSpec: selectedResult.data, periods: [...periods.values()], lines,
  }, { headers: { 'Cache-Control': 'no-store' } })
}
