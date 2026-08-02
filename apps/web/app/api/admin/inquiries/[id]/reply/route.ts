export const runtime = 'edge'

import { NextResponse } from 'next/server'

import { createAdminClient } from '@/lib/supabase/admin'
import { getSessionUser } from '@/lib/supabase/server'

/**
 * 문의·불편 답변 저장.
 *
 * 예전에는 Server Action(replyToInquiry)으로 저장했는데 저장 버튼을 누르면 오류가 났다.
 * DB 업데이트 자체는 문제가 없었다(같은 UPDATE 를 직접 실행하면 성공).
 * 이 저장소는 공지에서도 Server Action 을 포기하고 클라이언트 방식으로 옮긴 적이 있다.
 * 어드민의 다른 저장은 전부 이 API 라우트 방식이라 같은 방식으로 맞춘다.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params

    // 답변을 저장하는 주소다. 로그인 없이 부를 수 있으면 안 된다.
    const { user } = await getSessionUser()
    if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })

    const { reply } = await req.json() as { reply?: string }
    const text = (reply ?? '').trim()
    if (!text) return NextResponse.json({ error: '답변 내용을 입력하세요' }, { status: 400 })

    // 문의는 RLS 가 "자기가 쓴 글만" 이라 세션 클라이언트로는 못 고친다.
    const db = createAdminClient()
    const { error } = await db
      .from('inquiries')
      .update({
        reply: text,
        replied_at: new Date().toISOString(),
        replied_by: user.id,
        status: 'resolved',
      })
      .eq('id', id)

    if (error) {
      console.error('[POST /api/admin/inquiries/[id]/reply]', error)
      return NextResponse.json({ error: `저장 실패: ${error.message}` }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('[POST /api/admin/inquiries/[id]/reply]', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '저장 중 오류가 발생했습니다' },
      { status: 500 },
    )
  }
}
