import { describe, expect, it, vi } from 'vitest'
import { fakeDb } from '@/lib/testing/fake-db'
import { collectBankTransactions } from './collect'

const row = (over: Record<string, unknown> = {}) => ({
  tid: 't1', accountID: 'acc-1', trdate: '20260929', trdt: '20260929150157',
  accIn: '156000', accOut: '0', balance: '2739711',
  remark1: '할매솥뚜껑삼겹살', remark2: '신한', remark3: '폰뱅킹', remark4: '',
  memo: '', trserial: 8, regDT: '20260929151151', ...over,
})

function fakeClient(opts: {
  jobId?: string
  states?: unknown[]
  pages?: unknown[][]
} = {}) {
  const requestFn = vi.fn(async (method: string, path: string) => {
    if (path.startsWith('/EasyFin/Bank/BankAccount')) return { jobID: opts.jobId ?? '026092900000000001' }
    if (path.endsWith('/State')) {
      const states = opts.states ?? [{ jobState: 3, errorCode: 1 }]
      const call = requestFn.mock.calls.filter(c => String(c[1]).endsWith('/State')).length
      return states[Math.min(call, states.length - 1)]
    }
    const m = /Page=(\d+)/.exec(path)
    const page = Number(m?.[1] ?? 1)
    const pages = opts.pages ?? [[row()]]
    return { list: pages[page - 1] ?? [] }
  })
  return { request: requestFn }
}

const args = { accountRef: 'acc-1', bankCode: '0011', accountNumber: '1234567890', startDate: '20260927', endDate: '20260929' }

describe('collectBankTransactions — 수집 요청→상태 폴링→내역 저장', () => {
  it('★ 성공 흐름: jobID 를 받고, 상태가 완료(3)가 될 때까지 기다린 뒤, 내역을 정규화해 저장한다', async () => {
    const f = fakeDb({})
    const client = fakeClient({ states: [{ jobState: 2 }, { jobState: 2 }, { jobState: 3, errorCode: 1 }] })
    const r = await collectBankTransactions(f.db as never, client as never, args, { pollDelayMs: 0 })
    expect(r).toEqual({ jobId: '026092900000000001', fetched: 1, saved: 1 })
    const w = f.writes.find(w => w.table === 'bank_transactions' && w.op === 'upsert')!
    expect(w.payload).toEqual([{
      account_ref: 'acc-1', provider_tid: 't1', trdt: '2026-09-29T15:01:57+09:00',
      direction: 'in', amount: 156000, balance: 2739711, depositor_raw: '할매솥뚜껑삼겹살', depositor_norm: '할매솥뚜껑삼겹살',
      raw: row(),
    }])
    expect(w.opts).toMatchObject({ onConflict: 'account_ref,provider_tid', ignoreDuplicates: true })
  })

  it('★ 완료(jobState 3)이지만 errorCode 가 1 이 아니면 실패로 본다', async () => {
    const client = fakeClient({ states: [{ jobState: 3, errorCode: 2, errorReason: '기간 오류' }] })
    await expect(collectBankTransactions(fakeDb({}).db as never, client as never, args, { pollDelayMs: 0 }))
      .rejects.toThrow(/기간 오류|수집 실패/)
  })

  it('★ 실패(jobState 4)면 재시도하지 않고 바로 오류를 던진다', async () => {
    const client = fakeClient({ states: [{ jobState: 4, errorReason: '계좌 오류' }] })
    await expect(collectBankTransactions(fakeDb({}).db as never, client as never, args, { pollDelayMs: 0 }))
      .rejects.toThrow(/계좌 오류/)
  })

  it('정해진 횟수 안에 완료되지 않으면 결과 불명으로 오류를 던진다(재수집으로 이어감)', async () => {
    const client = fakeClient({ states: [{ jobState: 2 }, { jobState: 2 }, { jobState: 2 }] })
    await expect(collectBankTransactions(fakeDb({}).db as never, client as never, args, { pollDelayMs: 0, pollAttempts: 3 }))
      .rejects.toThrow(/시간 초과|결과 불명/)
  })

  it('★ 1,000건씩 페이지를 넘겨 전부 가져오고, 마지막 페이지(1,000건 미만)에서 멈춘다', async () => {
    const p1 = Array.from({ length: 1000 }, (_, i) => row({ tid: `t${i}`, trserial: i }))
    const p2 = [row({ tid: 't-last', trserial: 1000 })]
    const client = fakeClient({ pages: [p1, p2] })
    const r = await collectBankTransactions(fakeDb({}).db as never, client as never, args, { pollDelayMs: 0 })
    expect(r.fetched).toBe(1001)
    const searchCalls = client.request.mock.calls.filter(c => /Page=/.test(String(c[1])))
    expect(searchCalls).toHaveLength(2) // 3번째 빈 페이지까지 불필요하게 부르지 않는다
  })

  it('출금 등 입금자 없는 행도 저장한다(검토 목록에 남긴다) — depositor_raw 만 null', async () => {
    const f = fakeDb({})
    const client = fakeClient({ pages: [[row({ accIn: '0', accOut: '4400', remark1: '수수료' })]] })
    await collectBankTransactions(f.db as never, client as never, args, { pollDelayMs: 0 })
    const w = f.writes.find(w => w.table === 'bank_transactions' && w.op === 'upsert')!
    expect((w.payload as any[])[0]).toMatchObject({ direction: 'out', amount: 4400, depositor_raw: null })
  })
})
