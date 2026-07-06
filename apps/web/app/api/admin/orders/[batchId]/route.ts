export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// 발주 삭제
export async function DELETE(_req: NextRequest, context: { params: Promise<{ batchId: string }> }) {
  try {
    const { batchId } = await context.params
    const { supabase: db } = await getSessionUser()

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

    const { supabase: db } = await getSessionUser()
    const adminDb = createAdminClient()

    // 기존 날짜 조회
    const { data: batch } = await db
      .from('order_batches')
      .select('business_date, restaurant_id')
      .eq('id', batchId)
      .single()

    const oldDate = batch?.business_date
    const restaurantId = batch?.restaurant_id

    // 1) 발주 날짜 변경
    const { error } = await db
      .from('order_batches')
      .update({ business_date: businessDate })
      .eq('id', batchId)

    if (error) {
      console.error('[PATCH /api/admin/orders/[batchId]]', error)
      return NextResponse.json({ error: '날짜 변경 실패' }, { status: 500 })
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
