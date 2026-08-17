export const runtime = 'edge'

import { NextResponse } from 'next/server'

import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(req: Request) {
  const auth = req.headers.get('Authorization')
  const accessToken = auth?.startsWith('Bearer ') ? auth.slice(7) : ''
  if (!accessToken) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })

  const db = createAdminClient()
  const { data: userData, error: userError } = await db.auth.getUser(accessToken)
  if (userError || !userData.user) {
    return NextResponse.json({ error: '로그인 정보가 유효하지 않습니다.' }, { status: 401 })
  }

  const { token } = await req.json().catch(() => ({})) as { token?: string }
  if (!token?.startsWith('ExponentPushToken[') && !token?.startsWith('ExpoPushToken[')) {
    return NextResponse.json({ error: '올바르지 않은 푸시 토큰입니다.' }, { status: 400 })
  }

  const { error } = await db.from('push_tokens').upsert(
    { user_id: userData.user.id, token, updated_at: new Date().toISOString() },
    { onConflict: 'user_id' },
  )
  if (error) return NextResponse.json({ error: '푸시 토큰 저장에 실패했습니다.' }, { status: 500 })

  return NextResponse.json({ success: true })
}
