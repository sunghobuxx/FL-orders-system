const KST_OFFSET = 9 * 60 * 60 * 1000

// Catch delayed cron runs on the same Korean calendar day, not only the exact minute.
export function pushScheduleDue(sendTime: string, lastSent: string | null, now = new Date()) {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(sendTime)) return false
  const today = new Date(now.getTime() + KST_OFFSET).toISOString().slice(0, 10)
  const dueAt = Date.parse(`${today}T${sendTime}:00+09:00`)
  return now.getTime() >= dueAt && (!lastSent || Date.parse(lastSent) < dueAt)
}

type Ticket = { status?: string; id?: string; details?: { error?: string } }
export async function submitExpoPush(tokens: string[], title: string, body: string, request: typeof fetch = fetch) {
  const unique = [...new Set(tokens)]
  const ticketIds: string[] = []
  const errors: string[] = []
  let accepted = 0
  for (let i = 0; i < unique.length; i += 100) {
    const batch = unique.slice(i, i + 100)
    try {
      const response = await request('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        signal: AbortSignal.timeout(15000),
        body: JSON.stringify(batch.map(to => ({ to, title, body, sound: 'default', channelId: 'default' }))),
      })
      if (!response.ok) { errors.push(`expo_http_${response.status}`); continue }
      const payload = await response.json() as { data?: Ticket[] }
      if (!Array.isArray(payload.data) || payload.data.length !== batch.length) {
        errors.push('invalid_ticket_response'); continue
      }
      for (const ticket of payload.data) {
        if (ticket.status === 'ok' && ticket.id) { accepted++; ticketIds.push(ticket.id) }
        else errors.push(ticket.details?.error ?? 'ticket_rejected')
      }
    } catch { errors.push('expo_request_failed') }
  }
  // Accepted tickets are NOT proof of device delivery. Check Expo receipts separately.
  return { accepted, requested: unique.length, ticketIds, errors }
}
