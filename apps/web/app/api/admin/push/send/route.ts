export const runtime = 'edge'

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

const PUSH_SECRET = process.env.PUSH_CRON_SECRET

export async function POST(req: Request) {
  const authHeader = req.headers.get('Authorization')
  if (!PUSH_SECRET || authHeader !== `Bearer ${PUSH_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = createAdminClient()

  // 현재 KST 시간 HH:MM
  const kstNow = new Date(Date.now() + 9 * 60 * 60 * 1000)
  const currentTime = kstNow.toISOString().slice(11, 16) // "HH:MM"

  // 현재 시간과 일치하는 활성 스케줄 조회
  const { data: schedules } = await db
    .from('push_schedules')
    .select('id, title, body, last_sent_at')
    .eq('is_active', true)
    .eq('send_time', currentTime)

  if (!schedules || schedules.length === 0) {
    return NextResponse.json({ sent: 0, time: currentTime })
  }

  let totalSent = 0
  const results: string[] = []

  for (const schedule of schedules as { id: string; title: string; body: string; last_sent_at: string | null }[]) {
    // 23시간 이내 중복 발송 방지
    if (schedule.last_sent_at) {
      const hoursSince = (Date.now() - new Date(schedule.last_sent_at).getTime()) / 3_600_000
      if (hoursSince < 23) {
        results.push(`skip:${schedule.id} (${hoursSince.toFixed(1)}h ago)`)
        continue
      }
    }

    // 대상 org 조회
    const { data: scheduleOrgs } = await db
      .from('push_schedule_orgs')
      .select('organization_id')
      .eq('schedule_id', schedule.id)

    if (!scheduleOrgs?.length) { results.push(`skip:${schedule.id} no orgs`); continue }

    const orgIds = scheduleOrgs.map((s: { organization_id: string }) => s.organization_id)

    // 해당 org 회원의 user_id 조회
    const { data: memberships } = await db
      .from('memberships')
      .select('user_id')
      .in('organization_id', orgIds)

    if (!memberships?.length) { results.push(`skip:${schedule.id} no members`); continue }

    const userIds = memberships.map((m: { user_id: string }) => m.user_id)

    // 푸시 토큰 조회
    const { data: tokens } = await db
      .from('push_tokens')
      .select('token')
      .in('user_id', userIds)

    if (!tokens?.length) { results.push(`skip:${schedule.id} no tokens`); continue }

    // Expo Push API 발송
    const messages = tokens.map((t: { token: string }) => ({
      to: t.token,
      title: schedule.title,
      body: schedule.body,
      sound: 'default',
    }))

    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(messages),
    })

    if (res.ok) {
      totalSent += tokens.length
      await db.from('push_schedules').update({ last_sent_at: new Date().toISOString() }).eq('id', schedule.id)
      results.push(`sent:${schedule.id} to ${tokens.length} devices`)
    } else {
      results.push(`error:${schedule.id} expo ${res.status}`)
    }
  }

  return NextResponse.json({ sent: totalSent, time: currentTime, results })
}
