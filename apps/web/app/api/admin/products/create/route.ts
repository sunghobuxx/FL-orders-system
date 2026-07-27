export const runtime = 'edge'

import { NextResponse } from 'next/server'
import { apiError, validationError } from '@/lib/api-error'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSessionUser } from '@/lib/supabase/server'

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { sku, standard_name, category, default_unit, allowed_units, taxable_flag, is_kg_based, is_fixed_price } = body

    if (!standard_name || typeof standard_name !== 'string' || standard_name.trim().length === 0)
      return validationError('품목명을 입력하세요')
    if (!category) return validationError('카테고리를 선택하세요')
    if (!default_unit) return validationError('기본 단위를 선택하세요')
    if (standard_name.length > 100) return validationError('품목명은 100자 이하로 입력하세요')

    const { user } = await getSessionUser()
    if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })
    // 데이터 작업은 service role 로 한다. 세션(RLS)으로 쓰면 막혀도 에러가 안 나
    // 조용히 실패하거나 조회가 null 이 되어 엉뚱한 404 가 난다.
    const db = createAdminClient()

    const { data, error } = await db.from('products').insert({
      sku: sku?.trim() || null,
      standard_name: standard_name.trim(),
      category,
      default_unit,
      allowed_units: allowed_units ?? [],
      taxable_flag: taxable_flag ?? true,
      is_kg_based: is_kg_based ?? false,
      is_fixed_price: is_fixed_price ?? true,
      image_path: null,
      status: 'active',
    }).select('id').single()

    if (error) return apiError('품목 등록에 실패했습니다')
    return NextResponse.json({ success: true, id: data.id })
  } catch {
    return apiError('요청 처리 중 오류가 발생했습니다')
  }
}
