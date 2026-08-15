export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'
import { getAuthorizedAdminDb } from '@/lib/admin-member-user'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const { userId } = await params
  const { restaurantIds } = await req.json() as { restaurantIds: string[] }

  // 로그인만 봐서는 회원 계정으로도 통과한다. 관리자 권한까지 확인한다.
  const db = await getAuthorizedAdminDb()
  if (!db) return NextResponse.json({ error: '권한이 없습니다' }, { status: 403 })

  const { error: delError } = await db
    .from('manager_restaurants')
    .delete()
    .eq('user_id', userId)

  if (delError) return NextResponse.json({ error: delError.message }, { status: 500 })

  if (restaurantIds.length > 0) {
    const { error: insError } = await db
      .from('manager_restaurants')
      .insert(restaurantIds.map(rid => ({ user_id: userId, restaurant_id: rid })))
    if (insError) return NextResponse.json({ error: insError.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
