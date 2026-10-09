export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin-member-user'

/**
 * 가락시장 휴무일 토글. 등록된 날짜는 서울·일산 식당도 가락이 아니라 남촌(기존) 공급처로 간다
 * (getCurrentDispatchGroups 가 읽는다). 2026-10-09 가락시장 휴무 때 처음 만들었다.
 */
export async function POST(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: '권한이 없습니다' }, { status: 403 })
  const { user, db } = session
  const { businessDate, note } = await req.json() as { businessDate?: string; note?: string }
  if (!businessDate || !/^\d{4}-\d{2}-\d{2}$/.test(businessDate)) {
    return NextResponse.json({ error: '날짜 형식이 올바르지 않습니다(YYYY-MM-DD).' }, { status: 400 })
  }
  const { error } = await db.from('garak_closed_dates').upsert({
    business_date: businessDate,
    note: note?.trim() || null,
    created_by: user.id,
  }, { onConflict: 'business_date' })
  if (error) return NextResponse.json({ error: '저장 실패' }, { status: 500 })
  return NextResponse.json({ success: true })
}

export async function DELETE(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: '권한이 없습니다' }, { status: 403 })
  const { db } = session
  const businessDate = new URL(req.url).searchParams.get('date')
  if (!businessDate) return NextResponse.json({ error: '필수 값 누락 (date)' }, { status: 400 })
  const { error } = await db.from('garak_closed_dates').delete().eq('business_date', businessDate)
  if (error) return NextResponse.json({ error: '삭제 실패' }, { status: 500 })
  return NextResponse.json({ success: true })
}
