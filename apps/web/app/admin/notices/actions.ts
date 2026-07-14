'use server'

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
    redirect('/admin/notices/new?error=' + encodeURIComponent('제목과 내용을 입력해주세요'))
  }

  let filePath: string | null = null
  const file = formData.get('file') as File | null
  if (file && file.size > 0) {
    const adminDb = createAdminClient()
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const fileName = `${Date.now()}_${safeName}`
    const { data: uploadData, error: uploadError } = await adminDb.storage
      .from('notices')
      .upload(fileName, file, { cacheControl: '3600' })
    if (uploadError) {
      redirect('/admin/notices/new?error=' + encodeURIComponent('파일 업로드 실패: ' + uploadError.message))
    }
    const { data: { publicUrl } } = adminDb.storage.from('notices').getPublicUrl(uploadData.path)
    filePath = publicUrl
  }

  const db = await getDb()
  const { error } = await db.from('notices').insert({
    title,
    body,
    audience_type: 'all',
    ...(filePath ? { file_path: filePath } : {}),
  })

  if (error) {
    redirect('/admin/notices/new?error=' + encodeURIComponent(error.message))
  }

  redirect('/admin/notices')
}
