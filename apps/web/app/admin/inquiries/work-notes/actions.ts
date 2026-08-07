'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { createAdminClient } from '@/lib/supabase/admin'
import { getSessionUser } from '@/lib/supabase/server'
import { requireAuthorizedAdminDb } from '@/lib/admin-member-user'
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

export async function updateWorkNote(formData: FormData) {
  const id = String(formData.get('id') ?? '').trim()
  const title = String(formData.get('title') ?? '').trim()
  const content = String(formData.get('content') ?? '').trim()

  function failEdit(message: string): never {
    redirect(`/admin/inquiries/work-notes/edit?id=${id}&error=` + encodeURIComponent(message))
  }

  if (!id) fail('전달사항을 찾을 수 없습니다')
  if (!title || !content) failEdit('제목과 내용을 입력해주세요')

  // 목록 화면은 service role 로 읽기만 하고 권한을 보지 않는다. 고치는 쪽은 반드시 막는다.
  const db = await requireAuthorizedAdminDb()

  // category 를 함께 걸어 둔다. 이 액션으로 회원 문의(work_note 가 아닌 inquiries)까지
  // 고쳐지면 안 된다.
  const { data, error } = await db
    .from('inquiries')
    .update({ title, content })
    .eq('id', id)
    .eq('category', DRIVER_NOTE_CATEGORY)
    .select('id')

  if (error) failEdit(error.message)
  if (!data?.length) failEdit('전달사항을 찾을 수 없습니다')

  revalidatePath('/admin/inquiries/work-notes')
  redirect('/admin/inquiries/work-notes')
}
