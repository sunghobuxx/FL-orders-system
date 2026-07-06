'use server'

import { redirect } from 'next/navigation'

import { createAdminClient } from '@/lib/supabase/admin'

export async function updateProfile(orgId: string, restaurantId: string | null, formData: FormData) {
  const db = createAdminClient()

  const name = formData.get('name') as string
  const contactName = formData.get('contact_name') as string
  const phone = formData.get('phone') as string
  const bizNo = formData.get('biz_no') as string

  if (name) {
    await db.from('organizations').update({ name }).eq('id', orgId)
  }

  const { data: existing } = await db
    .from('contacts').select('id').eq('organization_id', orgId).eq('is_primary', true).maybeSingle()

  if (existing) {
    await db.from('contacts').update({ name: contactName, phone }).eq('id', existing.id)
  } else {
    await db.from('contacts').insert({
      organization_id: orgId, name: contactName, phone, channel_type: 'kakao', is_primary: true,
    })
  }

  if (restaurantId && bizNo) {
    await db.from('restaurants').update({ biz_no: bizNo }).eq('id', restaurantId)
  }

  redirect('/member/profile')
}
