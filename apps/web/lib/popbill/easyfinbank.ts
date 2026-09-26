import type { PopbillClient } from './client'

/**
 * 팝빌 계좌조회(EasyFinBank) 호출. 경로·파라미터는 공식 Node SDK(popbill 1.64.2) 소스와 같다
 * (REST 문서 페이지에는 경로가 없어 SDK 소스를 기준으로 삼았다 — 2026-09-26).
 *
 *   계좌 목록   GET  /EasyFin/Bank/ListBankAccount
 *   수집 요청   POST /EasyFin/Bank/BankAccount?BankCode&AccountNumber&SDate&EDate   → { jobID }
 *   수집 상태   GET  /EasyFin/Bank/{jobID}/State                                     (jobState 3 + errorCode 1 = 성공)
 *   내역 조회   GET  /EasyFin/Bank/{jobID}?TradeType&Page&PerPage&Order
 *
 * 공식 제한: 수집 요청은 한 번에 최대 1개월, 조회일 기준 3개월 전까지. jobID 는 요청 시점부터 1시간 유효.
 * 페이지 크기는 최대 1,000. 이 파일은 조회 전용이다 — 출금·송금 기능은 만들지 않는다.
 */
export const EASYFIN_SCOPES = ['180']
type Client = Pick<PopbillClient, 'request'>

const JOB_ID = /^\d{18}$/
const assertJobId = (id: string) => { if (!JOB_ID.test(id)) throw new Error('jobID 는 18자리 숫자여야 합니다') }

function parseYmd(s: string, label: string): Date {
  if (!/^\d{8}$/.test(s)) throw new Error(`${label} 는 yyyyMMdd 형식이어야 합니다`)
  const d = new Date(Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8)))
  if (d.getUTCFullYear() !== +s.slice(0, 4) || d.getUTCMonth() !== +s.slice(4, 6) - 1 || d.getUTCDate() !== +s.slice(6, 8)) {
    throw new Error(`${label} 가 올바른 날짜가 아닙니다`)
  }
  return d
}

export async function listBankAccounts(client: Client): Promise<unknown> {
  return client.request('GET', '/EasyFin/Bank/ListBankAccount', { scopes: EASYFIN_SCOPES })
}

export async function requestJob(
  client: Client,
  a: { bankCode: string; accountNumber: string; startDate: string; endDate: string },
): Promise<string> {
  if (!/^\d{4}$/.test(a.bankCode)) throw new Error('기관코드는 4자리 숫자여야 합니다')
  if (!/^[0-9-]+$/.test(a.accountNumber)) throw new Error('계좌번호는 숫자와 하이픈만 쓸 수 있습니다')
  const start = parseYmd(a.startDate, 'startDate')
  const end = parseYmd(a.endDate, 'endDate')
  if (start > end) throw new Error('시작일이 종료일보다 늦습니다')
  // 최대 1개월: 종료일이 시작일의 한 달 뒤(같은 일자)를 넘으면 거절한다.
  const limit = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, start.getUTCDate()))
  if (end > limit) throw new Error('수집 요청 범위는 최대 1개월입니다')

  const res = await client.request(
    'POST',
    `/EasyFin/Bank/BankAccount?BankCode=${a.bankCode}&AccountNumber=${a.accountNumber}&SDate=${a.startDate}&EDate=${a.endDate}`,
    { scopes: EASYFIN_SCOPES },
  ) as { jobID?: string } | null
  if (!res?.jobID) throw new Error('팝빌 응답에 jobID 가 없습니다')
  return res.jobID
}

export async function getJobState(client: Client, jobId: string): Promise<unknown> {
  assertJobId(jobId)
  return client.request('GET', `/EasyFin/Bank/${jobId}/State`, { scopes: EASYFIN_SCOPES })
}

export async function searchTransactions(
  client: Client,
  jobId: string,
  o: { page: number; perPage: number; order: 'A' | 'D' },
): Promise<unknown> {
  assertJobId(jobId)
  if (!Number.isInteger(o.page) || o.page < 1) throw new Error('Page 는 1 이상의 정수여야 합니다')
  if (!Number.isInteger(o.perPage) || o.perPage < 1 || o.perPage > 1000) throw new Error('PerPage 는 1~1000 이어야 합니다')
  // TradeType 을 비우면 입금·출금 전체다(원본을 빠짐없이 저장하고 매칭에서 출금을 제외한다).
  return client.request('GET', `/EasyFin/Bank/${jobId}?TradeType=&Page=${o.page}&PerPage=${o.perPage}&Order=${o.order}`, { scopes: EASYFIN_SCOPES })
}
