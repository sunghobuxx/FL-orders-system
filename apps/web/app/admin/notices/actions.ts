'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { createAdminClient } from '@/lib/supabase/admin'

async function getDb() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
          } catch {}
        },
      },
    },
  )
}

export async function createNotice(formData: FormData) {
  const title = formData.get('title') as string
  const body = formData.get('body') as string

  if (!title?.trim() || !body?.trim()) {
    redirect(`/admin/notices/new?error=${encodeURIComponent('제목과 내용을 입력해주세요')}`)
  }

  // 파일은 클라이언트(NoticeFileInput)에서 직접 Storage에 업로드 후 URL만 전달
  const fileUrl = formData.get('file_url') as string | null
  const filePath: string | null = fileUrl && fileUrl.trim() ? fileUrl.trim() : null

  let insertError: string | null = null
  try {
    const db = await getDb()
    const { error } = await db.from('notices').insert({
      title,
      body,
      audience_type: 'all',
      ...(filePath ? { file_path: filePath } : {}),
    })
    if (error) insertError = error.message
  } catch (err) {
    insertError = err instanceof Error ? err.message : String(err)
  }

  if (insertError) {
    redirect(`/admin/notices/new?error=${encodeURIComponent(insertError)}`)
  }

  redirect('/admin/notices')
}

export async function deleteNotice(id: string): Promise<{ error?: string }> {
  const adminDb = createAdminClient()
  const { error } = await adminDb.from('notices').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/admin/notices')
  return {}
}

export async function updateNotice(id: string, title: string, body: string): Promise<{ error?: string }> {
  const adminDb = createAdminClient()
  const { error } = await adminDb.from('notices').update({ title, body }).eq('id', id)
  if (error) return { error: error.message }
  revalidatePath(`/admin/notices/${id}`)
  return {}
}
