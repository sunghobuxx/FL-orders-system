/**
 * 팝빌 계좌조회(Search) 응답 한 행을 `bank_transactions` 저장 모양으로 바꾼다.
 *
 * 실제 팝빌 테스트 서버 응답(2026-09-29 확인)으로 확정한 것:
 *  - `tid` 는 `accountID + trdate + trserial(6자리)` 로 구성되고, 계좌 범위에서 유일하다(재수집해도 같은 값).
 *  - `accIn`/`accOut` 는 문자열 숫자이고 방향을 가리키는 별도 필드가 없다. 값이 있는 쪽이 방향이다.
 *  - NH농협(bankCode '0011') 은 `remark1` 이 입금자명이었다(할매솥뚜껑삼겹살고강점 등 실제 업체명과 일치하는 값 확인).
 *    `remark2`/`remark3` 는 송금은행·거래매체로 보인다. **다른 은행은 아직 확인하지 못했다** — 문서도 "은행마다 다르다"고
 *    경고한다. 확인 전에는 입금자 원문을 비워 두어(null) 자동매칭이 UNMATCHED 로 안전하게 떨어지게 한다.
 */

export interface PopbillTransactionRow {
  tid: string
  accountID: string
  trdate: string
  trdt: string
  accIn: string
  accOut: string
  balance: string
  remark1: string
  remark2: string
  remark3: string
  remark4: string
  memo: string
  trserial: number
  regDT: string
}

export interface NormalizedTransaction {
  providerTid: string
  accountRef: string
  /** KST(+9) 오프셋이 있는 ISO 문자열 */
  trdt: string
  direction: 'in' | 'out'
  amount: number
  balance: number
  depositorRaw: string | null
  raw: PopbillTransactionRow
}

/** bankCode → 입금자명이 오는 필드를 확인한 은행 목록. 확인 전 은행은 여기 넣지 않는다. */
type RemarkField = 'remark1' | 'remark2' | 'remark3' | 'remark4'
const DEPOSITOR_FIELD_BY_BANK: Record<string, RemarkField> = {
  '0011': 'remark1', // NH농협은행, 2026-09-29 실거래로 확인
}

function toKstIso(yyyyMMddHHmmss: string): string {
  const s = yyyyMMddHHmmss
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T${s.slice(8, 10)}:${s.slice(10, 12)}:${s.slice(12, 14)}+09:00`
}

export function normalizeTransaction(row: PopbillTransactionRow, ctx: { accountRef: string; bankCode: string }): NormalizedTransaction {
  const accIn = Number(row.accIn)
  const accOut = Number(row.accOut)
  const direction: 'in' | 'out' = accIn > 0 ? 'in' : 'out'
  const amount = direction === 'in' ? accIn : accOut

  const field = DEPOSITOR_FIELD_BY_BANK[ctx.bankCode]
  const depositorRaw = direction === 'in' && amount > 0 && field ? (row[field] || null) : null

  return {
    providerTid: row.tid,
    accountRef: ctx.accountRef,
    trdt: toKstIso(row.trdt),
    direction,
    amount,
    balance: Number(row.balance),
    depositorRaw,
    raw: row,
  }
}
