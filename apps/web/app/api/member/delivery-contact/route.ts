export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(req: NextRequest) {
  const token = req.headers.get('Authorization')?.replace(/^Bearer /, '')
  if (!token) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
  const db = createAdminClient()
  const { data: auth, error: authError } = await db.auth.getUser(token)
  if (authError || !auth.user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
  const restaurantId = req.nextUrl.searchParams.get('restaurantId')
  if (!restaurantId) return NextResponse.json({ error: '업체 정보가 필요합니다.' }, { status: 400 })
  const { data: restaurant } = await db.from('restaurants').select('organization_id').eq('id', restaurantId).maybeSingle()
  if (!restaurant) return NextResponse.json({ error: '업체를 찾을 수 없습니다.' }, { status: 404 })
  const { data: membership } = await db.from('memberships').select('user_id')
    .eq('user_id', auth.user.id).eq('organization_id', restaurant.organization_id).maybeSingle()
  if (!membership) return NextResponse.json({ error: '조회 권한이 없습니다.' }, { status: 403 })

  const { data: assigned, error } = await db.from('manager_restaurants').select('user_id').eq('restaurant_id', restaurantId)
  if (error) return NextResponse.json({ error: '배송 담당자를 불러오지 못했습니다.' }, { status: 500 })
  const ids = [...new Set((assigned ?? []).map(row => row.user_id))]
  const contacts = await Promise.all(ids.map(async id => {
    const [{ data: profile }, { data: account, error: accountError }] = await Promise.all([
      db.from('users').select('name, phone').eq('id', id).maybeSingle(),
      db.auth.admin.getUserById(id),
    ])
    if (accountError) throw new Error('담당자 연락처 조회 실패')
    const metadata = account.user?.user_metadata
    const phone = profile?.phone || account.user?.phone || metadata?.phone || metadata?.phone_number
    return {
      id,
      name: profile?.name || metadata?.full_name || '배송 담당자',
      phone: typeof phone === 'string' && /^[+0-9()\s-]+$/.test(phone) ? phone : null,
    }
  })).catch(() => null)
  if (!contacts) return NextResponse.json({ error: '연락처를 불러오지 못했습니다.' }, { status: 500 })
  return NextResponse.json({ contacts }, { headers: { 'Cache-Control': 'private, no-store' } })
}
