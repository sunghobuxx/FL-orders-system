export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'

import { createAdminClient } from '@/lib/supabase/admin'
import { getSessionUser } from '@/lib/supabase/server'

export async function DELETE(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params
    const { user } = await getSessionUser()
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const adminDb = createAdminClient()
    const { error } = await adminDb.from('notices').delete().eq('id', id)
    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('[DELETE /api/admin/notices/[id]]', e)
    return NextResponse.json({ error: '삭제 실패' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params
    const { user } = await getSessionUser()
    if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

    const body = await req.json() as { title?: string; body?: string }
    const update: Record<string, string> = {}
    if (body.title) update.title = body.title
    if (body.body) update.body = body.body

    const adminDb = createAdminClient()
    const { error } = await adminDb.from('notices').update(update).eq('id', id)
    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('[PUT /api/admin/notices/[id]]', e)
    return NextResponse.json({ error: '수정 실패' }, { status: 500 })
  }
}
