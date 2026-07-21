export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'

import { createAdminClient } from '@/lib/supabase/admin'
import { getSessionUser } from '@/lib/supabase/server'

export async function PUT(req: NextRequest) {
  const { user, supabase } = await getSessionUser()
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })

  const body = await req.json() as {
    orgId?: string
    restaurantId?: string | null
    name?: string
    contact_name?: string
    phone?: string
    biz_no?: string
  }

  const { data: membership } = await supabase
    .from('memberships')
    .select('organization_id')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!membership?.organization_id) {
    return NextResponse.json({ error: '업체 정보를 확인할 수 없습니다.' }, { status: 403 })
  }
  if (body.orgId && body.orgId !== membership.organization_id) {
    return NextResponse.json({ error: '해당 업체를 수정할 권한이 없습니다.' }, { status: 403 })
  }

  const orgId = membership.organization_id
  const name = body.name?.trim()
  const contactName = body.contact_name?.trim() ?? ''
  const phone = body.phone?.trim() ?? ''
  const bizNo = body.biz_no?.trim() ?? ''
  if (!name) return NextResponse.json({ error: '업체명을 입력해주세요.' }, { status: 400 })

  const db = createAdminClient()
  const { error: orgError } = await db.from('organizations').update({ name }).eq('id', orgId)
  if (orgError) return NextResponse.json({ error: `업체명 수정 실패: ${orgError.message}` }, { status: 500 })

  const { data: contact } = await db
    .from('contacts')
    .select('id')
    .eq('organization_id', orgId)
    .eq('is_primary', true)
    .maybeSingle()

  const contactResult = contact
    ? await db.from('contacts').update({ name: contactName, phone }).eq('id', contact.id)
    : await db.from('contacts').insert({
        organization_id: orgId,
        name: contactName,
        phone,
        channel_type: 'kakao',
        is_primary: true,
      })
  if (contactResult.error) {
    return NextResponse.json({ error: `담당자 정보 수정 실패: ${contactResult.error.message}` }, { status: 500 })
  }

  if (body.restaurantId) {
    const { data: restaurant } = await db
      .from('restaurants')
      .select('id')
      .eq('id', body.restaurantId)
      .eq('organization_id', orgId)
      .maybeSingle()
    if (!restaurant) {
      return NextResponse.json({ error: '식당 정보를 확인할 수 없습니다.' }, { status: 403 })
    }
    const { error: restaurantError } = await db
      .from('restaurants')
      .update({ biz_no: bizNo || null })
      .eq('id', restaurant.id)
    if (restaurantError) {
      return NextResponse.json({ error: `사업자 정보 수정 실패: ${restaurantError.message}` }, { status: 500 })
    }
  }

  return NextResponse.json({ ok: true })
}
