export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-member-user'

/**
 * 식당별 가락 예외 토글. 가락시장이 열려 있어도 이 식당만 이 날짜는 남촌(기존)으로 간다
 * (getCurrentDispatchGroups 가 읽는다). 2026-10-11 화곡중앙시장점이 가락 매입을 아직
 * 못 시작했을 때 처음 만들었다 — garak_closed_dates 의 식당 단위 버전.
 */
export async function POST(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: '권한이 없습니다' }, { status: 403 })
  const { user, db } = session
  const { restaurantId, businessDate, note } = await req.json() as {
    restaurantId?: string; businessDate?: string; note?: string
  }
  if (!restaurantId || !businessDate || !/^\d{4}-\d{2}-\d{2}$/.test(businessDate)) {
    return NextResponse.json({ error: '필수 값 누락 또는 날짜 형식이 올바르지 않습니다(YYYY-MM-DD).' }, { status: 400 })
  }
  const { error } = await db.from('restaurant_garak_overrides').upsert({
    restaurant_id: restaurantId,
    business_date: businessDate,
    note: note?.trim() || null,
    created_by: user.id,
  }, { onConflict: 'restaurant_id,business_date' })
  if (error) return NextResponse.json({ error: '저장 실패' }, { status: 500 })
  return NextResponse.json({ success: true })
}

export async function DELETE(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: '권한이 없습니다' }, { status: 403 })
  const { db } = session
  const url = new URL(req.url)
  const restaurantId = url.searchParams.get('restaurantId')
  const businessDate = url.searchParams.get('date')
  if (!restaurantId || !businessDate) {
    return NextResponse.json({ error: '필수 값 누락 (restaurantId, date)' }, { status: 400 })
  }
  const { error } = await db.from('restaurant_garak_overrides').delete()
    .eq('restaurant_id', restaurantId).eq('business_date', businessDate)
  if (error) return NextResponse.json({ error: '삭제 실패' }, { status: 500 })
  return NextResponse.json({ success: true })
}
