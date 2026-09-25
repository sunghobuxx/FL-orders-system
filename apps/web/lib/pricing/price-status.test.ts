import { describe, expect, it } from 'vitest'
import {
  NO_PRICE_STATUS, adminStatusText, displayFor, kstClock, priceStatus,
  priceStatusPrintText, priceStatusText, priceWarnings,
} from './price-status'

const FROM = '2026-09-26'
const base = { date: '2026-09-30', confirmedAt: null, lastPriceAt: null, statementConfirmed: false, from: FROM }

describe('priceStatus — 5가지 상태', () => {
  it('시행일 이전 날짜는 none (월정산 업체의 9월 초가 전부 「입력 중」으로 뜨는 것을 막는다)', () => {
    expect(priceStatus({ ...base, date: '2026-09-25' })).toEqual({ status: 'none', at: null })
  })

  it('시행일 당일부터는 none 이 아니다', () => {
    expect(priceStatus({ ...base, date: FROM }).status).toBe('pending')
  })

  it('그 날짜를 포함한 정산서가 확정됐으면 final — 확정 기록이 있어도 마찬가지', () => {
    expect(priceStatus({ ...base, statementConfirmed: true, confirmedAt: '2026-09-30T04:00:00Z' }))
      .toEqual({ status: 'final', at: null })
  })

  it('확정 기록이 없으면 pending', () => {
    expect(priceStatus(base)).toEqual({ status: 'pending', at: null })
  })

  it('확정 뒤에 그 날짜 단가가 새로 등록되면 modified, 시각은 마지막 단가 등록 시각', () => {
    expect(priceStatus({ ...base, confirmedAt: '2026-09-30T04:10:00Z', lastPriceAt: '2026-09-30T04:40:00Z' }))
      .toEqual({ status: 'modified', at: '2026-09-30T04:40:00Z' })
  })

  it('확정 뒤에 새 단가가 없으면 confirmed, 시각은 확정 시각', () => {
    expect(priceStatus({ ...base, confirmedAt: '2026-09-30T04:10:00Z', lastPriceAt: '2026-09-30T03:50:00Z' }))
      .toEqual({ status: 'confirmed', at: '2026-09-30T04:10:00Z' })
  })

  it('확정 시각과 마지막 단가 등록 시각이 같으면 confirmed (경계)', () => {
    expect(priceStatus({ ...base, confirmedAt: '2026-09-30T04:10:00Z', lastPriceAt: '2026-09-30T04:10:00Z' }).status)
      .toBe('confirmed')
  })

  it('그날 단가가 하나도 없어도(일요일 등) 확정할 수 있다', () => {
    expect(priceStatus({ ...base, confirmedAt: '2026-09-30T04:10:00Z', lastPriceAt: null }).status).toBe('confirmed')
  })

  it('PostgREST 의 +00:00 표기와 Z 표기를 같은 시각으로 비교한다', () => {
    expect(priceStatus({ ...base, confirmedAt: '2026-09-30T04:10:00+00:00', lastPriceAt: '2026-09-30T04:10:00Z' }).status)
      .toBe('confirmed')
  })
})

describe('displayFor — 화면마다 보여주는 범위', () => {
  const today = '2026-10-05'
  const member = (r: Parameters<typeof displayFor>[0], date: string, view: 'spec' | 'settlement' = 'spec') =>
    displayFor(r, date, { audience: 'member', today, view })
  const driver = (r: Parameters<typeof displayFor>[0], date: string) => displayFor(r, date, { audience: 'driver', today })

  it('none 은 누구에게도 보이지 않는다', () => {
    expect(member(NO_PRICE_STATUS, '2026-10-05')).toBeNull()
    expect(driver(NO_PRICE_STATUS, '2026-10-05')).toBeNull()
  })

  it('final 은 업체에게는 없고 배송앱에는 「정산 확정」', () => {
    const r = { status: 'final', at: null } as const
    expect(member(r, '2026-10-01')).toBeNull()
    expect(driver(r, '2026-10-01')).toEqual({ status: 'final', at: null })
  })

  it('업체: pending 은 오늘·어제만 보이고 그보다 오래되면 숨긴다', () => {
    const r = { status: 'pending', at: null } as const
    expect(member(r, '2026-10-05')).toEqual({ status: 'pending', at: null })
    expect(member(r, '2026-10-04')).toEqual({ status: 'pending', at: null })
    expect(member(r, '2026-10-03')).toBeNull()
  })

  it('배송앱: pending 은 아무리 오래된 날짜라도 항상 보인다', () => {
    expect(driver({ status: 'pending', at: null }, '2026-09-27')).toEqual({ status: 'pending', at: null })
  })

  it('modified 는 나이와 관계없이 둘 다 보인다', () => {
    const r = { status: 'modified', at: '2026-09-27T05:00:00Z' } as const
    expect(member(r, '2026-09-27')).toEqual(r)
    expect(driver(r, '2026-09-27')).toEqual(r)
  })

  it('업체: confirmed 는 당일명세서(spec)에만 보이고 정산서 화면에서는 생략한다', () => {
    const r = { status: 'confirmed', at: '2026-10-05T04:10:00Z' } as const
    expect(member(r, '2026-10-05', 'spec')).toEqual(r)
    expect(member(r, '2026-10-05', 'settlement')).toBeNull()
    expect(driver(r, '2026-10-05')).toEqual(r)
  })

  it('"어제" 는 KST 날짜 기준이다 (today 를 KST 날짜로 받는다)', () => {
    expect(member({ status: 'pending', at: null }, '2026-09-30')).toBeNull() // today=10-05 이므로 5일 전
  })
})

