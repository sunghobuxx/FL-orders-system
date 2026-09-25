/**
 * 입금자명 정규화 — 통장에 찍힌 이름과 사장님이 등록한 별칭을 같은 규칙으로 맞춘다.
 *
 * 계좌 소유주 개인 이름으로 입금하는 업체가 많고(2026-09-25 사장님 확인), 같은 사람이 「김 성호」 「김성호」
 * 「KIM SUNGHO」 처럼 다르게 찍힐 수 있다. 공백·기호·법인 표기만 걸러내고, **그 이상은 합치지 않는다** —
 * 비슷한 이름을 같은 사람으로 보면 남의 미수금이 갚아진다.
 */

const CORP_MARKS = /주식회사|\(주\)|\(유\)|유한회사/g
const NOISE = /[\s()[\]{}<>·.,\-_/\\'"`~!@#$%^&*+=|:;?]/g

export function normalizeDepositor(raw: string | null | undefined): string {
  if (!raw) return ''
  // NFKC: 전각 → 반각, ㈜ → (주)
  const base = raw.normalize('NFKC').toLowerCase()
  const withoutCorp = base.replace(CORP_MARKS, '').replace(NOISE, '')
  if (withoutCorp) return withoutCorp
  // 법인 표기뿐인 이름은 그대로 두어 빈 별칭이 생기지 않게 한다.
  return base.replace(NOISE, '')
}
