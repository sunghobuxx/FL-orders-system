export const runtime = 'edge'

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { pushScheduleDue, submitExpoPush } from '@/lib/push-delivery'

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

  // Cron can run late. Find today's due schedules rather than matching one minute.
  const { data: schedules, error: scheduleError } = await db
    .from('push_schedules')
    .select('id, title, body, send_time, last_sent_at')
    .eq('is_active', true)
  if (scheduleError) return NextResponse.json({ error: 'schedule_query_failed' }, { status: 500 })

  if (!schedules || schedules.length === 0) {
    return NextResponse.json({ accepted: 0, time: currentTime, results: [], ticketIds: [] })
  }

  let totalSent = 0
  const results: string[] = []

  let failed = false
  const tickets: string[] = []
  for (const schedule of schedules as { id: string; title: string; body: string; send_time: string; last_sent_at: string | null }[]) {
    if (!pushScheduleDue(schedule.send_time, schedule.last_sent_at)) continue

    // 대상 org 조회
    const { data: scheduleOrgs, error: orgError } = await db
      .from('push_schedule_orgs')
      .select('organization_id')
      .eq('schedule_id', schedule.id)

    if (orgError) { failed = true; results.push(`error:${schedule.id} org_query`); continue }
    if (!scheduleOrgs?.length) { results.push(`skip:${schedule.id} no orgs`); continue }

    const orgIds = scheduleOrgs.map((s: { organization_id: string }) => s.organization_id)

    // 해당 org 회원의 user_id 조회
    const { data: memberships, error: memberError } = await db
      .from('memberships')
      .select('user_id')
      .in('organization_id', orgIds)

    if (memberError) { failed = true; results.push(`error:${schedule.id} member_query`); continue }
    if (!memberships?.length) { results.push(`skip:${schedule.id} no members`); continue }

    const userIds = memberships.map((m: { user_id: string }) => m.user_id)

    // 푸시 토큰 조회
    const { data: tokens, error: tokenError } = await db
      .from('push_tokens')
      .select('token')
      .in('user_id', userIds)

    if (tokenError) { failed = true; results.push(`error:${schedule.id} token_query`); continue }
    if (!tokens?.length) { results.push(`skip:${schedule.id} no tokens`); continue }

    // Optimistic claim prevents simultaneous cron requests from sending twice.
    const claimedAt = new Date().toISOString()
    let claim = db.from('push_schedules').update({ last_sent_at: claimedAt }).eq('id', schedule.id).eq('is_active', true)
    claim = schedule.last_sent_at ? claim.eq('last_sent_at', schedule.last_sent_at) : claim.is('last_sent_at', null)
    const { data: claimed, error: claimError } = await claim.select('id')
    if (claimError) { failed = true; results.push(`error:${schedule.id} claim`); continue }
    if (!claimed?.length) continue

    const result = await submitExpoPush(tokens.map((t: { token: string }) => t.token), schedule.title, schedule.body)
    totalSent += result.accepted
    tickets.push(...result.ticketIds)
    results.push(`accepted:${schedule.id} ${result.accepted}/${result.requested}`)
    if (result.errors.length) { failed = true; results.push(`error:${schedule.id} ${result.errors.join(',')}`) }
    // Keep partial successes claimed to avoid resending to successful devices.
    if (result.accepted === 0) {
      const { error } = await db.from('push_schedules').update({ last_sent_at: schedule.last_sent_at }).eq('id', schedule.id).eq('last_sent_at', claimedAt)
      if (error) { failed = true; results.push(`error:${schedule.id} release_claim` ) }
    }
  }

  return NextResponse.json({ accepted: totalSent, time: currentTime, results, ticketIds: tickets }, { status: failed ? 502 : 200 })
}
