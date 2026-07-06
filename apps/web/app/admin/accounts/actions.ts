'use server'

import { redirect } from 'next/navigation'

import { createAdminClient } from '@/lib/supabase/admin'

export async function createAdminAccount(formData: FormData) {
  const email = formData.get('email') as string
  const password = formData.get('password') as string
  const name = formData.get('name') as string
  const orgType = (formData.get('org_type') as string) || 'platform'

  if (!email || !password || !name) {
    redirect('/admin/accounts/new?error=' + encodeURIComponent('이메일, 비밀번호, 이름을 모두 입력해주세요.'))
  }

  const db = createAdminClient()

  const { data: authData, error: authError } = await db.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: name },
  })

  if (authError || !authData.user) {
    redirect('/admin/accounts/new?error=' + encodeURIComponent(authError?.message ?? '계정 생성 실패'))
  }

  const { data: org, error: orgError } = await db
    .from('organizations')
    .insert({ name, organization_type: orgType })
    .select('id')
    .single()

  if (orgError || !org) {
    await db.auth.admin.deleteUser(authData.user.id)
    redirect('/admin/accounts/new?error=' + encodeURIComponent('조직 생성 실패'))
  }

  await db.from('memberships').insert({
    user_id: authData.user.id,
    organization_id: org.id,
    role: 'admin',
  })

  redirect('/admin/accounts')
}
