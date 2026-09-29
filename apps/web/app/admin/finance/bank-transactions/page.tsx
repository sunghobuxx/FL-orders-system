export const runtime = 'edge'

import { createAdminClient } from '@/lib/supabase/admin'
import { fetchAll } from '@/lib/supabase/fetch-all'
import AdminSettlementShell from '@/app/admin/settlement/AdminSettlementShell'
import { normalizeDepositor } from '@/lib/payments/depositor'
import { recommendMatches } from '@/lib/payments/recommend'
import type { OpenReceivable } from '@/lib/payments/match'
import ConfirmBankTransactionButton from './ConfirmBankTransactionButton'
import FinanceTabs from '../FinanceTabs'

/**
 * 「입금 확인」 화면. 아직 반영되지 않은 은행 입금을 보여주고, 추천 업체를 계산해 [확정] 으로 반영한다.
 * 판정 로직은 lib/payments/{match,recommend}.ts — 여기서는 DB 조회와 표시만 한다.
 */
export default async function BankTransactionsPage() {
  const db = createAdminClient()

  const { data: txRows } = await db
    .from('bank_transactions')
    .select('id, trdt, amount, depositor_raw, depositor_norm, account_ref')
    .eq('direction', 'in')
    .is('posted_at', null)
    .order('trdt', { ascending: false })
    .limit(100)
  const txs = txRows ?? []

  const { data: restaurantRows } = await db
    .from('restaurants')
    .select('id, organizations(name, organization_type, status)')
    .eq('organizations.organization_type', 'restaurant')
  type RestRow = { id: string; organizations: { name: string; organization_type: string; status: string } | null }
  const restaurants = ((restaurantRows ?? []) as unknown as RestRow[])
    .filter(r => r.organizations?.organization_type === 'restaurant' && r.organizations?.status === 'active')
  const nameOf = new Map(restaurants.map(r => [r.id, r.organizations?.name ?? '알 수 없음']))
  const restaurantNames = restaurants.map(r => ({ restaurantId: r.id, nameNorm: normalizeDepositor(r.organizations?.name ?? '') }))

  const { data: aliasRows } = await db.from('depositor_aliases').select('restaurant_id, alias_norm')
  const aliases = (aliasRows ?? []).map(a => ({ restaurantId: a.restaurant_id as string, aliasNorm: a.alias_norm as string }))

  // 미수금 전건. 후보를 좁히지 않고 다 읽는다 — 1000행 제한에 걸리면 후보가 빠질 수 있다.
  const receivableRows = await fetchAll(() => db
    .from('receivables')
    .select('id, restaurant_id, balance, due_date, created_at')
    .in('status', ['unpaid', 'partial', 'overdue']))
  const receivables: OpenReceivable[] = (receivableRows ?? []).map(r => ({
    id: r.id, restaurantId: r.restaurant_id, balance: Number(r.balance), dueDate: r.due_date, createdAt: r.created_at,
  }))
  // 업체별 미수금 합계. 확정 화면에서 "이 업체는 지금 미수금이 이만큼" 을 바로 보여줘서,
  // 이미 손으로 입력해 둔 입금과 겹쳐 확정이 막히는 이유를 누르기 전에 알 수 있게 한다(2026-09-29 확인된 혼란).
  const balanceOf = new Map<string, number>()
  for (const r of receivables) balanceOf.set(r.restaurantId, (balanceOf.get(r.restaurantId) ?? 0) + r.balance)

  const decisions = recommendMatches(
    txs.map(t => ({ id: t.id, amount: Number(t.amount), depositorRaw: t.depositor_raw, depositorNorm: t.depositor_norm })),
    aliases, restaurantNames, receivables,
  )

  const fmt = (n: number) => `${Math.round(n).toLocaleString()}원`
  const fmtTime = (iso: string) => new Date(iso).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
  const VERDICT_LABEL: Record<string, { label: string; cls: string }> = {
    AUTO_MATCH: { label: '자동 추천', cls: 'bg-green-50 text-green-700' },
    REVIEW: { label: '확인 필요', cls: 'bg-amber-50 text-amber-700' },
    UNMATCHED: { label: '후보 없음', cls: 'bg-gray-100 text-gray-500' },
  }

  return (
    <AdminSettlementShell>
      <div className="space-y-3 max-w-3xl">
        <FinanceTabs />
        <h1 className="text-sm font-semibold text-gray-700">입금 확인 (미확정 {txs.length}건)</h1>
        <p className="text-xs text-gray-400">
          미수금보다 입금액이 많거나 업체에 미수금이 없으면 [확정] 이 막힙니다 — 이미 손으로 입력해 둔 입금일 수 있습니다.
          그럴 땐 [이미 처리됨] 으로 건너뛰세요(미수금에는 아무 영향이 없습니다).
        </p>

        {txs.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 py-14 text-center text-sm text-gray-400">
            확인할 입금이 없습니다
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
            {txs.map(tx => {
              const decision = decisions.get(tx.id)
              const verdict = decision ? VERDICT_LABEL[decision.verdict] : VERDICT_LABEL.UNMATCHED
              const candidateNames = (decision?.candidates ?? []).map(c => nameOf.get(c.restaurantId) ?? c.restaurantId)
              return (
                <div key={tx.id} className="px-5 py-3 flex items-center gap-3 flex-wrap">
                  <span className="text-xs text-gray-400 w-24 shrink-0">{fmtTime(tx.trdt)}</span>
                  <span className="text-sm font-semibold w-28 shrink-0">{fmt(Number(tx.amount))}</span>
                  <span className="text-sm text-gray-700 w-32 shrink-0 truncate" title={tx.depositor_raw ?? ''}>
                    {tx.depositor_raw || '(입금자 없음)'}
                  </span>
                  <span className={`text-xs px-2 py-1 rounded shrink-0 ${verdict.cls}`}>
                    {verdict.label}{candidateNames.length ? `: ${candidateNames.join(', ')}` : ''}
                  </span>
                  <div className="ml-auto">
                    <ConfirmBankTransactionButton
                      bankTransactionId={tx.id}
                      restaurants={restaurants.map(r => ({ id: r.id, name: nameOf.get(r.id) ?? '알 수 없음', balance: balanceOf.get(r.id) ?? 0 }))}
                      recommendedRestaurantId={decision?.verdict === 'AUTO_MATCH' ? decision.restaurantId : null}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </AdminSettlementShell>
  )
}