describe('문구', () => {
  it('kstClock: UTC 를 KST(+9) 시각으로', () => {
    expect(kstClock('2026-09-24T04:10:00Z')).toBe('13:10')
    expect(kstClock('2026-09-24T15:30:00+00:00')).toBe('00:30')
  })

  it('화면 문구 3가지 + 정산 확정', () => {
    expect(priceStatusText({ status: 'pending', at: null }))
      .toBe('단가 입력 중 · 금액이 바뀔 수 있습니다 (이전 단가 기준)')
    expect(priceStatusText({ status: 'confirmed', at: '2026-09-24T04:10:00Z' })).toBe('✓ 당일 단가 확정 (13:10)')
    expect(priceStatusText({ status: 'modified', at: '2026-09-24T04:40:00Z' }))
      .toBe('단가 수정됨 · 금액이 바뀔 수 있습니다 (13:40 수정)')
    expect(priceStatusText({ status: 'final', at: null })).toBe('정산 확정')
  })

  it('인쇄물 문구: pending·modified·confirmed 는 화면과 같고 final 은 찍지 않는다', () => {
    expect(priceStatusPrintText({ status: 'confirmed', at: '2026-09-24T04:10:00Z' })).toBe('✓ 당일 단가 확정 (13:10)')
    expect(priceStatusPrintText({ status: 'pending', at: null }))
      .toBe('단가 입력 중 · 금액이 바뀔 수 있습니다 (이전 단가 기준)')
    expect(priceStatusPrintText({ status: 'final', at: null })).toBeNull()
  })

  it('어드민 문구', () => {
    expect(adminStatusText({ status: 'pending', at: null })).toBe('입력 중 (아직 확정 전)')
    expect(adminStatusText({ status: 'confirmed', at: '2026-09-24T04:10:00Z' })).toBe('확정됨 (13:10)')
    expect(adminStatusText({ status: 'modified', at: '2026-09-24T04:40:00Z' }))
      .toBe('확정 후 단가가 수정됨 (13:40 수정) — 다시 확정해 주세요')
    expect(adminStatusText(NO_PRICE_STATUS)).toBe('시행일 이전 날짜입니다')
  })
})

describe('priceWarnings — 대시보드 경고', () => {
  const today = '2026-10-05'

  it('경고할 것이 없으면 빈 목록', () => {
    expect(priceWarnings(today, [
      { date: '2026-10-05', status: 'confirmed' }, { date: '2026-10-04', status: 'final' },
    ])).toEqual([])
  })

  it('오늘 단가가 확정 전이면 today_pending', () => {
    const w = priceWarnings(today, [{ date: '2026-10-05', status: 'pending' }])
    expect(w).toHaveLength(1)
    expect(w[0]).toMatchObject({ kind: 'today_pending', dates: ['2026-10-05'] })
    expect(w[0].message).toContain('오늘(10/5)')
  })

  it('확정 뒤 수정된 날짜는 나이와 관계없이 modified 로 모은다', () => {
    const w = priceWarnings(today, [
      { date: '2026-10-05', status: 'modified' }, { date: '2026-10-02', status: 'modified' },
    ])
    expect(w).toEqual([expect.objectContaining({ kind: 'modified', dates: ['2026-10-02', '2026-10-05'] })])
  })

  it('확정하지 않은 지난 날짜(어제 포함)는 old_pending 으로 모은다', () => {
    const w = priceWarnings(today, [
      { date: '2026-10-04', status: 'pending' }, { date: '2026-10-01', status: 'pending' },
    ])
    expect(w).toEqual([expect.objectContaining({ kind: 'old_pending', dates: ['2026-10-01', '2026-10-04'] })])
  })

  it('none·final 은 경고하지 않는다', () => {
    expect(priceWarnings(today, [
      { date: '2026-10-05', status: 'none' }, { date: '2026-10-04', status: 'final' },
    ])).toEqual([])
  })
})
