export const runtime = 'edge'

import { redirect } from 'next/navigation'
import { getKstToday, getKstDateOffset } from '@/lib/date-kst'

/**
 * 당일배송이라 18시가 지나면 오늘 몫 배송은 사실상 끝난 것으로 보고, 기본 날짜를 내일로 넘긴다
 * (사장님 요청, 2026-09-30) — 대시보드 발주내역(농산물) 위젯과 같은 정책. 자정까지 기다리지 않는다.
 */
export default function DispatchIndexPage() {
  const kstHour = new Date(Date.now() + 9 * 60 * 60 * 1000).getUTCHours()
  const defaultDate = kstHour >= 18 ? getKstDateOffset(1) : getKstToday()
  redirect(`/admin/orders/dispatch/${defaultDate}`)
}
