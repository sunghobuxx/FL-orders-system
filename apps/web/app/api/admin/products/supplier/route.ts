export const runtime = 'edge'

import { NextResponse } from 'next/server'

import { getSessionUser } from '@/lib/supabase/server'

// 공급처 추가
export async function POST(req: Request) {
  try {
    const body = await req.json() as {
      productId: string; supplierId: string; supplierName: string; purchaseUnit: string
    }
    const { supabase: db } = await getSessionUser()
    const { error } = await db.from('supplier_products').upsert(
      { supplier_id: body.supplierId, product_id: body.productId, supplier_name: body.supplierName, purchase_unit: body.purchaseUnit },
      { onConflict: 'supplier_id,product_id' }
    )
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : '오류' }, { status: 500 })
  }
}

// 공급처 삭제 (price_snapshots 먼저 삭제 후 supplier_products 삭제)
export async function DELETE(req: Request) {
  try {
    const { supplierProductId } = await req.json() as { supplierProductId: string }
    const { supabase: db } = await getSessionUser()

    // 1. 연결된 단가 이력 먼저 삭제
    const { error: snapErr } = await db.from('price_snapshots').delete().eq('supplier_product_id', supplierProductId)
    if (snapErr) return NextResponse.json({ error: snapErr.message }, { status: 500 })

    // 2. 공급처 연결 삭제
    const { error } = await db.from('supplier_products').delete().eq('id', supplierProductId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : '오류' }, { status: 500 })
  }
}
