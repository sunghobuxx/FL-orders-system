export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAdminSession } from '@/lib/admin-member-user'

/** 같은 날·품목은 배정 줄 하나다. 다시 고르면 바꾼다. */
export async function POST(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: '권한이 없습니다' }, { status: 403 })
  const { businessDate, productId, orderItemId } = await req.json() as { businessDate?: string; productId?: string; orderItemId?: string }
  if (!businessDate || !productId || !orderItemId) return NextResponse.json({ error: '날짜·품목·발주 줄을 고르세요' }, { status: 400 })
  const db = createAdminClient()
  const { error } = await db.from('garak_allocations').upsert(
    { business_date: businessDate, product_id: productId, order_item_id: orderItemId },
    { onConflict: 'business_date,product_id' },
  )
  if (error) return NextResponse.json({ error: '저장 실패' }, { status: 500 })
  return NextResponse.json({ success: true })
}

export async function DELETE(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: '권한이 없습니다' }, { status: 403 })
  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: '필수 값 누락 (id)' }, { status: 400 })
  const db = createAdminClient()
  const { error } = await db.from('garak_allocations').delete().eq('id', id)
  if (error) return NextResponse.json({ error: '삭제 실패' }, { status: 500 })
  return NextResponse.json({ success: true })
}
