import { fetchAll } from '@/lib/supabase/fetch-all'
import { normalizeDepositor } from './depositor'
import { recommendMatches } from './recommend'
import type { OpenReceivable } from './match'
import { applyMatch } from './apply-match'

/**
 * 계좌조회 수집(30분 크론) 뒤에 도는 자동매칭 배치. 판정(decideMatch)은 항상 `payment_matches` 에 기록해
 * 나중에 검토할 수 있게 남기고, `mode==='live'` 일 때만 AUTO_MATCH 건을 실제로 반영한다.
 *
 *   off    : 아무것도 안 한다(기본값, DB 조회조차 안 함) — 지금까지처럼 화면에서 사람이 확정.
 *   shadow : 판정만 기록한다. 실제 반영 없음 — "지금 켰다면 뭘 자동확정했을지" 를 며칠 지켜보는 단계.
 *   live   : AUTO_MATCH 건을 `applyMatch` 로 실제 반영한다(record_receivable_payment 호출, 별칭 자동 등록).
 *
 * REVIEW/UNMATCHED 는 어느 모드에서도 반영하지 않는다 — 화면에서 사람이 본다.
 * 반영에 실패한 건(예: 그 사이 다른 곳에서 미수금이 바뀜)은 errors 에 남기고 나머지는 계속 진행한다.
 */

export type AutoMatchMode = 'off' | 'shadow' | 'live'

export function parseAutoMatchMode(raw: string | undefined): AutoMatchMode {
  return raw === 'shadow' || raw === 'live' ? raw : 'off'
}

export interface AutoMatchSummary {
  mode: AutoMatchMode
  evaluated: number
  autoMatched: number
  applied: number
  errors: Array<{ bankTransactionId: string; reason: string }>
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function runAutoMatch(db: any, mode: AutoMatchMode): Promise<AutoMatchSummary> {
  const summary: AutoMatchSummary = { mode, evaluated: 0, autoMatched: 0, applied: 0, errors: [] }
  if (mode === 'off') return summary

  const txRows = await fetchAll(() => db
    .from('bank_transactions')
    .select('id, amount, depositor_raw, depositor_norm')
    .eq('direction', 'in')
    .is('posted_at', null))
  if (txRows.length === 0) return summary

  // 업체·별칭·미수금 조회는 「입금 확인」 화면(app/admin/finance/bank-transactions/page.tsx)과 같은 모양이다 —
  // 둘이 다른 후보 집합을 보면 화면 추천과 배치 판정이 어긋난다.
  const restaurantRows = await fetchAll(() => db
    .from('restaurants')
    .select('id, organizations(name, organization_type, status)')
    .eq('organizations.organization_type', 'restaurant'))
  type RestRow = { id: string; organizations: { name: string; organization_type: string; status: string } | null }
  const restaurants = (restaurantRows as unknown as RestRow[])
    .filter(r => r.organizations?.organization_type === 'restaurant' && r.organizations?.status === 'active')
  const restaurantNames = restaurants.map(r => ({ restaurantId: r.id, nameNorm: normalizeDepositor(r.organizations?.name ?? '') }))

  const aliasRows = await fetchAll(() => db.from('depositor_aliases').select('restaurant_id, alias_norm'))
  const aliases = aliasRows.map((a: { restaurant_id: string; alias_norm: string }) => ({ restaurantId: a.restaurant_id, aliasNorm: a.alias_norm }))

  const receivableRows = await fetchAll(() => db
    .from('receivables')
    .select('id, restaurant_id, balance, due_date, created_at')
    .in('status', ['unpaid', 'partial', 'overdue']))
  const receivables: OpenReceivable[] = receivableRows.map((r: { id: string; restaurant_id: string; balance: number; due_date: string; created_at: string }) => ({
    id: r.id, restaurantId: r.restaurant_id, balance: Number(r.balance), dueDate: r.due_date, createdAt: r.created_at,
  }))

  const decisions = recommendMatches(
    txRows.map((t: { id: string; amount: number; depositor_raw: string | null; depositor_norm: string | null }) => ({
      id: t.id, amount: Number(t.amount), depositorRaw: t.depositor_raw, depositorNorm: t.depositor_norm,
    })),
    aliases, restaurantNames, receivables,
  )

  for (const tx of txRows as Array<{ id: string }>) {
    const decision = decisions.get(tx.id)!
    summary.evaluated++

    // bank_transaction_id 가 unique 라 매 실행마다 최신 판정으로 덮어쓴다(별칭이 새로 등록되면 판정이 바뀔 수 있다).
    await db.from('payment_matches').upsert({
      bank_transaction_id: tx.id,
      verdict: decision.verdict,
      restaurant_id: decision.restaurantId,
      candidates: decision.candidates,
      reasons: decision.reasons,
      rule_version: decision.ruleVersion,
      decided_at: new Date().toISOString(),
    }, { onConflict: 'bank_transaction_id' })

    if (decision.verdict === 'AUTO_MATCH' && decision.restaurantId) {
      summary.autoMatched++
      if (mode === 'live') {
        const result = await applyMatch(db, { bankTransactionId: tx.id, restaurantId: decision.restaurantId, createdBy: null })
        if (result.ok) {
          if (!result.alreadyPosted) summary.applied++
        } else {
          console.error('[auto-match] 자동확정 실패', tx.id, result.reason)
          summary.errors.push({ bankTransactionId: tx.id, reason: result.reason })
        }
      }
    }
  }

  return summary
}
