import { describe, expect, it } from 'vitest'
import { loadDateStatuses, loadSpecStatuses } from './price-status-loader'

const FROM = '2026-09-26'

/** .from(name).select().in().eq() 를 흉내 내는 가짜 DB. 호출 기록도 남긴다. */
function fakeDb(tables: Record<string, Array<Record<string, unknown>>>, failOn?: string) {
  const calls: string[] = []
  return {
    calls,
    from(name: string) {
      calls.push(name)
      let rows = [...(tables[name] ?? [])]
      const q: Record<string, unknown> = {
        select: () => q,
        in: (col: string, vals: unknown[]) => { rows = rows.filter(r => vals.includes(r[col])); return q },
        eq: (col: string, val: unknown) => { rows = rows.filter(r => r[col] === val); return q },
        gt: (col: string, val: string) => { rows = rows.filter(r => new Date(r[col] as string) > new Date(val)); return q },
        then: (resolve: (v: unknown) => unknown) =>
          Promise.resolve(name === failOn ? { data: null, error: { message: 'boom' } } : { data: rows, error: null }).then(resolve),
      }
      return q
    },
  }
}

const confirmations = [{ business_date: '2026-09-30', confirmed_at: '2026-09-30T04:10:00Z' }]
const lastChange = [
  { business_date: '2026-09-30', last_price_at: '2026-09-30T03:50:00Z' },
  { business_date: '2026-10-01', last_price_at: '2026-10-01T04:00:00Z' },
]

describe('loadDateStatuses', () => {
  it('확정 기록·마지막 단가 등록 시각으로 날짜별 상태를 만든다', async () => {
    const db = fakeDb({ price_confirmations: confirmations, price_day_last_change: lastChange })
    const m = await loadDateStatuses(db, ['2026-09-30', '2026-10-01', '2026-10-02'], FROM)
    expect(m.get('2026-09-30')).toEqual({ status: 'confirmed', at: '2026-09-30T04:10:00Z' })
    expect(m.get('2026-10-01')).toEqual({ status: 'pending', at: null })
    expect(m.get('2026-10-02')).toEqual({ status: 'pending', at: null })
  })

  it('확정 뒤에 단가가 더 등록되면 modified', async () => {
    const db = fakeDb({
      price_confirmations: confirmations,
      price_day_last_change: [{ business_date: '2026-09-30', last_price_at: '2026-09-30T05:00:00Z' }],
    })
    const m = await loadDateStatuses(db, ['2026-09-30'], FROM)
    expect(m.get('2026-09-30')).toEqual({ status: 'modified', at: '2026-09-30T05:00:00Z' })
  })

  it('확정 뒤에 **더 이전 날짜**로 단가를 등록해도 그 날짜 명세서 금액이 바뀌므로 modified (어제 단가를 오늘 고치는 경우)', async () => {
    // 단가 등록은 effective_from 이후의 모든 날짜 명세서를 덮어쓴다 — 9/29 단가를 9/30 확정 뒤에 넣으면 9/30 금액도 바뀐다.
    const db = fakeDb({
      price_confirmations: confirmations,
      price_day_last_change: [{ business_date: '2026-09-29', last_price_at: '2026-09-30T05:00:00Z' }],
    })
    const m = await loadDateStatuses(db, ['2026-09-30'], FROM)
    expect(m.get('2026-09-30')).toEqual({ status: 'modified', at: '2026-09-30T05:00:00Z' })
  })

  it('확정 뒤에 **더 늦은 날짜**(내일 단가)를 등록해도 그 날짜는 그대로 confirmed', async () => {
    const db = fakeDb({
      price_confirmations: confirmations,
      price_day_last_change: [{ business_date: '2026-10-01', last_price_at: '2026-09-30T05:00:00Z' }],
    })
    expect((await loadDateStatuses(db, ['2026-09-30'], FROM)).get('2026-09-30')?.status).toBe('confirmed')
  })

  it('확정 **이전**에 이전 날짜로 등록된 단가는 수정으로 보지 않는다', async () => {
    const db = fakeDb({
      price_confirmations: confirmations,
      price_day_last_change: [{ business_date: '2026-09-29', last_price_at: '2026-09-30T03:00:00Z' }],
    })
    expect((await loadDateStatuses(db, ['2026-09-30'], FROM)).get('2026-09-30')?.status).toBe('confirmed')
  })

  it('날짜마다 자기 확정 시각으로 따진다 — 먼저 확정한 날만 modified', async () => {
    const db = fakeDb({
      price_confirmations: [
        { business_date: '2026-09-29', confirmed_at: '2026-09-29T04:00:00Z' },
        { business_date: '2026-09-30', confirmed_at: '2026-09-30T06:00:00Z' },
      ],
      // 9/29 확정 뒤, 9/30 확정 전에 9/28 단가가 등록됨 → 9/29 는 수정됨, 9/30 은 이미 그 뒤에 확정했으므로 confirmed
      price_day_last_change: [{ business_date: '2026-09-28', last_price_at: '2026-09-30T05:00:00Z' }],
    })
    const m = await loadDateStatuses(db, ['2026-09-29', '2026-09-30'], FROM)
    expect(m.get('2026-09-29')?.status).toBe('modified')
    expect(m.get('2026-09-30')?.status).toBe('confirmed')
  })

  it('확정된 날짜가 하나도 없으면 단가 등록 뷰는 조회하지 않는다', async () => {
    const db = fakeDb({ price_confirmations: [], price_day_last_change: [] })
    await loadDateStatuses(db, ['2026-09-30'], FROM)
    expect(db.calls).not.toContain('price_day_last_change')
  })

  it('시행일 이전 날짜만 있으면 DB 를 한 번도 조회하지 않고 none', async () => {
    const db = fakeDb({})
    const m = await loadDateStatuses(db, ['2026-09-01', '2026-09-25'], FROM)
    expect(db.calls).toEqual([])
    expect(m.get('2026-09-01')).toEqual({ status: 'none', at: null })
  })

  it('중복 날짜는 한 번만 조회한다', async () => {
    const db = fakeDb({ price_confirmations: [], price_day_last_change: [] })
    await loadDateStatuses(db, ['2026-09-30', '2026-09-30'], FROM)
    expect(db.calls.filter(c => c === 'price_confirmations')).toHaveLength(1)
  })

  it('조회 오류는 삼키지 않고 던진다(호출자가 상태만 생략한다)', async () => {
    const db = fakeDb({}, 'price_confirmations')
    await expect(loadDateStatuses(db, ['2026-09-30'], FROM)).rejects.toThrow('price_confirmations')
  })
})

