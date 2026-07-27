export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'

import { createAdminClient } from '@/lib/supabase/admin'
import { getSessionUser } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  try {
    const { entityId, productId, isSupplier, link } = await req.json() as {
      entityId: string; productId: string; isSupplier: boolean; link: boolean
    }
    if (!entityId || !productId) {
      return NextResponse.json({ error: 'entityId, productId 누락' }, { status: 400 })
    }

    const { user } = await getSessionUser()
    if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })
    // 데이터 작업은 service role 로. 세션(RLS)으로 쓰면 막혀도 에러가 안 나거나
    // 정책이 없으면 통째로 실패한다 (restaurant_products 는 service_role 쓰기만 허용).
    const db = createAdminClient()
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    if (isSupplier) {
      if (link) {
        const { error } = await db.from('supplier_products').upsert(
          { supplier_id: entityId, product_id: productId, purchase_unit: '', supplier_name: '' },
          { onConflict: 'supplier_id,product_id' },
        )
        if (error) throw error
      } else {
        const { error } = await db
          .from('supplier_products')
          .delete()
          .eq('supplier_id', entityId)
          .eq('product_id', productId)
        if (error) throw error
      }
    } else {
      if (link) {
        const { error } = await db.from('restaurant_products').upsert(
          { restaurant_id: entityId, product_id: productId },
          { onConflict: 'restaurant_id,product_id' },
        )
        if (error) throw error
      } else {
        const { error } = await db
          .from('restaurant_products')
          .delete()
          .eq('restaurant_id', entityId)
          .eq('product_id', productId)
        if (error) throw error
      }
    }

    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('[POST /api/admin/products/toggle]', e)
    return NextResponse.json({ error: '변경 실패' }, { status: 500 })
  }
}
