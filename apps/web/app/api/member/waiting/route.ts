export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'

import { createAdminClient } from '@/lib/supabase/admin'
import { getSessionUser } from '@/lib/supabase/server'
import { createWaitingClient } from '@/lib/waiting-db'
import { sendSms } from '@/lib/messaging/kakao'

const ALLOWED_STATUS = new Set(['called', 'seated', 'cancelled', 'no_show'])

async function getMemberRestaurant(userId: string) {
  const db = createAdminClient()
  const { data: membership } = await db
    .from('memberships')
    .select('organization_id, organizations(name)')
    .eq('user_id', userId)
    .maybeSingle()
  if (!membership?.organization_id) return null

  const { data: restaurant } = await db
    .from('restaurants')
    .select('id, waiting_enabled')
    .eq('organization_id', membership.organization_id)
    .maybeSingle()
  if (!restaurant) return null

  const org = Array.isArray(membership.organizations) ? membership.organizations[0] : membership.organizations
  const { data: contact } = await db
    .from('contacts')
    .select('phone')
    .eq('organization_id', membership.organization_id)
    .eq('is_primary', true)
    .maybeSingle()

  return {
    id: restaurant.id,
    waitingEnabled: restaurant.waiting_enabled ?? false,
    name: (org as { name?: string } | null)?.name ?? '내 식당',
    phone: contact?.phone ?? '',
  }
}

export async function GET(req: NextRequest) {
  const { user } = await getSessionUser()
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })

  const restaurant = await getMemberRestaurant(user.id)
  if (!restaurant) return NextResponse.json({ error: '식당 정보를 확인할 수 없습니다.' }, { status: 404 })
  if (!restaurant.waitingEnabled) return NextResponse.json({ restaurant, entries: [] })

  const requestedDate = req.nextUrl.searchParams.get('date') ?? ''
  const date = /^\d{4}-\d{2}-\d{2}$/.test(requestedDate)
    ? requestedDate
    : new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const start = new Date(`${date}T00:00:00+09:00`).toISOString()
  const endDate = new Date(`${date}T00:00:00Z`)
  endDate.setUTCDate(endDate.getUTCDate() + 1)
  const end = new Date(`${endDate.toISOString().slice(0, 10)}T00:00:00+09:00`).toISOString()

  const waitingDb = createWaitingClient()
  const { data: entries, error } = await waitingDb
    .from('waiting_entries')
    .select('id, restaurant_id, name, phone, party_size, status, called_at, seated_at, created_at')
    .eq('restaurant_id', restaurant.id)
    .gte('created_at', start)
    .lt('created_at', end)
    .order('created_at', { ascending: true })
  if (error) return NextResponse.json({ error: `웨이팅 조회 실패: ${error.message}` }, { status: 500 })

  return NextResponse.json({ restaurant, entries: entries ?? [], date })
}

export async function PATCH(req: NextRequest) {
  const { user } = await getSessionUser()
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })

  const restaurant = await getMemberRestaurant(user.id)
  if (!restaurant?.waitingEnabled) {
    return NextResponse.json({ error: '웨이팅 기능이 활성화되지 않았습니다.' }, { status: 403 })
  }

  const body = await req.json() as { entryId?: string; status?: string }
  if (!body.entryId || !body.status || !ALLOWED_STATUS.has(body.status)) {
    return NextResponse.json({ error: '요청 정보가 올바르지 않습니다.' }, { status: 400 })
  }

  const waitingDb = createWaitingClient()
  const { data: entry } = await waitingDb
    .from('waiting_entries')
    .select('id, restaurant_id, name, phone, party_size')
    .eq('id', body.entryId)
    .eq('restaurant_id', restaurant.id)
    .maybeSingle()
  if (!entry) return NextResponse.json({ error: '대기 내역을 확인할 수 없습니다.' }, { status: 404 })

  const now = new Date().toISOString()
  const values: Record<string, string> = { status: body.status }
  if (body.status === 'called') values.called_at = now
  if (body.status === 'seated') values.seated_at = now

  const { error: updateError } = await waitingDb.from('waiting_entries').update(values).eq('id', entry.id)
  if (updateError) return NextResponse.json({ error: `웨이팅 상태 수정 실패: ${updateError.message}` }, { status: 500 })

  let notificationSent = false
  if (body.status === 'called' && entry.phone) {
    const result = await sendSms(
      entry.phone,
      `[FruitLife] ${restaurant.name} 입장 차례입니다. (${entry.name}님 ${entry.party_size}명) 식당으로 와주세요.${restaurant.phone ? ` 문의 ${restaurant.phone}` : ''}`,
    )
    notificationSent = result.success
  }

  return NextResponse.json({ ok: true, notificationSent })
}
