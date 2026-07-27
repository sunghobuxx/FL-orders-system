export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSessionUser } from '@/lib/supabase/server'

export async function PUT(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id: supplierId } = await context.params
    const { name, dispatch_channel, status, phone } = await req.json()

    const { user } = await getSessionUser()
    if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })
    // 데이터 작업은 service role 로 한다. 세션(RLS)으로 쓰면 막혀도 에러가 안 나
    // 조용히 실패하거나 조회가 null 이 되어 엉뚱한 404 가 난다.
    const db = createAdminClient()

    // 공급처 기본 정보 업데이트
    const { error: supErr } = await db
      .from('suppliers')
      .update({ dispatch_channel, status })
      .eq('id', supplierId)

    if (supErr) {
      console.error('[PUT /api/admin/suppliers/[id]]', supErr)
      return NextResponse.json({ error: '공급처 정보 업데이트 실패' }, { status: 500 })
    }

    // 조직명 업데이트
    const { data: supplier } = await db
      .from('suppliers')
      .select('organization_id')
      .eq('id', supplierId)
      .single()

    if (supplier) {
      if (name) {
        await db.from('organizations').update({ name }).eq('id', supplier.organization_id)
      }

      if (phone !== undefined) {
        const { data: existing } = await db
          .from('contacts')
          .select('id')
          .eq('organization_id', supplier.organization_id)
          .eq('is_primary', true)
          .maybeSingle()

        if (existing) {
          await db.from('contacts').update({ phone, channel_type: 'kakao' }).eq('id', existing.id)
        } else {
          await db.from('contacts').insert({
            organization_id: supplier.organization_id,
            name,
            phone,
            channel_type: 'kakao',
            is_primary: true,
          })
        }
      }
    }

    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('[PUT /api/admin/suppliers/[id]] unexpected', e)
    return NextResponse.json({ error: '요청 처리 중 오류가 발생했습니다' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id: supplierId } = await context.params
    const { user } = await getSessionUser()
    if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })
    // 데이터 작업은 service role 로 한다. 세션(RLS)으로 쓰면 막혀도 에러가 안 나
    // 조용히 실패하거나 조회가 null 이 되어 엉뚱한 404 가 난다.
    const db = createAdminClient()
    const { error } = await db.from('suppliers').update({ status: 'inactive' }).eq('id', supplierId)
    if (error) return NextResponse.json({ error: '삭제 실패' }, { status: 500 })
    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('[DELETE /api/admin/suppliers/[id]] unexpected', e)
    return NextResponse.json({ error: '요청 처리 중 오류가 발생했습니다' }, { status: 500 })
  }
}
