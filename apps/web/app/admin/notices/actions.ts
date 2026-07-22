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

export async function deleteNotice(id: string): Promise<{ error?: string }> {
  const adminDb = await getAuthorizedAdminDb()
  if (!adminDb) return { error: '권한이 없습니다' }
  const { error } = await adminDb.from('notices').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/admin/notices')
  return {}
}

export async function updateNotice(id: string, title: string, body: string): Promise<{ error?: string }> {
  const adminDb = await getAuthorizedAdminDb()
  if (!adminDb) return { error: '권한이 없습니다' }
  const { error } = await adminDb.from('notices').update({ title: title.trim(), body: body.trim() }).eq('id', id)
  if (error) return { error: error.message }
  revalidatePath(`/admin/notices/${id}`)
  return {}
}
