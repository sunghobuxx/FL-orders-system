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

  // auth.users 에는 트리거가 없어서 public.users 가 자동으로 안 생긴다. 이걸 빼먹으면
  // memberships.user_id FK 가 걸려 바로 다음 insert 가 터진다 — 이 폼으로 만든 계정은
  // 전부 실패하고 있었다(2026-10-20 발견, temp@fruitlife.kr 만들다가 확인).
  const { error: userError } = await db.from('users').insert({
    id: authData.user.id, email, name, status: 'active',
  })
  if (userError) {
    await db.from('organizations').delete().eq('id', org.id)
    await db.auth.admin.deleteUser(authData.user.id)
    redirect('/admin/accounts/new?error=' + encodeURIComponent(`사용자 등록 실패: ${userError.message}`))
  }

  // insert 결과를 확인한다. supabase 는 실패해도 예외를 던지지 않아
  // 확인하지 않으면 계정이 조직에 연결되지 않은 채로 넘어간다.
  const { error: memberError } = await db.from('memberships').insert({
    user_id: authData.user.id,
    organization_id: org.id,
    role: 'admin',
  })

  if (memberError) {
    await db.from('organizations').delete().eq('id', org.id)
    await db.from('users').delete().eq('id', authData.user.id)
    await db.auth.admin.deleteUser(authData.user.id)
    redirect('/admin/accounts/new?error=' + encodeURIComponent(`계정 연결 실패: ${memberError.message}`))
  }

  redirect('/admin/accounts')
}
