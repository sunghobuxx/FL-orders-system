/**
 * 세금계산서(2단계) 발행 준비. 실제 호출은 lib/popbill/taxinvoice.ts, 여기서는 관리번호 생성과
 * 팝빌이 요구하는 모양으로 바꾸는 것만 한다(둘 다 순수 함수 — DB·네트워크를 안 건드린다).
 */

/**
 * 관리번호(invoicerMgtKey, 24자 영문·숫자·-·_). 업체·정산기간이 같으면 항상 같은 키를 낸다 —
 * 재시도(네트워크 오류 후 다시 부름)해도 같은 문서로 취급돼 이중 발행이 나지 않는다.
 * tax_invoices.mgt_key unique 와 (restaurant_id, settlement_period_id) unique 가 실제 차단은 하지만,
 * 키 자체가 결정적이어야 그 unique 제약이 "같은 문서의 재시도"와 "다른 문서"를 구별할 수 있다.
 */
export async function generateMgtKey(restaurantId: string, settlementPeriodId: string): Promise<string> {
  const data = new TextEncoder().encode(`${restaurantId}:${settlementPeriodId}`)
  const hash = await crypto.subtle.digest('SHA-256', data)
  const hex = [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('')
  return hex.slice(0, 24)
}

export interface InvoicerInfo {
  corpNum: string
  corpName: string
  ceoName: string
  addr?: string
  tel?: string
}

export interface InvoiceeInfo {
  corpNum: string
  corpName: string
  /** 대표자성명(회원 수정 화면의 "대표자" = contacts.name, is_primary). 법정 필수 항목인데
   * 61곳 중 2곳은 아직 안 채워져 있다(2026-09-29) — 없으면 빈 문자열로 보내고,
   * 실제로 필수인지는 팝빌 응답으로 확인한다. */
  ceoName?: string
}

export interface BuildTaxinvoiceInput {
  mgtKey: string
  /** yyyyMMdd */
  writeDate: string
  invoicer: InvoicerInfo
  invoicee: InvoiceeInfo
  /** 공급가액 합계(원 단위) */
  supplyCostTotal: number
  /** 세액 합계(원 단위). 0 이면 면세로 분류한다 */
  taxTotal: number
}

function assertAmount(n: number, label: string) {
  if (!Number.isFinite(n) || n < 0) throw new Error(`${label} 는 0 이상의 유한한 수여야 합니다`)
}

/** 팝빌 RegistIssue 요청 본문. 이 단계(2단계 1차)는 품목 상세(detailList) 없이 기간 합계만 발행한다. */
export function buildTaxinvoicePayload(input: BuildTaxinvoiceInput): Record<string, unknown> {
  assertAmount(input.supplyCostTotal, 'supplyCostTotal')
  assertAmount(input.taxTotal, 'taxTotal')
  const supplyCostTotal = Math.round(input.supplyCostTotal)
  const taxTotal = Math.round(input.taxTotal)

  return {
    invoicerMgtKey: input.mgtKey,
    writeDate: input.writeDate,
    issueType: '정발행',
    // 세액 합계가 0 이면 면세로 본다 — 과세·면세 품목이 섞인 정산기간은 이 단계(합계 발행)에서
    // 세액 합계로만 가른다. 품목별 detailList 로 나누는 건 다음 단계.
    taxType: taxTotal > 0 ? '과세' : '면세',
    chargeDirection: '정과금',
    purposeType: '청구',
    supplyCostTotal: String(supplyCostTotal),
    taxTotal: String(taxTotal),
    totalAmount: String(supplyCostTotal + taxTotal),
    invoicerCorpNum: input.invoicer.corpNum,
    invoicerCorpName: input.invoicer.corpName,
    invoicerCEOName: input.invoicer.ceoName,
    invoicerAddr: input.invoicer.addr ?? '',
    invoicerTEL: input.invoicer.tel ?? '',
    invoiceeCorpNum: input.invoicee.corpNum,
    invoiceeCorpName: input.invoicee.corpName,
    invoiceeCEOName: input.invoicee.ceoName ?? '',
  }
}
