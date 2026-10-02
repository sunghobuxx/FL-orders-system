export const runtime = 'edge'

import { redirect } from 'next/navigation'
import { getKstToday, getKstDateOffset } from '@/lib/date-kst'

/**
 * 당일배송이라 18시가 지나면 오늘 몫 배송은 사실상 끝난 것으로 보고, 기본 날짜를 내일로 넘긴다
 * (품목별 발주 페이지와 같은 정책 — /admin/orders/dispatch/page.tsx 참고).
 */
export default function GarakBuylistIndexPage() {
  const kstHour = new Date(Date.now() + 9 * 60 * 60 * 1000).getUTCHours()
  const defaultDate = kstHour >= 18 ? getKstDateOffset(1) : getKstToday()
  redirect(`/admin/orders/garak-buylist/${defaultDate}`)
}
