export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'

import { getSessionUser } from '@/lib/supabase/server'

export async function PUT(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id: orgId } = await context.params
    const body = await req.json() as {
      name?: string
      contact_name?: string
      phone?: string
      biz_no?: string
      settlement_cycle?: string
      waiting_enabled?: boolean
    }

    const { user, supabase: db } = await getSessionUser()
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    if (body.name) {
      const { error } = await db.from('organizations').update({ name: body.name }).eq('id', orgId)
      if (error) throw error
    }

    if (body.contact_name !== undefined || body.phone !== undefined) {
      const contactUpdate: Record<string, string> = {}
      if (body.contact_name !== undefined) contactUpdate.name = body.contact_name
      if (body.phone !== undefined) contactUpdate.phone = body.phone

      const { data: existing } = await db
        .from('contacts')
        .select('id')
        .eq('organization_id', orgId)
        .eq('is_primary', true)
        .maybeSingle()

      if (existing) {
        await db.from('contacts').update(contactUpdate).eq('id', existing.id)
      } else {
        await db.from('contacts').insert({ ...contactUpdate, organization_id: orgId, is_primary: true })
      }
    }

    const restUpdate: Record<string, unknown> = {}
    if (body.biz_no !== undefined) restUpdate.biz_no = body.biz_no
    if (body.settlement_cycle !== undefined) restUpdate.settlement_cycle = body.settlement_cycle
    if (body.waiting_enabled !== undefined) restUpdate.waiting_enabled = body.waiting_enabled

    if (Object.keys(restUpdate).length > 0) {
      const { data: rest } = await db
        .from('restaurants')
        .select('id')
        .eq('organization_id', orgId)
        .maybeSingle()
      if (rest) {
        await db.from('restaurants').update(restUpdate).eq('id', rest.id)
      }
    }

    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('[PUT /api/admin/members/[id]]', e)
    return NextResponse.json({ error: '수정 실패' }, { status: 500 })
  }
}
