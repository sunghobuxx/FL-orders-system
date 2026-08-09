export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'

import { createAdminClient } from '@/lib/supabase/admin'
import { getSessionUser } from '@/lib/supabase/server'
import { fetchAll } from '@/lib/supabase/fetch-all'
import { buildPriceMapByProduct } from '@/lib/specs/sync'
import { buildAddable, canMemberRemove, type CatalogProduct } from '@/lib/products/self-add'

/**
 * 회원이 자기 발주 품목을 직접 넣고 뺀다.
 *
 * 단가가 있는 품목은 바로 열고, 없는 품목은 product_requests 에 쌓아 관리자 확인을
 * 거친다. 단가 없이 발주되면 명세서가 0 원으로 나가기 때문이다
 * (2026-08-09 일회용 손장갑).
 *
 * 관리자가 넣어 준 기본 품목은 회원이 빼지 못한다.
 */

/** 쿠키 세션과 Bearer 토큰을 둘 다 받는다. 모바일 앱은 쿠키가 없다. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function resolveUserId(req: NextRequest, db: any): Promise<string | null> {
  const auth = req.headers.get('Authorization')
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : ''
  if (token) {
    const { data, error } = await db.auth.getUser(token)
    if (error || !data.user) return null
    return data.user.id
  }
  const { user } = await getSessionUser()
  return user?.id ?? null
}

/** 이 회원이 그 식당을 다룰 수 있는지. 없으면 null. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertAccess(db: any, userId: string, restaurantId: string) {
  const { data: restaurant } = await db
    .from('restaurants').select('id, organization_id').eq('id', restaurantId).maybeSingle()
  if (!restaurant) return null
  const { data: membership } = await db
    .from('memberships').select('organization_id')
    .eq('user_id', userId).eq('organization_id', restaurant.organization_id).maybeSingle()
  return membership ? restaurant : null
}

export async function GET(req: NextRequest) {
  try {
    const db = createAdminClient()
    const userId = await resolveUserId(req, db)
    if (!userId) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })

    const restaurantId = req.nextUrl.searchParams.get('restaurantId') ?? ''
    const businessDate = req.nextUrl.searchParams.get('businessDate') ?? ''
    if (!restaurantId || !/^\d{4}-\d{2}-\d{2}$/.test(businessDate)) {
      return NextResponse.json({ error: '식당 또는 발주 일자가 올바르지 않습니다.' }, { status: 400 })
    }

    const restaurant = await assertAccess(db, userId, restaurantId)
    if (!restaurant) return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 })

    const all = await fetchAll<CatalogProduct>(() => db
      .from('products').select('id, standard_name, category, default_unit').eq('status', 'active'))

    const mine = await fetchAll<{ product_id: string }>(() => db
      .from('restaurant_products').select('product_id').eq('restaurant_id', restaurantId))
    const mineIds = new Set(mine.map(m => m.product_id))

    const pendingRows = await fetchAll<{ product_id: string }>(() => db
      .from('product_requests').select('product_id')
      .eq('restaurant_id', restaurantId).eq('status', 'pending'))
    const pendingIds = new Set(pendingRows.map(r => r.product_id))

    const { priceMap } = await buildPriceMapByProduct(
      db, all.map(p => p.id), businessDate, restaurant.organization_id)
    const priceOf = new Map(Object.entries(priceMap).map(([k, v]) => [k, Number(v)]))

    const addable = buildAddable(all, mineIds, pendingIds, priceOf)
      .sort((a, b) => a.standard_name.localeCompare(b.standard_name, 'ko'))

    const nameOf = new Map(all.map(p => [p.id, p.standard_name]))
    return NextResponse.json({
      addable,
      pending: [...pendingIds].map(id => ({ product_id: id, standard_name: nameOf.get(id) ?? '품목' })),
    })
  } catch (e) {
    console.error('[GET /api/member/products]', e)
    return NextResponse.json({ error: '품목을 불러오지 못했습니다.' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const { restaurantId, productIds } = await req.json() as {
      restaurantId?: string; productIds?: string[]
    }
    if (!restaurantId || !Array.isArray(productIds) || productIds.length === 0) {
      return NextResponse.json({ error: '추가할 품목을 선택하세요.' }, { status: 400 })
    }

    const db = createAdminClient()
    const userId = await resolveUserId(req, db)
    if (!userId) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })

    const restaurant = await assertAccess(db, userId, restaurantId)
    if (!restaurant) return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 })

    // 활성 품목만 받는다. 없는 id 를 넣으면 FK 로 죽는다.
    const { data: valid } = await db
      .from('products').select('id').eq('status', 'active').in('id', productIds)
    const validIds = (valid ?? []).map((p: { id: string }) => p.id)
    if (!validIds.length) {
      return NextResponse.json({ error: '추가할 수 있는 품목이 아닙니다.' }, { status: 400 })
    }

    // 오늘 기준 단가로 판정한다. 단가가 없는 것만 요청으로 보낸다.
    const today = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10)
    const { priceMap } = await buildPriceMapByProduct(db, validIds, today, restaurant.organization_id)

    const added: string[] = []
    const requested: string[] = []
    for (const id of validIds) {
      if (Number(priceMap[id] ?? 0) > 0) added.push(id)
      else requested.push(id)
    }

    // 실제로 넣은 것만 돌려준다. 이미 있는 것까지 세어 돌려주면 화면에
    // "1개 추가됐습니다" 라고 뜨는데 실제로는 아무 것도 안 들어간 상태가 된다.
    let addedFresh: string[] = []
    let requestedFresh: string[] = []

    if (added.length) {
      // 이미 열려 있는 품목은 건드리지 않는다. UNIQUE 로 죽으면 나머지도 같이 안 들어간다.
      const { data: exist } = await db
        .from('restaurant_products').select('product_id')
        .eq('restaurant_id', restaurantId).in('product_id', added)
      const have = new Set((exist ?? []).map((r: { product_id: string }) => r.product_id))
      addedFresh = added.filter(id => !have.has(id))

      if (addedFresh.length) {
        const { error } = await db.from('restaurant_products').insert(
          addedFresh.map(pid => ({
            restaurant_id: restaurantId,
            product_id: pid,
            added_by: 'member',
            added_by_user: userId,
          })))
        if (error) return NextResponse.json({ error: `품목 추가 실패: ${error.message}` }, { status: 500 })
      }
    }

    if (requested.length) {
      // 이미 대기 중인 건은 빼고 넣는다. 부분 unique 인덱스에 걸리면 전부 실패한다.
      const { data: exist } = await db
        .from('product_requests').select('product_id')
        .eq('restaurant_id', restaurantId).eq('status', 'pending').in('product_id', requested)
      const have = new Set((exist ?? []).map((r: { product_id: string }) => r.product_id))
      requestedFresh = requested.filter(id => !have.has(id))

      if (requestedFresh.length) {
        const { error } = await db.from('product_requests').insert(
          requestedFresh.map(pid => ({
            restaurant_id: restaurantId, product_id: pid, requested_by: userId,
          })))
        if (error) {
          return NextResponse.json({ error: `요청 등록 실패: ${error.message}` }, { status: 500 })
        }
      }
    }

    return NextResponse.json({
      added: addedFresh,
      requested: requestedFresh,
      // 이미 목록에 있거나 이미 요청해 둔 것
      skipped: (added.length - addedFresh.length) + (requested.length - requestedFresh.length),
    })
  } catch (e) {
    console.error('[POST /api/member/products]', e)
    return NextResponse.json({ error: '품목을 추가하지 못했습니다.' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const db = createAdminClient()
    const userId = await resolveUserId(req, db)
    if (!userId) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })

    const restaurantId = req.nextUrl.searchParams.get('restaurantId') ?? ''
    const productId = req.nextUrl.searchParams.get('productId') ?? ''
    if (!restaurantId || !productId) {
      return NextResponse.json({ error: '품목 정보가 없습니다.' }, { status: 400 })
    }

    const restaurant = await assertAccess(db, userId, restaurantId)
    if (!restaurant) return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 })

    const { data: row } = await db
      .from('restaurant_products').select('id, added_by')
      .eq('restaurant_id', restaurantId).eq('product_id', productId).maybeSingle()
    if (!row) return NextResponse.json({ error: '목록에 없는 품목입니다.' }, { status: 404 })

    if (!canMemberRemove(row.added_by ?? '')) {
      return NextResponse.json(
        { error: '담당자가 등록한 기본 품목은 뺄 수 없습니다.' }, { status: 403 })
    }

    const { error } = await db.from('restaurant_products').delete().eq('id', row.id)
    if (error) return NextResponse.json({ error: `삭제 실패: ${error.message}` }, { status: 500 })

    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('[DELETE /api/member/products]', e)
    return NextResponse.json({ error: '품목을 빼지 못했습니다.' }, { status: 500 })
  }
}
