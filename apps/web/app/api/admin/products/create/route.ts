export const runtime = 'edge'

import { NextResponse } from 'next/server'
import { apiError, validationError } from '@/lib/api-error'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSessionUser } from '@/lib/supabase/server'

/**
 * 분류별 SKU 접두사. 지금까지 쌓인 것을 따른다.
 * seasoning 은 etc- 로 붙은 게 22개로 가장 많아 etc 로 맞춘다(veg 6, sea 2).
 */
const SKU_PREFIX: Record<string, string> = {
  vegetable: 'veg', fruit: 'frt', meat: 'met', seafood: 'sea',
  grain: 'grn', dairy: 'dry', seasoning: 'etc', etc: 'etc',
}

/**
 * 비어 있는 SKU 를 채운다. 화면에 "미입력 시 자동" 이라고 적혀 있는데 서버가
 * 그냥 null 을 넣고 있었다. products.sku 는 NOT NULL 이라 등록이 실패했고,
 * 오류 메시지는 "품목 등록에 실패했습니다" 뿐이라 이유를 알 수 없었다.
 *
 * 같은 접두사 중 가장 큰 번호 다음을 쓴다. sku 에 UNIQUE 가 걸려 있으므로
 * 동시에 둘이 등록해 번호가 겹치면 다음 번호로 다시 시도한다.
 */
async function nextSku(db: any, category: string, attempt: number): Promise<string> {
  const prefix = SKU_PREFIX[category] ?? 'etc'
  const { data } = await db
    .from('products').select('sku').ilike('sku', `${prefix}-%`)
  const max = (data ?? []).reduce((m: number, r: { sku: string }) => {
    const n = Number(/(\d+)$/.exec(r.sku ?? '')?.[1] ?? 0)
    return n > m ? n : m
  }, 0)
  return `${prefix}-${String(max + 1 + attempt).padStart(3, '0')}`
}

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

    const given = typeof sku === 'string' ? sku.trim() : ''

    // 번호가 겹치면 다음 번호로 다시 시도한다. 직접 적어 넣은 SKU 는 겹쳐도
    // 다시 시도하지 않는다 — 그건 사용자가 고쳐야 할 입력이다.
    for (let attempt = 0; attempt < 5; attempt++) {
      const { data, error } = await db.from('products').insert({
        sku: given || await nextSku(db, category, attempt),
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

      if (!error) return NextResponse.json({ success: true, id: data.id })

      // 23505 = unique 위반. 자동 채번일 때만 다음 번호로 넘어간다.
      if (error.code === '23505' && !given) continue

      console.error('[POST /api/admin/products/create]', error)
      if (error.code === '23505') return validationError(`이미 쓰고 있는 SKU 입니다: ${given}`)
      return apiError(`품목 등록에 실패했습니다: ${error.message}`)
    }

    return apiError('SKU 를 정하지 못했습니다. 잠시 후 다시 시도해 주세요.')
  } catch {
    return apiError('요청 처리 중 오류가 발생했습니다')
  }
}
