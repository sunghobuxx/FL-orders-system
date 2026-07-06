'use server'

import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'

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

  const db = await getDb()
  const { error } = await db.from('notices').insert({ title, body })

  if (error) {
    redirect('/admin/notices/new?error=' + encodeURIComponent(error.message))
  }

  redirect('/admin/notices')
}
