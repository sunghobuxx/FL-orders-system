export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'

import { createAdminClient } from '@/lib/supabase/admin'
import { getSessionUser } from '@/lib/supabase/server'
import { syncSpecFromOrders } from '@/lib/specs/sync'

/**
 * 발주는 있는데 명세서가 없는 날을 찾아 명세서를 만든다.
 *
 * 명세서는 그동안 발주가 **웹 API 를 지날 때만** 만들어졌다. syncSpecFromOrders 를 부르는
 * 곳이 member/orders, admin/orders, generate-specs 셋뿐이고 셋 다 사람이 화면에서 뭔가를
 * 눌러야 도는 경로다. 그래서 그 셋을 거치지 않고 들어온 발주는 명세서가 영영 없었다.
 *
 * 실제로 출시된 모바일 앱이 그 경우다. 앱은 Supabase 에 order_batches·orders·order_items 를
 * 직접 넣고 상태까지 submitted 로 바꾼다. 웹 API 를 지나지 않으니 명세서도 없고
 * order_items.unit_price_snapshot 도 0 으로 남는다.
 * (2026-08-07 확인: 8/3~8/7 에 8건 1,016,000원어치가 빠져 있었고, 월미당·안산선부점은
 *  그 주 정산서 자체가 만들어지지 않아 청구가 통째로 누락됐다.)
 *
 * 앱을 API 경유로 바꾸는 작업이 따로 있지만, 스토어 배포 뒤에도 구버전 앱은 한동안 남는다.
 * 쓰는 쪽을 다 고치는 것보다 읽는 쪽에서 빠진 것을 줍는 편이 확실하다.
 *
 * **없는 것만 만든다.** 이미 있는 명세서는 건드리지 않는다. 관리자가 손으로 고친 수량·단가를
 * 덮어쓰지 않기 위해서다. 발주가 나중에 바뀌어 명세서가 옛것이 된 경우는 여기서 다루지 않는다.
 */

/** 기본 훑는 범위. 발주는 내일치로도 들어오므로 뒤쪽을 하루 열어 둔다. */
const DAYS_BACK = 3
const DAYS_AHEAD = 1

function kstDate(offsetDays = 0) {
  return new Date(Date.now() + 9 * 3600_000 + offsetDays * 86400_000).toISOString().slice(0, 10)
}

export async function POST(req: NextRequest) {
  try {
    const secret = process.env.PUSH_CRON_SECRET
    const isCron = Boolean(secret) && req.headers.get('Authorization') === `Bearer ${secret}`
    if (!isCron) {
      const { user } = await getSessionUser()
      if (!user) return NextResponse.json({ error: '권한이 없습니다' }, { status: 401 })
    }

    // dryRun 은 찾기만 하고 만들지 않는다. 과거 날짜를 훑어볼 때 쓴다 —
    // 이미 청구가 끝난 기간에 명세서를 새로 만들면 그 주 청구액이 바뀐다.
    const body = await req.json().catch(() => ({})) as { from?: string; to?: string; dryRun?: boolean }
    const from = body.from ?? kstDate(-DAYS_BACK)
    const to = body.to ?? kstDate(DAYS_AHEAD)
    const dryRun = body.dryRun === true

    // 데이터 작업은 service role 로 한다. 세션(RLS)으로 읽으면 막혀도 에러가 안 나
    // 조용히 빈 결과가 되어 "빠진 게 없다" 로 보인다.
    const adminDb = createAdminClient()

    // status 를 좁히지 않는다. 어떤 상태로 들어온 발주든 명세서는 있어야 한다.
    // (앱이 넣는 배치는 submitted 로 시작하고, generate-specs 는 이 상태를 보지 않아
    //  버튼을 눌러도 잡히지 않았다.)
    const { data: batches, error: batchError } = await adminDb
      .from('order_batches')
      .select('id, restaurant_id, business_date')
      .gte('business_date', from)
      .lte('business_date', to)
    if (batchError) {
      return NextResponse.json({ error: `배치 조회 실패: ${batchError.message}` }, { status: 500 })
    }
    if (!batches?.length) return NextResponse.json({ success: true, from, to, created: 0, specs: [] })

    const { data: specs } = await adminDb
      .from('daily_specs')
      .select('restaurant_id, business_date')
      .gte('business_date', from)
      .lte('business_date', to)
    const has = new Set(
      (specs ?? []).map((s: { restaurant_id: string; business_date: string }) =>
        `${s.restaurant_id}|${s.business_date}`))

    const missing = batches.filter((b: { restaurant_id: string; business_date: string }) =>
      !has.has(`${b.restaurant_id}|${b.business_date}`))
    if (!missing.length) return NextResponse.json({ success: true, from, to, created: 0, specs: [] })

    if (dryRun) {
      const ids = [...new Set(missing.map((b: { restaurant_id: string }) => b.restaurant_id))]
      const { data: rows } = await adminDb
        .from('restaurants').select('id, organizations(name)').in('id', ids)
      const nameOf = Object.fromEntries((rows ?? []).map((r: any) => [
        r.id, (Array.isArray(r.organizations) ? r.organizations[0] : r.organizations)?.name ?? r.id,
      ]))
      return NextResponse.json({
        success: true, from, to, dryRun: true, created: 0,
        missing: missing.map((b: { restaurant_id: string; business_date: string }) => ({
          org: nameOf[b.restaurant_id], restaurantId: b.restaurant_id, businessDate: b.business_date,
        })),
      })
    }

    const restaurantIds = [...new Set(missing.map((b: { restaurant_id: string }) => b.restaurant_id))]
    const { data: restaurantRows } = await adminDb
      .from('restaurants').select('id, organization_id').in('id', restaurantIds)
    const orgOf = Object.fromEntries(
      (restaurantRows ?? []).map((r: { id: string; organization_id: string | null }) =>
        [r.id, r.organization_id]))

    const created: Array<{ restaurantId: string; businessDate: string; specId: string }> = []
    const failed: Array<{ restaurantId: string; businessDate: string; error: string }> = []

    for (const batch of missing as Array<{ id: string; restaurant_id: string; business_date: string }>) {
      try {
        const { data: orders } = await adminDb.from('orders').select('id').eq('batch_id', batch.id)
        const orderIds = (orders ?? []).map((o: { id: string }) => o.id)
        if (!orderIds.length) continue

        const specId = await syncSpecFromOrders(adminDb, {
          restaurantId: batch.restaurant_id,
          businessDate: batch.business_date,
          orderIds,
          organizationId: orgOf[batch.restaurant_id] ?? null,
        })
        if (specId) {
          created.push({ restaurantId: batch.restaurant_id, businessDate: batch.business_date, specId })
        }
      } catch (e) {
        // 한 곳이 실패해도 나머지는 계속 줍는다. 다음 회차에 다시 시도된다.
        const message = e instanceof Error ? e.message : String(e)
        console.error('[sweep-specs] 명세서 생성 실패', batch.restaurant_id, batch.business_date, message)
        failed.push({ restaurantId: batch.restaurant_id, businessDate: batch.business_date, error: message })
      }
    }

    if (created.length || failed.length) {
      console.log(`[sweep-specs] ${from}~${to} 생성 ${created.length}건, 실패 ${failed.length}건`)
    }

    return NextResponse.json({
      success: true, from, to, created: created.length, specs: created, failed,
    })
  } catch (e) {
    console.error('[POST /api/admin/orders/sweep-specs]', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '훑는 중 오류가 발생했습니다' },
      { status: 500 },
    )
  }
}
