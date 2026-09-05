export const runtime = 'edge'

import { NextResponse } from 'next/server'

import { createAdminClient } from '@/lib/supabase/admin'
import { getAdminSession } from '@/lib/admin-member-user'

// 공급처 추가
export async function POST(req: Request) {
  try {
    const body = await req.json() as {
      productId: string; supplierId: string; supplierName: string; purchaseUnit: string
    }
    // 로그인만 보면 회원 계정으로도 통과한다. 관리자 권한까지 확인한다.
    const session = await getAdminSession()
    if (!session) return NextResponse.json({ error: '권한이 없습니다' }, { status: 403 })
    const { user } = session
    // 데이터 작업은 service role 로 한다. 세션(RLS)으로 쓰면 막혀도 에러가 안 나
    // 조용히 실패하거나 조회가 null 이 되어 엉뚱한 404 가 난다.
    const db = createAdminClient()
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

// 공급처 삭제.
//
// price_snapshots 와 order_items 가 이 행을 가리킨다. 예전에는 단가만 지우고
// supplier_products 를 지워서, 발주 이력이 있으면 FK 위반으로 실패했다
// (order_items_supplier_product_id_fkey). 발주는 지울 수 없는 기록이므로
// **연결만 끊는다** — order_items.supplier_product_id 는 null 을 허용한다.
//
// 지우기 전에 몇 건이 걸려 있는지 알려 준다. force 없이 부르면 세어서 돌려주고 멈춘다.
export async function DELETE(req: Request) {
  try {
    const { supplierProductId, force } = await req.json() as {
      supplierProductId: string; force?: boolean
    }
    // 로그인만 보면 회원 계정으로도 통과한다. 관리자 권한까지 확인한다.
    const session = await getAdminSession()
    if (!session) return NextResponse.json({ error: '권한이 없습니다' }, { status: 403 })
    const { user } = session
    // 데이터 작업은 service role 로 한다. 세션(RLS)으로 쓰면 막혀도 에러가 안 나
    // 조용히 실패하거나 조회가 null 이 되어 엉뚱한 404 가 난다.
    const db = createAdminClient()

    // 1. 무엇이 걸려 있는지 센다
    const [{ count: orderCount }, { count: snapCount }] = await Promise.all([
      db.from('order_items').select('id', { count: 'exact', head: true })
        .eq('supplier_product_id', supplierProductId),
      db.from('price_snapshots').select('id', { count: 'exact', head: true })
        .eq('supplier_product_id', supplierProductId),
    ])

    // 2. 확인 전이면 세어서 돌려주고 멈춘다
    if (!force) {
      return NextResponse.json({
        needsConfirm: true,
        orderItemCount: orderCount ?? 0,
        priceSnapshotCount: snapCount ?? 0,
      })
    }

    // 3. 발주 이력의 연결만 끊는다. 발주 자체는 지우지 않는다.
    if ((orderCount ?? 0) > 0) {
      const { error: oiErr } = await db.from('order_items')
        .update({ supplier_product_id: null }).eq('supplier_product_id', supplierProductId)
      if (oiErr) return NextResponse.json({ error: oiErr.message }, { status: 500 })
    }

    // 4. 단가 이력 삭제
    const { error: snapErr } = await db.from('price_snapshots').delete().eq('supplier_product_id', supplierProductId)
    if (snapErr) return NextResponse.json({ error: snapErr.message }, { status: 500 })

    // 5. 공급처 연결 삭제
    const { error } = await db.from('supplier_products').delete().eq('id', supplierProductId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({
      success: true,
      unlinkedOrderItems: orderCount ?? 0,
      deletedPriceSnapshots: snapCount ?? 0,
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : '오류' }, { status: 500 })
  }
}
