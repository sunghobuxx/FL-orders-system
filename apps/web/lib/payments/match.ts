/**
 * 입금 자동매칭 판정 — 추천만 한다. 실제 수금 반영은 record_receivable_payment 가 따로 한다.
 *
 * 자동확정(AUTO_MATCH)은 **잘못되면 남의 미수금이 갚아지므로** 업체를 고르는 데는 엄격하다.
 *  1) 사장님이 등록한 별칭이 정확히 한 업체를 가리키고(입금자명이 다른 업체 이름과 겹치지도 않고)
 *  2) 그 업체에 미수금이 있고, 입금액이 미수금 합계 **이하**일 때
 * 부분입금(합계보다 작음)도 자동확정한다 — 오래된 미수금부터 채우고 모자란 금액은 미수금으로 그대로 남는다
 * (사장님 결정 2026-09-26). 초과입금은 붙일 곳이 없어 REVIEW. 같은 별칭이 두 업체에 걸리거나 업체명만
 * 같은 경우도 사람이 본다. 유사도 점수는 쓰지 않는다.
 */

export const MATCH_RULE_VERSION = 'v1'

export type Verdict = 'AUTO_MATCH' | 'REVIEW' | 'UNMATCHED'

export interface OpenReceivable {
  id: string
  restaurantId: string
  balance: number
  /** YYYY-MM-DD. 판정에는 쓰지 않는다(채우는 순서는 DB 함수가 정한다). 화면 표시용 */
  dueDate: string
  createdAt: string
}

export interface MatchInput {
  direction: 'in' | 'out'
  amount: number
  /** normalizeDepositor 를 거친 입금자명 */
  depositorNorm: string
  aliases: Array<{ restaurantId: string; aliasNorm: string }>
  /** 업체명(정규화). 별칭이 없을 때 후보를 제안하는 데만 쓰고, 이것만으로는 자동확정하지 않는다 */
  restaurantNames: Array<{ restaurantId: string; nameNorm: string }>
  /** 미납(unpaid/partial/overdue) 미수금. 여러 업체가 섞여 있어도 된다 */
  receivables: OpenReceivable[]
}

export interface MatchDecision {
  verdict: Verdict
  restaurantId: string | null
  candidates: Array<{ restaurantId: string; reason: 'alias' | 'name' }>
  reasons: string[]
  ruleVersion: string
}

const decision = (
  verdict: Verdict,
  restaurantId: string | null,
  reasons: string[],
  candidates: MatchDecision['candidates'] = [],
): MatchDecision => ({ verdict, restaurantId, candidates, reasons, ruleVersion: MATCH_RULE_VERSION })

export function decideMatch(input: MatchInput): MatchDecision {
  const { direction, amount, depositorNorm } = input

  if (direction !== 'in' || !Number.isFinite(amount) || amount <= 0) return decision('UNMATCHED', null, ['not_inbound'])
  if (!depositorNorm) return decision('UNMATCHED', null, ['no_depositor'])

  const aliasIds = [...new Set(input.aliases.filter(a => a.aliasNorm === depositorNorm).map(a => a.restaurantId))]
  const nameIds = [...new Set(
    input.restaurantNames.filter(n => n.nameNorm === depositorNorm && !aliasIds.includes(n.restaurantId)).map(n => n.restaurantId),
  )]
  const candidates: MatchDecision['candidates'] = [
    ...aliasIds.map(restaurantId => ({ restaurantId, reason: 'alias' as const })),
    ...nameIds.map(restaurantId => ({ restaurantId, reason: 'name' as const })),
  ]

  if (aliasIds.length === 0) {
    if (nameIds.length === 0) return decision('UNMATCHED', null, ['no_candidate'])
    return decision('REVIEW', nameIds.length === 1 ? nameIds[0] : null, ['name_only_no_alias'], candidates)
  }
  if (aliasIds.length > 1) return decision('REVIEW', null, ['ambiguous_alias'], candidates)
  if (nameIds.length > 0) return decision('REVIEW', aliasIds[0], ['alias_name_conflict'], candidates)

  const restaurantId = aliasIds[0]
  const open = input.receivables.filter(r => r.restaurantId === restaurantId)
  if (open.length === 0) return decision('REVIEW', restaurantId, ['no_receivable'], candidates)

  const total = open.reduce((sum, r) => sum + r.balance, 0)
  if (amount > total) return decision('REVIEW', restaurantId, ['overpay'], candidates)
  if (amount === total) return decision('AUTO_MATCH', restaurantId, ['alias_unique', 'exact_total'], candidates)
  return decision('AUTO_MATCH', restaurantId, ['alias_unique', 'partial'], candidates)
}
