export const runtime = 'edge'

import { createAdminClient } from '@/lib/supabase/admin'
import { getKstToday } from '@/lib/date-kst'
import GarakClosedDateForm from './GarakClosedDateForm'

/**
 * 가락시장 휴무일 관리. 등록한 날짜는 서울·일산 식당도 가락이 아니라 남촌(기존) 공급처 발주
 * 문자로 간다 — 가락시장이 쉬는 날 쓰려고 만들었다(2026-10-09).
 */
export default async function GarakClosedDatesPage() {
  const db = createAdminClient()
  const { data: rows } = await db
    .from('garak_closed_dates')
    .select('business_date, note')
    .gte('business_date', getKstToday())
    .order('business_date')
  // 지난 날짜도 기록은 남겨 둔다(그날 발주 내역을 다시 볼 때 참고용) — 목록에는 오늘 이후만 보여준다.

  return (
    <div className="p-6 max-w-lg space-y-5">
      <div>
        <h1 className="text-lg font-bold text-gray-900">가락시장 휴무일</h1>
        <p className="text-sm text-gray-400 mt-0.5">
          등록한 날짜는 서울·일산 식당 물량도 가락이 아니라 남촌(기존) 공급처 발주 문자로 나갑니다.
        </p>
      </div>
      <GarakClosedDateForm
        rows={(rows ?? []) as { business_date: string; note: string | null }[]}
        today={getKstToday()}
      />
    </div>
  )
}
