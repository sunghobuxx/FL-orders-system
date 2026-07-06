export const runtime = 'edge'

import { type NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/supabase/server'

export async function DELETE(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params
    const { supabase: db } = await getSessionUser()
    const { error } = await db.from('products').delete().eq('id', id)
    if (error) return NextResponse.json({ error: '품목 삭제 실패' }, { status: 500 })
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

    const { supabase: db } = await getSessionUser()

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
