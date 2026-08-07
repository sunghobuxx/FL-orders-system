export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'

import { getAuthorizedAdminDb } from '@/lib/admin-member-user'

/**
 * 공지 수정·삭제.
 *
 * 화면(NoticeButtons)은 서버 액션이 아니라 이 라우트를 부른다.
 * 공지 상세·수정 화면이 /admin/notices/[id] 라 대괄호 경로인데, Cloudflare Pages 에서는
 * 대괄호 경로로 가는 **서버 액션 POST 가 404** 가 된다. 화면을 여는 GET 은 멀쩡해서
 * 저장을 눌러야 터졌다 (2026-08-08 실측: 수정이 404, DB 반영 안 됨).
 * 대괄호 **API 라우트**는 정상이라 이쪽으로 돌린다.
 *
 * 예전에는 로그인 여부만 봤다. 서버 액션 쪽은 공지 관리 권한을 봤으므로,
 * 이리로 옮기면서 권한이 헐거워지지 않도록 같은 검사를 붙인다.
 */

export async function DELETE(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params
    const adminDb = await getAuthorizedAdminDb()
    if (!adminDb) return NextResponse.json({ error: '권한이 없습니다' }, { status: 403 })

    const { error } = await adminDb.from('notices').delete().eq('id', id)
    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('[DELETE /api/admin/notices/[id]]', e)
    return NextResponse.json(
      { error: e instanceof Error ? `삭제 실패: ${e.message}` : '삭제 실패' },
      { status: 500 },
    )
  }
}

export async function PUT(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params
    const adminDb = await getAuthorizedAdminDb()
    if (!adminDb) return NextResponse.json({ error: '권한이 없습니다' }, { status: 403 })

    const body = await req.json() as { title?: string; body?: string }
    const title = body.title?.trim()
    const content = body.body?.trim()
    if (!title || !content) {
      return NextResponse.json({ error: '제목과 내용을 입력해주세요' }, { status: 400 })
    }

    const { error } = await adminDb
      .from('notices')
      .update({ title, body: content })
      .eq('id', id)
    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('[PUT /api/admin/notices/[id]]', e)
    return NextResponse.json(
      { error: e instanceof Error ? `수정 실패: ${e.message}` : '수정 실패' },
      { status: 500 },
    )
  }
}
