export const runtime = 'edge'

import { type NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAdminSession } from '@/lib/admin-member-user'

export async function DELETE(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params
    // 로그인만 보면 회원 계정으로도 통과한다. 관리자 권한까지 확인한다.
    const session = await getAdminSession()
    if (!session) return NextResponse.json({ error: '권한이 없습니다' }, { status: 403 })
    const { user } = session
    // 데이터 작업은 service role 로 한다. 세션(RLS)으로 쓰면 막혀도 에러가 안 나
    // 조용히 실패하거나 조회가 null 이 되어 엉뚱한 404 가 난다.
    const db = createAdminClient()

    // 거래 이력이 있으면 지우지 않는다. FK 가 NO ACTION 이라 DB 에서도 막히고,
    // 억지로 지우면 발주·명세서 내역이 깨진다. 이 경우 비활성으로 안내한다.
    const blockers: string[] = []
    for (const [table, label] of [['order_items', '발주'], ['daily_spec_lines', '명세서']] as const) {
      const { count } = await db.from(table)
        .select('id', { count: 'exact', head: true }).eq('product_id', id)
      if (count) blockers.push(`${label} ${count}건`)
    }
    if (blockers.length) {
      return NextResponse.json({
        error: `거래 이력이 있어 삭제할 수 없습니다 (${blockers.join(', ')}). 대신 '비활성'으로 숨겨주세요.`,
      }, { status: 409 })
    }

    // 매핑성 자식은 먼저 정리 (supplier_products 는 FK 가 NO ACTION)
    await db.from('supplier_products').delete().eq('product_id', id)

    const { error } = await db.from('products').delete().eq('id', id)
    if (error) {
      console.error('[DELETE /api/admin/products/[id]]', error)
      return NextResponse.json({ error: `품목 삭제 실패: ${error.message}` }, { status: 500 })
    }
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: '요청 처리 중 오류가 발생했습니다' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params
    const body = await req.json()
    const { standard_name, category, default_unit, sku, taxable_flag, is_kg_based, is_fixed_price, status, allowed_units } = body

    if (!standard_name?.trim()) return NextResponse.json({ error: '품목명을 입력하세요' }, { status: 400 })
    if (!category) return NextResponse.json({ error: '카테고리를 선택하세요' }, { status: 400 })
    if (!default_unit) return NextResponse.json({ error: '기본 단위를 선택하세요' }, { status: 400 })

    // 로그인만 보면 회원 계정으로도 통과한다. 관리자 권한까지 확인한다.
    const session = await getAdminSession()
    if (!session) return NextResponse.json({ error: '권한이 없습니다' }, { status: 403 })
    const { user } = session
    // 데이터 작업은 service role 로 한다. 세션(RLS)으로 쓰면 막혀도 에러가 안 나
    // 조용히 실패하거나 조회가 null 이 되어 엉뚱한 404 가 난다.
    const db = createAdminClient()

    const { error } = await db.from('products').update({
      standard_name: standard_name.trim(),
      category,
      default_unit,
      sku: sku?.trim() || null,
      allowed_units: allowed_units ?? [],
      taxable_flag: taxable_flag ?? true,
      is_kg_based: is_kg_based ?? false,
      is_fixed_price: is_fixed_price ?? true,
      status: status ?? 'active',
    }).eq('id', id)

    if (error) {
      console.error('[PATCH /api/admin/products/[id]]', error)
      return NextResponse.json({ error: '품목 수정 실패' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('[PATCH /api/admin/products/[id]] unexpected', e)
    return NextResponse.json({ error: '요청 처리 중 오류가 발생했습니다' }, { status: 500 })
  }
}
