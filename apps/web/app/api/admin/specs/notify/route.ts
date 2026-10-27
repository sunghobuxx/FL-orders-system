export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'

import { getAdminSession } from '@/lib/admin-member-user'
import { notifySpec } from '@/lib/specs/notify'

/**
 * 당일명세서를 문자로 보낸다.
 *
 * 정산서 확정(app/api/admin/settlement/confirm)과 같은 공유 링크 방식 —
 * 매번 새로 만들지 않고, 아직 안 지난 링크가 있으면 그걸 재사용한다.
 */
const SHARE_DAYS = 7

function makeToken() {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return [...bytes].map(b => b.toString(16).padStart(2, '0')).join('')
}

export async function POST(req: NextRequest) {
  try {
    const { specId } = await req.json() as { specId?: string }
    if (!specId) return NextResponse.json({ error: '명세서를 선택하세요' }, { status: 400 })

    const session = await getAdminSession()
    if (!session) return NextResponse.json({ error: '권한이 없습니다' }, { status: 403 })
    const { db } = session

    const { data: spec } = await db
      .from('daily_specs').select('id').eq('id', specId).maybeSingle()
    if (!spec) return NextResponse.json({ error: '명세서를 찾을 수 없습니다' }, { status: 404 })

    const origin = new URL(req.url).origin
    const now = new Date()
    const { data: live } = await db
      .from('spec_share_links')
      .select('token, expires_at')
      .eq('daily_spec_id', specId)
      .gt('expires_at', now.toISOString())
      .limit(1)
    let token: string = live?.[0]?.token ?? ''
    if (!token) {
      token = makeToken()
      const expires = new Date(now.getTime() + SHARE_DAYS * 86400_000).toISOString()
      const { error } = await db.from('spec_share_links')
        .insert({ token, daily_spec_id: specId, expires_at: expires })
      if (error) return NextResponse.json({ error: `링크 발급 실패: ${error.message}` }, { status: 500 })
    }

    const result = await notifySpec(db, specId, `${origin}/d/${token}`)
    if (result.success) {
      await db.from('daily_specs').update({ notified_at: now.toISOString() }).eq('id', specId)
    }

    if (!result.success) {
      return NextResponse.json({ error: result.error ?? '발송 실패' }, { status: 500 })
    }
    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('[POST /api/admin/specs/notify]', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '발송 처리 중 오류가 발생했습니다' },
      { status: 500 },
    )
  }
}
