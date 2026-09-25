import { priceStatusText, type ShownPriceStatus } from '@/lib/pricing/price-status'

const TONE = {
  pending: 'bg-amber-50 border-amber-300 text-amber-800',
  modified: 'bg-orange-50 border-orange-300 text-orange-800',
  confirmed: 'bg-green-50 border-green-300 text-green-800',
  final: 'bg-gray-50 border-gray-200 text-gray-600',
} as const

/** 명세서의 단가가 확정인지, 바뀔 수 있는지 알려주는 배지 */
export default function PriceStatusBadge({ status }: { status: ShownPriceStatus }) {
  return (
    <div className={`rounded-lg border px-3 py-2 text-xs font-semibold ${TONE[status.status]}`}>
      {priceStatusText(status)}
    </div>
  )
}
