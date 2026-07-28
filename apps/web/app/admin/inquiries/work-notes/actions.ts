'use server'

import { redirect } from 'next/navigation'

import { createAdminClient } from '@/lib/supabase/admin'
import { getSessionUser } from '@/lib/supabase/server'
import { DRIVER_NOTE_CATEGORY } from '@/lib/driver-api'

function fail(message: string): never {
  redirect('/admin/inquiries/work-notes/new?error=' + encodeURIComponent(message))
}

export async function createWorkNote(formData: FormData) {
  const title = String(formData.get('title') ?? '').trim()
  const content = String(formData.get('content') ?? '').trim()

  if (!title || !content) {
    fail('제목과 내용을 입력해주세요')
  }

  // inquiries.organization_id 와 user_id 는 둘 다 NOT NULL 이다.
  // 전달 사항은 어드민이 쓰는 글이라 운영 조직과 작성자를 붙여 준다.
  const { user } = await getSessionUser()
  if (!user) fail('로그인이 필요합니다')

  const db = createAdminClient()
  const { data: operator } = await db
    .from('organizations')
    .select('id')
    .eq('organization_type', 'operator')
    .eq('status', 'active')
    .maybeSingle()

  if (!operator) fail('운영 조직을 찾을 수 없습니다')

  const { error } = await db.from('inquiries').insert({
    organization_id: operator.id,
    user_id: user.id,
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
