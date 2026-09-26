import { describe, expect, it, vi } from 'vitest'
import { EASYFIN_SCOPES, getJobState, listBankAccounts, requestJob, searchTransactions } from './easyfinbank'

const fake = (result: unknown = {}) => ({ request: vi.fn().mockResolvedValue(result) })
const asClient = (f: ReturnType<typeof fake>) => f as never

describe('팝빌 계좌조회 호출 — 경로·파라미터는 공식 SDK(popbill 1.64.2)와 같다', () => {
  it('범위(scope)는 계좌조회 180', () => {
    expect(EASYFIN_SCOPES).toEqual(['180'])
  })

  it('★ 계좌 목록: GET /EasyFin/Bank/ListBankAccount', async () => {
    const f = fake([{ bankCode: '0011' }])
    expect(await listBankAccounts(asClient(f))).toEqual([{ bankCode: '0011' }])
    expect(f.request).toHaveBeenCalledWith('GET', '/EasyFin/Bank/ListBankAccount', { scopes: ['180'] })
  })

  it('★ 수집 요청: POST /EasyFin/Bank/BankAccount?BankCode&AccountNumber&SDate&EDate 이고 jobID 를 돌려준다', async () => {
    const f = fake({ jobID: '026092612000000001' })
    const id = await requestJob(asClient(f), { bankCode: '0011', accountNumber: '3120000000000', startDate: '20260901', endDate: '20260926' })
    expect(id).toBe('026092612000000001')
    expect(f.request).toHaveBeenCalledWith('POST', '/EasyFin/Bank/BankAccount?BankCode=0011&AccountNumber=3120000000000&SDate=20260901&EDate=20260926', { scopes: ['180'] })
  })

  it('수집 요청 입력 검증: 날짜 형식(yyyyMMdd)·시작≤종료·계좌번호는 숫자와 하이픈만, 잘못되면 호출하지 않는다', async () => {
    const f = fake()
    const ok = { bankCode: '0011', accountNumber: '3120000000000', startDate: '20260901', endDate: '20260926' }
    for (const bad of [
      { ...ok, startDate: '2026-09-01' }, { ...ok, endDate: '20261301' }, { ...ok, startDate: '20260927' },
      { ...ok, bankCode: '11' }, { ...ok, accountNumber: '' }, { ...ok, accountNumber: '312 000&x=1' },
    ]) {
      await expect(requestJob(asClient(f), bad)).rejects.toThrow()
    }
    expect(f.request).not.toHaveBeenCalled()
  })

  it('★ 수집 요청 범위는 최대 1개월(공식 제한) — 넘으면 호출하지 않는다', async () => {
    const f = fake()
    await expect(requestJob(asClient(f), { bankCode: '0011', accountNumber: '1', startDate: '20260801', endDate: '20260926' })).rejects.toThrow(/1개월/)
    expect(f.request).not.toHaveBeenCalled()
  })

  it('응답에 jobID 가 없으면 오류(성공으로 넘기지 않는다)', async () => {
    await expect(requestJob(asClient(fake({})), { bankCode: '0011', accountNumber: '1', startDate: '20260901', endDate: '20260926' })).rejects.toThrow(/jobID/)
  })

  it('★ 수집 상태: GET /EasyFin/Bank/{jobID}/State, jobID 는 18자리', async () => {
    const f = fake({ jobState: 3, errorCode: 1 })
    expect(await getJobState(asClient(f), '026092612000000001')).toEqual({ jobState: 3, errorCode: 1 })
    expect(f.request).toHaveBeenCalledWith('GET', '/EasyFin/Bank/026092612000000001/State', { scopes: ['180'] })
    await expect(getJobState(asClient(f), 'short')).rejects.toThrow(/jobID/)
  })

  it('★ 내역 조회: GET /EasyFin/Bank/{jobID}?TradeType=&Page=&PerPage=&Order=, 페이지 크기는 최대 1,000', async () => {
    const f = fake({ list: [] })
    await searchTransactions(asClient(f), '026092612000000001', { page: 2, perPage: 1000, order: 'A' })
    expect(f.request).toHaveBeenCalledWith('GET', '/EasyFin/Bank/026092612000000001?TradeType=&Page=2&PerPage=1000&Order=A', { scopes: ['180'] })
    await expect(searchTransactions(asClient(f), '026092612000000001', { page: 1, perPage: 1001, order: 'A' })).rejects.toThrow(/PerPage/)
    await expect(searchTransactions(asClient(f), '026092612000000001', { page: 0, perPage: 500, order: 'D' })).rejects.toThrow(/Page/)
    await expect(searchTransactions(asClient(f), 'short', { page: 1, perPage: 500, order: 'D' })).rejects.toThrow(/jobID/)
  })
})
