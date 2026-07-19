'use server'

import { redirect } from 'next/navigation'

import { createAdminClient } from '@/lib/supabase/admin'
import { DRIVER_NOTE_CATEGORY } from '@/lib/driver-api'

export async function createWorkNote(formData: FormData) {
  const title = String(formData.get('title') ?? '').trim()
  const content = String(formData.get('content') ?? '').trim()

  if (!title || !content) {
    redirect('/admin/inquiries/work-notes/new?error=' + encodeURIComponent('제목과 내용을 입력해주세요'))
  }

  const db = createAdminClient()
  const { error } = await db.from('inquiries').insert({
    category: DRIVER_NOTE_CATEGORY,
    status: 'open',
    title,
    content,
  })

  if (error) {
    redirect('/admin/inquiries/work-notes/new?error=' + encodeURIComponent(error.message))
  }

  redirect('/admin/inquiries/work-notes')
}
