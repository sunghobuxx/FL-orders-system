import { NextResponse } from 'next/server'

import { createAdminClient } from '@/lib/supabase/admin'

export const DRIVER_NOTE_CATEGORY = 'work_note'

export function getKstToday() {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

export function addDays(dateStr: string, days: number) {
  const date = new Date(`${dateStr}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

export async function requireDriverUser(req: Request) {
  const auth = req.headers.get('Authorization')
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : ''
  if (!token) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }

  const db = createAdminClient()
  const { data: userData, error: userError } = await db.auth.getUser(token)
  if (userError || !userData.user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }

  const { data: membership } = await db
    .from('memberships')
    .select('role, organizations(organization_type)')
    .eq('user_id', userData.user.id)
    .maybeSingle()

  // 'owner'는 운영사 오너와 식당 사장님이 함께 쓰는 역할명이다.
  // 역할만 보고 열면 식당 사장님이 전 업체 배송 데이터를 보게 되므로 조직 타입까지 확인한다.
  const organization = Array.isArray(membership?.organizations)
    ? membership.organizations[0]
    : membership?.organizations
  const isOperatorOwner = membership?.role === 'owner' &&
    ['platform', 'operator'].includes(
      (organization as { organization_type: string } | null)?.organization_type ?? '',
    )

  if (!membership || !(['admin', 'manager'].includes(membership.role) || isOperatorOwner)) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }

  const { data: assigned, error: assignedError } = await db
    .from('manager_restaurants')
    .select('restaurant_id')
    .eq('user_id', userData.user.id)

  if (assignedError) {
    console.error('Failed to load manager restaurant assignments:', assignedError)
    return {
      error: NextResponse.json(
        { error: '담당업체 정보를 불러오지 못했습니다.' },
        { status: 500 },
      ),
    }
  }

  // manager만 담당업체로 제한하고, admin/오너는 null(전체 조회)을 받는다.
  const assignedRestaurantIds = membership.role === 'manager'
    ? (assigned ?? []).map((row: { restaurant_id: string }) => row.restaurant_id)
    : null

  return {
    db,
    user: userData.user,
    role: membership.role as 'admin' | 'manager' | 'owner',
    assignedRestaurantIds,
  }
}

export function applyAssignedFilter<T>(
  query: T,
  assignedRestaurantIds: string[] | null,
) {
  if (assignedRestaurantIds === null) return query
  return (query as any).in('restaurant_id', assignedRestaurantIds.length ? assignedRestaurantIds : ['00000000-0000-0000-0000-000000000000']) as T
}

export async function requireBatchAccess(ctx: Awaited<ReturnType<typeof requireDriverUser>> & { error?: never }, batchId: string) {
  const { data: batch, error } = await ctx.db
    .from('order_batches')
    .select('id, restaurant_id, business_date, status')
    .eq('id', batchId)
    .maybeSingle()

  if (error || !batch) {
    return { error: NextResponse.json({ error: '발주를 찾을 수 없습니다.' }, { status: 404 }) }
  }

  if (
    ctx.assignedRestaurantIds !== null &&
    !ctx.assignedRestaurantIds.includes(batch.restaurant_id)
  ) {
    return { error: NextResponse.json({ error: '담당 업체 발주만 처리할 수 있습니다.' }, { status: 403 }) }
  }

  return { batch }
}

export function orgNameFromRestaurant(row: unknown) {
  const restaurant = row as { restaurants?: { organizations?: { name?: string } | { name?: string }[] | null } | null }
  const org = Array.isArray(restaurant.restaurants?.organizations)
    ? restaurant.restaurants?.organizations[0]
    : restaurant.restaurants?.organizations
  return org?.name ?? '알 수 없음'
}
