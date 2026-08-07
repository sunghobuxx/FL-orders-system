export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'

import { createAdminClient } from '@/lib/supabase/admin'
import { buildPriceMapByProduct } from '@/lib/specs/sync'

export async function GET(req: NextRequest) {
  const auth = req.headers.get('Authorization')
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : ''
  if (!token) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })

  const restaurantId = req.nextUrl.searchParams.get('restaurantId')
  const businessDate = req.nextUrl.searchParams.get('businessDate')
  if (!restaurantId || !/^\d{4}-\d{2}-\d{2}$/.test(businessDate ?? '')) {
    return NextResponse.json({ error: '식당 또는 발주 일자가 올바르지 않습니다.' }, { status: 400 })
  }

  const db = createAdminClient()
  const { data: userData, error: userError } = await db.auth.getUser(token)
  if (userError || !userData.user) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
  }

  const { data: restaurant } = await db
    .from('restaurants')
    .select('id, organization_id')
    .eq('id', restaurantId)
    .maybeSingle()
  if (!restaurant) return NextResponse.json({ error: '식당 정보를 찾을 수 없습니다.' }, { status: 404 })

  const { data: membership } = await db
    .from('memberships')
    .select('organization_id')
    .eq('user_id', userData.user.id)
    .eq('organization_id', restaurant.organization_id)
    .maybeSingle()
  if (!membership) return NextResponse.json({ error: '해당 업체의 단가 조회 권한이 없습니다.' }, { status: 403 })

  const { data: productRows, error: productError } = await db
    .from('restaurant_products')
    .select('product_id')
    .eq('restaurant_id', restaurantId)
    .order('display_order')
  if (productError) {
    return NextResponse.json({ error: `품목 조회 실패: ${productError.message}` }, { status: 500 })
  }

  const productIds = (productRows ?? []).map(row => row.product_id)
  const { priceMap } = await buildPriceMapByProduct(
    db,
    productIds,
    businessDate!,
    restaurant.organization_id,
  )

  return NextResponse.json({ prices: priceMap })
}
