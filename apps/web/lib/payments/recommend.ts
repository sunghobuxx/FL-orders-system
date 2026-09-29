import { decideMatch, type MatchDecision, type OpenReceivable } from './match'

/**
 * 「입금 확인」 화면이 보여줄 추천. 아직 반영되지 않은 입금(`bank_transactions.posted_at is null`,
 * `direction='in'`) 여러 건에 판정(decideMatch)을 한 번씩 적용한다. DB 조회는 여기서 하지 않는다
 * — 화면(로더)이 미리 읽어 온 것을 순수 함수로 계산만 한다.
 */

export interface UnpostedTx {
  id: string
  amount: number
  depositorRaw: string | null
  depositorNorm: string | null
}

export function recommendMatches(
  txs: UnpostedTx[],
  aliases: Array<{ restaurantId: string; aliasNorm: string }>,
  restaurantNames: Array<{ restaurantId: string; nameNorm: string }>,
  receivables: OpenReceivable[],
): Map<string, MatchDecision> {
  const out = new Map<string, MatchDecision>()
  for (const tx of txs) {
    out.set(tx.id, decideMatch({
      direction: 'in',
      amount: tx.amount,
      depositorNorm: tx.depositorNorm ?? '',
      aliases,
      restaurantNames,
      receivables,
    }))
  }
  return out
}
