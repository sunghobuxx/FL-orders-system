export const runtime = 'edge'

import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentDispatchGroups, buildDispatchLines } from '@/lib/dispatch/current-items'
import AdminOrderShell from '../../AdminOrderShell'

interface Props {
  params: Promise<{ date: string }>
}

function fmtQty(qty: number) {
  return qty % 1 === 0 ? String(qty) : qty.toFixed(1)
}

function shortName(name: string) {
  const parts = name.trim().split(' ')
  return parts.length > 1 ? parts[parts.length - 1] : name
}

/**
 * 가락시장에서 직접 사다 납품하는 서울 식당 전용 — 품목별 발주문자 대신
 * 그날 들어온 주문을 전부 모아 보여준다. 공급처 개념이 없어 발주문자는 안 나간다.
 * (2026-10 가락시장 매입 시작)
 */
export default async function GarakBuylistDatePage({ params }: Props) {
  const { date: targetDate } = await params
  const adminDb = createAdminClient()

  const { garakItems } = await getCurrentDispatchGroups(adminDb, targetDate)
  const lines = buildDispatchLines(garakItems).sort((a, b) => a.name.localeCompare(b.name, 'ko'))

  return (
    <AdminOrderShell date={targetDate}>
      <div className="space-y-5 max-w-3xl">
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-700">
          서울 식당(주소 기준) 주문을 모은 목록입니다. 공급처 발주문자는 가지 않습니다 — 가락시장에서 직접 사서 납품하세요.
        </div>

        {lines.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 py-14 text-center text-sm text-gray-400">
            {targetDate} 서울 식당 주문이 없습니다
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-3 bg-gray-50 border-b border-gray-200">
              <h2 className="text-sm font-semibold text-gray-700">가락 살 것 목록 — {targetDate}</h2>
            </div>
            <div className="divide-y divide-gray-100">
              {lines.map(line => (
                <div key={`${line.name}-${line.unit}`} className="px-5 py-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-800">{line.name}</span>
                    <span className="text-sm font-semibold text-amber-700 bg-amber-100 px-3 py-1 rounded-md min-w-[72px] text-center">
                      {fmtQty(line.qty)} {line.unit}
                    </span>
                  </div>
                  {line.byRestaurant.length > 1 && (
                    <p className="text-xs text-gray-400 mt-1">
                      {line.byRestaurant.map(r => `${shortName(r.name)} ${fmtQty(r.qty)}${line.unit}`).join('  ')}
                    </p>
                  )}
                </div>
              ))}
            </div>
            <div className="px-5 py-2 bg-gray-50 border-t border-gray-200 text-xs text-gray-400">
              총 {lines.length}종 품목
            </div>
          </div>
        )}
      </div>
    </AdminOrderShell>
  )
}
