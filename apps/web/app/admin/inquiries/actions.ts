'use server'

import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'

export async function replyToInquiry(id: string, formData: FormData) {
  const reply = formData.get('reply') as string

  const db = createAdminClient()
  const { error } = await db
    .from('inquiries')
    .update({ reply, replied_at: new Date().toISOString(), status: 'resolved' })
    .eq('id', id)

  if (error) {
    throw new Error(error.message)
  }

  redirect(`/admin/inquiries/${id}`)
}
