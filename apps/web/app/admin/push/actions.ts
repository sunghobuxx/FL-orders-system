'use server'

import { createAdminClient } from '@/lib/supabase/admin'

export async function savePushSchedule(formData: FormData): Promise<{ error?: string }> {
  const slot = Number(formData.get('slot'))
  const send_time = formData.get('send_time') as string
  const title = formData.get('title') as string
  const body = formData.get('body') as string
  const is_active = formData.get('is_active') === 'true'
  const org_ids = formData.getAll('org_ids') as string[]

  if (!send_time || !title || !body) {
    return { error: '발송 시간, 제목, 내용을 입력해주세요.' }
  }

  const db = createAdminClient()

  const { data: schedule, error: schedErr } = await db
    .from('push_schedules')
    .upsert({ slot, send_time, title, body, is_active }, { onConflict: 'slot' })
    .select('id')
    .single()

  if (schedErr || !schedule) {
    return { error: schedErr?.message ?? '저장 실패' }
  }

  const scheduleId = schedule.id

  await db.from('push_schedule_orgs').delete().eq('schedule_id', scheduleId)

  if (org_ids.length > 0) {
    const rows = org_ids.map(organization_id => ({ schedule_id: scheduleId, organization_id }))
    const { error: orgErr } = await db.from('push_schedule_orgs').insert(rows)
    if (orgErr) return { error: orgErr.message }
  }

  return {}
}
