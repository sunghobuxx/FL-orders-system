export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  try {
    const { name, dispatch_channel, phone } = await req.json()
    if (!name?.trim()) return NextResponse.json({ error: '공급처명을 입력하세요' }, { status: 400 })

    const { supabase: db } = await getSessionUser()

    const { data: orgId, error: orgErr } = await db.rpc('admin_create_organization', {
      p_name: name.trim(),
      p_org_type: 'supplier',
      p_status: 'active',
    })
    if (orgErr || !orgId) {
      console.error('[POST /api/admin/suppliers]', orgErr)
      return NextResponse.json({ error: '공급처 등록 실패' }, { status: 500 })
    }

    const { data: sup } = await db.from('suppliers')
      .insert({ organization_id: orgId as string, dispatch_channel: dispatch_channel || 'kakao', status: 'active' })
      .select('id').single()

    if (phone && sup) {
      await db.from('contacts').insert({
        organization_id: orgId as string,
        name: name.trim(),
        phone,
        channel_type: 'kakao',
        is_primary: true,
      })
    }

    return NextResponse.json({ success: true, supplierId: sup?.id })
  } catch (e) {
    console.error('[POST /api/admin/suppliers] unexpected', e)
    return NextResponse.json({ error: '요청 처리 중 오류가 발생했습니다' }, { status: 500 })
  }
}
