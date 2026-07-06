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

export async function replyToInquiry(id: string, formData: FormData) {
  const reply = formData.get('reply') as string

  const db = await getDb()
  await db
    .from('inquiries')
    .update({ reply, replied_at: new Date().toISOString(), status: 'answered' })
    .eq('id', id)

  redirect('/admin/inquiries')
}