describe('loadSpecStatuses', () => {
  const specs = [
    { id: 's-old', business_date: '2026-09-10' },
    { id: 's-a', business_date: '2026-09-30' },
    { id: 's-b', business_date: '2026-10-01' },
  ]

  it('명세서 id 로 상태를 돌려주고, 시행일 이전 명세서는 none', async () => {
    const db = fakeDb({ price_confirmations: confirmations, price_day_last_change: lastChange, sales_statement_lines: [] })
    const m = await loadSpecStatuses(db, specs, FROM)
    expect(m.get('s-old')).toEqual({ status: 'none', at: null })
    expect(m.get('s-a')).toEqual({ status: 'confirmed', at: '2026-09-30T04:10:00Z' })
    expect(m.get('s-b')).toEqual({ status: 'pending', at: null })
  })

  it('정산서가 확정된 명세서는 final (확정 정산서 금액이 최종)', async () => {
    const db = fakeDb({
      price_confirmations: confirmations, price_day_last_change: lastChange,
      sales_statement_lines: [
        { source_doc_id: 's-a', source_doc_type: 'daily_spec', sales_statements: { confirmed_at: '2026-10-03T00:00:00Z' } },
        { source_doc_id: 's-b', source_doc_type: 'daily_spec', sales_statements: { confirmed_at: null } },
      ],
    })
    const m = await loadSpecStatuses(db, specs, FROM)
    expect(m.get('s-a')).toEqual({ status: 'final', at: null })
    expect(m.get('s-b')).toEqual({ status: 'pending', at: null })
  })

  it('명세서 단위에서도 이전 날짜 단가가 확정 뒤에 등록되면 modified', async () => {
    const db = fakeDb({
      price_confirmations: confirmations,
      price_day_last_change: [{ business_date: '2026-09-29', last_price_at: '2026-09-30T05:00:00Z' }],
      sales_statement_lines: [],
    })
    expect((await loadSpecStatuses(db, specs, FROM)).get('s-a')).toEqual({ status: 'modified', at: '2026-09-30T05:00:00Z' })
  })

  it('정산서 join 이 배열로 와도 확정 여부를 읽는다', async () => {
    const db = fakeDb({
      price_confirmations: [], price_day_last_change: [],
      sales_statement_lines: [{ source_doc_id: 's-a', source_doc_type: 'daily_spec', sales_statements: [{ confirmed_at: '2026-10-03T00:00:00Z' }] }],
    })
    expect((await loadSpecStatuses(db, specs, FROM)).get('s-a')?.status).toBe('final')
  })

  it('명세서가 많아도 정산서 조회를 100개씩 나눠서 한다(URL 길이·행 제한 회피)', async () => {
    const many = Array.from({ length: 250 }, (_, i) => ({ id: `s${i}`, business_date: '2026-09-30' }))
    const db = fakeDb({ price_confirmations: [], price_day_last_change: [], sales_statement_lines: [] })
    await loadSpecStatuses(db, many, FROM)
    expect(db.calls.filter(c => c === 'sales_statement_lines')).toHaveLength(3)
  })

  it('시행일 이전 명세서만 있으면 DB 를 조회하지 않는다', async () => {
    const db = fakeDb({})
    const m = await loadSpecStatuses(db, [{ id: 's-old', business_date: '2026-09-10' }], FROM)
    expect(db.calls).toEqual([])
    expect(m.get('s-old')?.status).toBe('none')
  })
})
