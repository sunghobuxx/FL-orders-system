export const runtime = 'edge'

import { NextResponse } from 'next/server'

import { createAdminClient } from '@/lib/supabase/admin'
import { getAdminSession } from '@/lib/admin-member-user'

// 공급처 추가 (해제됐던 연결이면 다시 살린다).
// updated_at 을 지금으로 찍는다 — 발주 배정은 활성 연결 중 updated_at 최신이 우선이라,
// 새로 붙이거나 다시 붙인 공급처가 바로 발주를 받게 된다.
export async function POST(req: Request) {
  try {
    const body = await req.json() as {
      productId: string; supplierId: string; supplierName: string; purchaseUnit: string
    }
    // 로그인만 보면 회원 계정으로도 통과한다. 관리자 권한까지 확인한다.
    const session = await getAdminSession()
    if (!session) return NextResponse.json({ error: '권한이 없습니다' }, { status: 403 })
    // 데이터 작업은 service role 로 한다. 세션(RLS)으로 쓰면 막혀도 에러가 안 나
    // 조용히 실패하거나 조회가 null 이 되어 엉뚱한 404 가 난다.
    const db = createAdminClient()
    const { error } = await db.from('supplier_products').upsert(
      {
        supplier_id: body.supplierId, product_id: body.productId,
        supplier_name: body.supplierName, purchase_unit: body.purchaseUnit,
        status: 'active', updated_at: new Date().toISOString(),
      },
      { onConflict: 'supplier_id,product_id' }
    )
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : '오류' }, { status: 500 })
  }
}

// 해제한 공급처 다시 연결. 품목명·매입단위·단가 기록은 해제 전 그대로 돌아온다.
export async function PATCH(req: Request) {
  try {
    const { supplierProductId } = await req.json() as { supplierProductId: string }
    if (!supplierProductId) return NextResponse.json({ error: 'supplierProductId 누락' }, { status: 400 })
    const session = await getAdminSession()
    if (!session) return NextResponse.json({ error: '권한이 없습니다' }, { status: 403 })
    const db = createAdminClient()
    const { data, error } = await db.from('supplier_products')
      .update({ status: 'active', updated_at: new Date().toISOString() })
      .eq('id', supplierProductId)
      .select('id')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data?.length) return NextResponse.json({ error: '연결을 찾을 수 없습니다' }, { status: 404 })
    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : '오류' }, { status: 500 })
  }
}

// 공급처 연결 해제.
//
// 행을 지우지 않고 status 만 'inactive' 로 바꾼다. 예전에는 단가 기록(price_snapshots)을
// 지우고 발주(order_items)의 연결을 끊은 뒤 행을 삭제해서, 업체별 발주·단가 이력이
// 사라지고 다시 연결해도 되살릴 수 없었다 (2026-11-13 인숙이네 양배추: 발주 257건·단가 110건).
//
// 발주 배정·명세서 단가·매입원가·발주 문자는 모두 status='active' 연결만 보므로
// 비활성으로 돌리는 것만으로 이 공급처는 더 이상 발주를 받지 않는다.
// PATCH 로 다시 연결하면 기록이 그대로 돌아온다.
export async function DELETE(req: Request) {
  try {
    const { supplierProductId } = await req.json() as { supplierProductId: string }
    if (!supplierProductId) return NextResponse.json({ error: 'supplierProductId 누락' }, { status: 400 })
    // 로그인만 보면 회원 계정으로도 통과한다. 관리자 권한까지 확인한다.
    const session = await getAdminSession()
    if (!session) return NextResponse.json({ error: '권한이 없습니다' }, { status: 403 })
    const db = createAdminClient()

    const { data, error } = await db.from('supplier_products')
      .update({ status: 'inactive' })
      .eq('id', supplierProductId)
      .select('id')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data?.length) return NextResponse.json({ error: '연결을 찾을 수 없습니다' }, { status: 404 })

    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : '오류' }, { status: 500 })
  }
}
