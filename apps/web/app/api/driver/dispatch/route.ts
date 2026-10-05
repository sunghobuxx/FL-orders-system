export const runtime = 'edge'

import { NextResponse } from 'next/server'

import { getKstToday } from '@/lib/date-kst'
import { requireDriverUser } from '@/lib/driver-api'
import { loadDriverDispatch } from '@/lib/driver-dispatch'

export async function GET(req: Request) {
  const ctx = await requireDriverUser(req)
  if ('error' in ctx) return ctx.error
  const date = new URL(req.url).searchParams.get('date') ?? getKstToday()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(`${date}T00:00:00Z`)) || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) {
    return NextResponse.json({ error: '올바른 조회 날짜를 선택해 주세요.' }, { status: 400 })
  }
  try {
    return NextResponse.json(await loadDriverDispatch(ctx.db, date, ctx.assignedRestaurantIds))
  } catch (error) {
    console.error('[driver/dispatch]', error)
    return NextResponse.json({ error: '발주 내역을 불러오지 못했습니다.' }, { status: 500 })
  }
}

const RANK: Record<string, number> = {
  open: 0, submitted: 1, validated: 2, ordered: 3, dispatched: 4, completed: 5,
}

export async function POST(req: Request) {
  const ctx = await requireDriverUser(req)
  if ('error' in ctx) return ctx.error

  const body = await req.json().catch(() => ({})) as {
    itemId?: string
    supplierId?: string
    businessDate?: string
    stage?: number
  }
  const { itemId, supplierId, businessDate } = body
  const stage = Number(body.stage)
  if (!itemId || !supplierId || !businessDate) {
    return NextResponse.json({ error: '필수 값이 없습니다.' }, { status: 400 })
  }
  if (![0, 1].includes(stage)) {
    return NextResponse.json({ error: '상차 확인 단계가 올바르지 않습니다.' }, { status: 400 })
  }

  // 공급처별 발주 화면에 실제 포함된 품목만 변경한다. 클라이언트가 임의의
  // order_item id를 보내 다른 날짜·공급처 발주를 바꾸지 못하게 한다.
  const { data: dispatchRow, error: dispatchError } = await ctx.db
    .from('dispatch_job_items')
    .select('order_item_id, dispatch_jobs!inner(supplier_id, business_date)')
    .eq('order_item_id', itemId)
    .eq('dispatch_jobs.supplier_id', supplierId)
    .eq('dispatch_jobs.business_date', businessDate)
    .maybeSingle()
  if (dispatchError) return NextResponse.json({ error: dispatchError.message }, { status: 500 })
  if (!dispatchRow) return NextResponse.json({ error: '해당 공급처 발주 품목을 찾을 수 없습니다.' }, { status: 404 })

  const { data: touched, error: updateError } = await ctx.db
    .from('order_items')
    .update({ check_stage: stage })
    .eq('id', itemId)
    .select('id, order_id')
    .single()
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

  const { data: order } = await ctx.db
    .from('orders').select('batch_id').eq('id', touched.order_id).maybeSingle()
  if (!order?.batch_id) return NextResponse.json({ error: '발주를 찾을 수 없습니다.' }, { status: 404 })

  const { data: orders } = await ctx.db.from('orders').select('id').eq('batch_id', order.batch_id)
  const orderIds = (orders ?? []).map((row: { id: string }) => row.id)
  const { data: allItems } = await ctx.db
    .from('order_items').select('check_stage').in('order_id', orderIds)
  const stages = (allItems ?? []).map((item: { check_stage: number | null }) => Number(item.check_stage ?? 0))

  const { data: batch } = await ctx.db
    .from('order_batches').select('status').eq('id', order.batch_id).maybeSingle()
  let batchStatus = batch?.status ?? ''
  if (stages.length > 0 && stages.every(value => value >= 1) && (RANK[batchStatus] ?? 0) < RANK.ordered) {
    const { error } = await ctx.db.from('order_batches').update({ status: 'ordered' }).eq('id', order.batch_id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    batchStatus = 'ordered'
  }

  return NextResponse.json({ success: true, batchId: order.batch_id, batchStatus })
}
