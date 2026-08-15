export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAdminSession } from '@/lib/admin-member-user'

// 발주 삭제
export async function DELETE(_req: NextRequest, context: { params: Promise<{ batchId: string }> }) {
  try {
    const { batchId } = await context.params
    // 로그인만 보면 회원 계정으로도 통과한다. 관리자 권한까지 확인한다.
    const session = await getAdminSession()
    if (!session) return NextResponse.json({ error: '권한이 없습니다' }, { status: 403 })
    const { user } = session
    // 데이터 작업은 service role 로 한다. 세션(RLS)으로 쓰면 막혀도 에러가 안 나
    // 조용히 실패하거나 조회가 null 이 되어 엉뚱한 404 가 난다.
    const db = createAdminClient()

    // 삭제 순서: dispatch_job_items → order_items → orders → order_batches
    // dispatch_job_items 삭제 (order_item_id FK)
    const { data: orders } = await db.from('orders').select('id').eq('batch_id', batchId)
    const orderIds = (orders ?? []).map((o: { id: string }) => o.id)

    if (orderIds.length > 0) {
      const { data: items } = await db.from('order_items').select('id').in('order_id', orderIds)
      const itemIds = (items ?? []).map((i: { id: string }) => i.id)

      if (itemIds.length > 0) {
        // dispatch_job_items FK 먼저
        await db.from('dispatch_job_items').delete().in('order_item_id', itemIds)
        // daily_spec_lines.order_item_id FK — order_item_id 를 NULL 로 해제 후 삭제
        await db.from('daily_spec_lines').update({ order_item_id: null }).in('order_item_id', itemIds)
      }
      await db.from('order_items').delete().in('order_id', orderIds)
      await db.from('orders').delete().in('batch_id', [batchId])
    }

    const { error } = await db.from('order_batches').delete().eq('id', batchId)
    if (error) {
      console.error('[DELETE /api/admin/orders/[batchId]]', error)
      return NextResponse.json({ error: '발주 삭제 실패' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('[DELETE /api/admin/orders/[batchId]] unexpected', e)
    return NextResponse.json({ error: '요청 처리 중 오류가 발생했습니다' }, { status: 500 })
  }
}

// 발주 날짜 변경 (어드민 전용)
export async function PATCH(req: NextRequest, context: { params: Promise<{ batchId: string }> }) {
  try {
    const { batchId } = await context.params
    const { businessDate } = await req.json()

    if (!businessDate || !/^\d{4}-\d{2}-\d{2}$/.test(businessDate)) {
      return NextResponse.json({ error: '올바른 날짜 형식이 아닙니다 (YYYY-MM-DD)' }, { status: 400 })
    }

    // 이 라우트의 나머지 단계는 전부 adminDb 를 쓴다. 조회·변경만 사용자 세션을 쓰면
    // 세션이 끊겼을 때 RLS 에 막혀 0행만 업데이트되는데, PostgREST 는 그걸 에러로 주지 않아
    // success 를 돌려주고 화면만 새로고침된다 (날짜가 안 바뀌는 것처럼 보임).
    const adminDb = createAdminClient()

    // 기존 날짜 조회
    const { data: batch } = await adminDb
      .from('order_batches')
      .select('business_date, restaurant_id')
      .eq('id', batchId)
      .maybeSingle()

    if (!batch) {
      return NextResponse.json({ error: '발주를 찾을 수 없습니다' }, { status: 404 })
    }

    const oldDate = batch.business_date
    const restaurantId = batch.restaurant_id

    // 같은 식당·날짜 배치가 이미 있으면 unique 제약에 걸린다. 먼저 알려준다.
    if (oldDate !== businessDate) {
      const { data: clash } = await adminDb
        .from('order_batches')
        .select('id')
        .eq('restaurant_id', restaurantId)
        .eq('business_date', businessDate)
        .maybeSingle()
      if (clash) {
        return NextResponse.json(
          { error: `${businessDate} 에 이미 발주가 있습니다. 먼저 정리해 주세요.` },
          { status: 409 },
        )
      }
    }

    // 1) 발주 날짜 변경 — 실제로 바뀐 행을 돌려받아 확인한다
    const { data: updated, error } = await adminDb
      .from('order_batches')
      .update({ business_date: businessDate })
      .eq('id', batchId)
      .select('id')

    if (error) {
      console.error('[PATCH /api/admin/orders/[batchId]]', error)
      return NextResponse.json({ error: `날짜 변경 실패: ${error.message}` }, { status: 500 })
    }
    if (!updated?.length) {
      return NextResponse.json({ error: '날짜가 변경되지 않았습니다' }, { status: 500 })
    }

    if (oldDate && oldDate !== businessDate) {
      // 2) 연결된 daily_spec 날짜도 함께 변경
      if (restaurantId) {
        await adminDb
          .from('daily_specs')
          .update({ business_date: businessDate })
          .eq('restaurant_id', restaurantId)
          .eq('business_date', oldDate)
      }

      // 3) dispatch_job_items 동기화: 이 배치 order_items를 새 날짜 dispatch_job으로 이동
      const { data: ordersData } = await adminDb.from('orders').select('id').eq('batch_id', batchId)
      const orderIds = (ordersData ?? []).map((o: { id: string }) => o.id)

      if (orderIds.length > 0) {
        const { data: items } = await adminDb
          .from('order_items')
          .select('id, product_id, qty, supplier_product_id')
          .in('order_id', orderIds)

        const itemIds = (items ?? []).map((i: { id: string }) => i.id)
        if (itemIds.length > 0) {
          // 기존 dispatch_job_items 제거 (어느 날짜든)
          await adminDb.from('dispatch_job_items').delete().in('order_item_id', itemIds)

          // 공급처 매핑 조회
          const productIds = [...new Set((items ?? []).map((i: { product_id: string }) => i.product_id).filter(Boolean))]
          const spIds = [...new Set((items ?? []).map((i: { supplier_product_id: string | null }) => i.supplier_product_id).filter(Boolean) as string[])]

          const [{ data: spByProduct }, { data: spById }] = await Promise.all([
            productIds.length
              ? adminDb.from('supplier_products').select('product_id, supplier_id, updated_at')
                  .in('product_id', productIds).eq('status', 'active').order('updated_at', { ascending: false })
              : Promise.resolve({ data: [] as { product_id: string; supplier_id: string }[] }),
            spIds.length
              ? adminDb.from('supplier_products').select('id, supplier_id').in('id', spIds)
              : Promise.resolve({ data: [] as { id: string; supplier_id: string }[] }),
          ])

          const productToSupplier: Record<string, string> = {}
          for (const row of spByProduct ?? []) {
            if (!productToSupplier[row.product_id]) productToSupplier[row.product_id] = row.supplier_id
          }
          const spToSupplier = Object.fromEntries((spById ?? []).map((r: { id: string; supplier_id: string }) => [r.id, r.supplier_id]))

          // 관련 공급처의 새 날짜 dispatch_jobs 한 번에 조회
          const supplierIds = new Set<string>()
          for (const item of items ?? []) {
            const sid = item.supplier_product_id
              ? (spToSupplier[item.supplier_product_id] ?? productToSupplier[item.product_id])
              : productToSupplier[item.product_id]
            if (sid) supplierIds.add(sid)
          }

          const { data: newJobs } = supplierIds.size
            ? await adminDb.from('dispatch_jobs').select('id, supplier_id')
                .eq('business_date', businessDate).in('supplier_id', [...supplierIds])
            : { data: [] as { id: string; supplier_id: string }[] }

          const jobBySupplier = Object.fromEntries((newJobs ?? []).map((j: { id: string; supplier_id: string }) => [j.supplier_id, j.id]))

          const toInsert: { dispatch_job_id: string; order_item_id: string; qty: number }[] = []
          for (const item of items ?? []) {
            const supplierId = item.supplier_product_id
              ? (spToSupplier[item.supplier_product_id] ?? productToSupplier[item.product_id])
              : productToSupplier[item.product_id]
            if (!supplierId) continue
            const jobId = jobBySupplier[supplierId]
            if (!jobId) continue
            toInsert.push({ dispatch_job_id: jobId, order_item_id: item.id, qty: Number(item.qty) })
          }

          if (toInsert.length > 0) {
            await adminDb.from('dispatch_job_items').insert(toInsert)
          }
        }
      }
    }

    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('[PATCH /api/admin/orders/[batchId]] unexpected', e)
    return NextResponse.json({ error: '요청 처리 중 오류가 발생했습니다' }, { status: 500 })
  }
}
