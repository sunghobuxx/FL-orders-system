export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAdminSession } from '@/lib/admin-member-user'
import { validateGarakPurchase, type GarakPurchaseInput } from '@/lib/garak/purchase'

export async function GET(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: '권한이 없습니다' }, { status: 403 })
  const date = new URL(req.url).searchParams.get('date') ?? ''
  const db = createAdminClient()
  const { data, error } = await db
    .from('garak_purchases')
    .select('id, business_date, product_id, unit, qty, unit_price, products(standard_name)')
    .eq('business_date', date)
    .order('created_at')
  if (error) return NextResponse.json({ error: '조회 실패' }, { status: 500 })
  return NextResponse.json({ rows: data ?? [] })
}

export async function POST(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: '권한이 없습니다' }, { status: 403 })
  const input = await req.json() as GarakPurchaseInput
  const problem = validateGarakPurchase(input)
  if (problem) return NextResponse.json({ error: problem }, { status: 400 })

  // 같은 날·품목·단위는 한 줄이다. 다시 입력하면 수량과 매입가를 고친다.
  const db = createAdminClient()
  const { error } = await db.from('garak_purchases').upsert({
    business_date: input.businessDate,
    product_id: input.productId,
    unit: input.unit!.trim(),
    qty: input.qty,
    unit_price: input.unitPrice,
  }, { onConflict: 'business_date,product_id,unit' })
  if (error) return NextResponse.json({ error: '저장 실패' }, { status: 500 })
  return NextResponse.json({ success: true })
}

export async function DELETE(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: '권한이 없습니다' }, { status: 403 })
  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: '필수 값 누락 (id)' }, { status: 400 })
  const db = createAdminClient()
  const { error } = await db.from('garak_purchases').delete().eq('id', id)
  if (error) return NextResponse.json({ error: '삭제 실패' }, { status: 500 })
  return NextResponse.json({ success: true })
}
