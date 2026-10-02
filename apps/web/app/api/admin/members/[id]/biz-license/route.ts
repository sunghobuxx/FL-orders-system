export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAdminSession } from '@/lib/admin-member-user'

/**
 * 사업자등록증 열람 링크. biz-licenses 버킷은 비공개라 퍼블릭 URL이 없다 —
 * 어드민이 "보기"를 누를 때마다 서명된 URL을 새로 발급한다.
 */
export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id: orgId } = await context.params

    const session = await getAdminSession()
    if (!session) return NextResponse.json({ error: '권한이 없습니다' }, { status: 403 })

    const db = createAdminClient()
    const { data: org } = await db
      .from('organizations')
      .select('biz_license_path')
      .eq('id', orgId)
      .maybeSingle()

    if (!org?.biz_license_path) {
      return NextResponse.json({ error: '등록된 파일이 없습니다' }, { status: 404 })
    }

    const { data, error } = await db.storage
      .from('biz-licenses')
      .createSignedUrl(org.biz_license_path, 60)

    if (error || !data) {
      console.error('[GET /api/admin/members/[id]/biz-license]', error)
      return NextResponse.json({ error: '열람 링크 생성 실패' }, { status: 500 })
    }

    return NextResponse.json({ url: data.signedUrl })
  } catch (e) {
    console.error('[GET /api/admin/members/[id]/biz-license] unexpected', e)
    return NextResponse.json({ error: '처리 중 오류가 발생했습니다' }, { status: 500 })
  }
}
