'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSessionUser } from '@/lib/supabase/server'
import { hasNoticeAdminAccess } from '@/lib/admin-notices'

async function getAuthorizedAdminDb() {
  const { user } = await getSessionUser()
  if (!user) return null

  const adminDb = createAdminClient()
  const { data: memberships } = await adminDb
    .from('memberships')
    .select('role, organizations(organization_type)')
    .eq('user_id', user.id)

  if (!hasNoticeAdminAccess(memberships)) return null
  return adminDb
}

export async function createNotice(formData: FormData) {
  const title = String(formData.get('title') ?? '').trim()
  const body = String(formData.get('body') ?? '').trim()

  if (!title?.trim() || !body?.trim()) {
    redirect(`/admin/notices/new?error=${encodeURIComponent('제목과 내용을 입력해주세요')}`)
  }

  // 파일은 클라이언트(NoticeFileInput)에서 직접 Storage에 업로드 후 URL만 전달
  const fileUrl = formData.get('file_url') as string | null
  const filePath: string | null = fileUrl && fileUrl.trim() ? fileUrl.trim() : null

  const adminDb = await getAuthorizedAdminDb()
  if (!adminDb) redirect('/login')

  const { data: notice, error } = await adminDb
    .from('notices')
    .insert({
      title,
      body,
      audience_type: 'all',
      ...(filePath ? { file_path: filePath } : {}),
    })
    .select('id')
    .single()

  if (error || !notice) {
    redirect(`/admin/notices/new?error=${encodeURIComponent(error?.message ?? '공지 저장에 실패했습니다')}`)
  }

  revalidatePath('/admin/notices')
  redirect(`/admin/notices/${notice.id}`)
}

// 공지 수정·삭제는 여기 두지 않는다. PUT/DELETE /api/admin/notices/[id] 를 쓴다.
//
// 서버 액션은 그 화면의 주소로 POST 하는데, 공지 상세·수정은 /admin/notices/[id] 라
// 대괄호 경로다. Cloudflare Pages 에서는 대괄호 경로로 가는 서버 액션 POST 가 404 가
// 된다. 화면을 여는 GET 은 멀쩡해서 저장을 눌러야 터지고, 브라우저에는
// "오류가 발생했습니다" 만 뜬다 (2026-08-08 실측: 수정이 404, DB 반영 안 됨).
//
// 대괄호 **API 라우트**는 정상이다. 같은 파일의 SMS 발송이 그 방식으로 잘 돌고 있었다.
// 작성(createNotice)은 /admin/notices/new 라 정적 경로여서 서버 액션 그대로 둔다.
