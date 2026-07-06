export const runtime = 'edge'

import { getSessionUser } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

import PushScheduleForm from './PushScheduleForm'

export default async function AdminPushPage() {
  const { user } = await getSessionUser()
  void user

  const db = createAdminClient()

  const [{ data: schedules }, { data: orgs }] = await Promise.all([
    db.from('push_schedules').select('id, slot, send_time, title, body, is_active').order('slot'),
    db.from('organizations').select('id, name').eq('organization_type', 'restaurant').order('name'),
  ])

  // 각 스케줄에 선택된 org IDs
  const scheduleIds = (schedules ?? []).map(s => s.id)
  const { data: scheduleOrgs } = scheduleIds.length > 0
    ? await db.from('push_schedule_orgs').select('schedule_id, organization_id').in('schedule_id', scheduleIds)
    : { data: [] }

  const orgIdsBySchedule: Record<string, string[]> = {}
  for (const so of scheduleOrgs ?? []) {
    const row = so as { schedule_id: string; organization_id: string }
    if (!orgIdsBySchedule[row.schedule_id]) orgIdsBySchedule[row.schedule_id] = []
    orgIdsBySchedule[row.schedule_id].push(row.organization_id)
  }

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-2xl">
      <div>
        <h1 className="text-lg font-bold text-gray-900">발주 마감 푸시 알림</h1>
        <p className="text-sm text-gray-500 mt-1">설정한 시간에 선택된 업체 앱 사용자에게 자동으로 푸시 알림을 발송합니다.</p>
      </div>

      <div className="space-y-4">
        {(schedules ?? []).map(schedule => (
          <PushScheduleForm
            key={schedule.id}
            schedule={schedule as { id: string; slot: number; send_time: string; title: string; body: string; is_active: boolean }}
            orgs={(orgs ?? []) as { id: string; name: string }[]}
            selectedOrgIds={orgIdsBySchedule[schedule.id] ?? []}
          />
        ))}
      </div>
    </div>
  )
}
