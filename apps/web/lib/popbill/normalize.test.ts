import { describe, expect, it } from 'vitest'
import { normalizeTransaction, type PopbillTransactionRow } from './normalize'

const row = (over: Partial<PopbillTransactionRow> = {}): PopbillTransactionRow => ({
  tid: '02609281600000000220260929000008',
  accountID: '026092816000000002',
  trdate: '20260929',
  trdt: '20260929150157',
  accIn: '156000',
  accOut: '0',
  balance: '2739711',
  remark1: '할매솥뚜껑삼겹살고강점',
  remark2: '신한',
  remark3: '폰뱅킹',
  remark4: '',
  memo: '',
  trserial: 8,
  regDT: '20260929151151',
  ...over,
})

describe('normalizeTransaction — 팝빌 응답 한 행을 bank_transactions 저장 모양으로', () => {
  it('★ 입금(accIn>0): 방향 in, 금액은 accIn, 은행이 NH농협(0011)이면 remark1 을 입금자 원문으로 둔다', () => {
    const r = normalizeTransaction(row(), { accountRef: '026092816000000002', bankCode: '0011' })
    expect(r).toEqual({
      providerTid: '02609281600000000220260929000008',
      accountRef: '026092816000000002',
      trdt: '2026-09-29T15:01:57+09:00',
      direction: 'in',
      amount: 156000,
      balance: 2739711,
      depositorRaw: '할매솥뚜껑삼겹살고강점',
      raw: row(),
    })
  })

  it('출금(accOut>0, accIn=0): 방향 out, 금액은 accOut, 입금자 원문은 두지 않는다(입금이 아니므로)', () => {
    const r = normalizeTransaction(row({ accIn: '0', accOut: '4400', remark1: '수수료' }), { accountRef: 'a', bankCode: '0011' })
    expect(r).toMatchObject({ direction: 'out', amount: 4400, depositorRaw: null })
  })

  it('농협(0011) 이외의 은행은 remark 의미를 모르므로 입금자 원문을 비워 둔다(문서: 은행마다 다르다) — 확인 전까지 UNMATCHED 로만 두기 위해', () => {
    const r = normalizeTransaction(row({ }), { accountRef: 'a', bankCode: '0004' })
    expect(r.depositorRaw).toBeNull()
  })

  it('입금액이 비거나 0 이면 입금자 원문이 있어도 비워 둔다(정정·취소 등 내부 조정 거래로 보고 매칭 후보에서 뺀다)', () => {
    const r = normalizeTransaction(row({ accIn: '0', accOut: '0' }), { accountRef: 'a', bankCode: '0011' })
    expect(r).toMatchObject({ direction: 'out', amount: 0, depositorRaw: null })
  })

  it('trdt(yyyyMMddHHmmss, KST) 를 KST 오프셋이 있는 ISO 문자열로 바꾼다', () => {
    expect(normalizeTransaction(row({ trdt: '20260101000000' }), { accountRef: 'a', bankCode: '0011' }).trdt)
      .toBe('2026-01-01T00:00:00+09:00')
  })

  it('원문(raw)에는 응답 행 전체를 그대로 남긴다 — 나중에 필드를 더 쓰게 될 때를 대비', () => {
    const custom = row({ memo: '메모테스트' })
    expect(normalizeTransaction(custom, { accountRef: 'a', bankCode: '0011' }).raw).toEqual(custom)
  })
})
