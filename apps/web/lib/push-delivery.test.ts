import { describe, expect, it, vi } from 'vitest'
import { pushScheduleDue, submitExpoPush } from './push-delivery'

describe('push scheduling', () => {
  it('catches late runs but not future schedules', () => {
    const now = new Date('2026-09-16T02:51:00+09:00')
    expect(pushScheduleDue('01:00', null, now)).toBe(true)
    expect(pushScheduleDue('03:00', null, now)).toBe(false)
    expect(pushScheduleDue('25:00', null, now)).toBe(false)
  })
  it('does not repeat a sent schedule and handles KST date rollover', () => {
    const now = new Date('2026-09-16T01:10:00+09:00')
    expect(pushScheduleDue('01:00', '2026-09-16T01:05:00+09:00', now)).toBe(false)
    expect(pushScheduleDue('01:00', '2026-09-15T14:00:00+09:00', now)).toBe(true)
    expect(pushScheduleDue('23:00', null, now)).toBe(false)
  })
})

describe('Expo submission', () => {
  it('does not count HTTP 200 ticket errors as sent', async () => {
    const request = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [
      { status: 'ok', id: 'ticket1' }, { status: 'error', details: { error: 'InvalidCredentials' } },
    ] })))
    const result = await submitExpoPush(['one', 'two'], 'title', 'body', request)
    expect(result.accepted).toBe(1)
    expect(result.errors).toEqual(['InvalidCredentials'])
    expect(result.ticketIds).toEqual(['ticket1'])
  })
  it('deduplicates tokens and uses batches of at most 100', async () => {
    const sizes: number[] = []
    const request = vi.fn(async (_url, options) => {
      const batch = JSON.parse(options.body); sizes.push(batch.length)
      return new Response(JSON.stringify({ data: batch.map(() => ({ status: 'ok', id: 'id' })) }))
    })
    const tokens = Array.from({ length: 101 }, (_, i) => `t${i}`)
    expect((await submitExpoPush([...tokens, 't0'], 'title', 'body', request)).accepted).toBe(101)
    expect(sizes).toEqual([100, 1])
  })
  it('reports transport errors and malformed tickets without success', async () => {
    for (const response of [new Response('', { status: 503 }), new Response('{"data":[]}')]) {
      const result = await submitExpoPush(['one'], 'title', 'body', vi.fn().mockResolvedValue(response))
      expect(result.accepted).toBe(0); expect(result.errors.length).toBeGreaterThan(0)
    }
    expect((await submitExpoPush(['one'], 'title', 'body', vi.fn().mockRejectedValue(new Error()))).accepted).toBe(0)
  })
})
