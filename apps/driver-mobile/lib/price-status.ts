/** Server decides status and date eligibility; the driver app never hides old pending dates. */
export type SpecPriceStatus = {
  status: 'pending' | 'confirmed' | 'modified' | 'final'
  at: string | null
}

function kstClock(iso: string | null): string | null {
  if (!iso) return null
  const time = new Date(iso).getTime()
  if (!Number.isFinite(time)) return null
  return new Date(time + 9 * 60 * 60 * 1000).toISOString().slice(11, 16)
}

export function priceStatusText(value?: SpecPriceStatus | null): string | null {
  if (!value) return null
  const time = kstClock(value.at)
  switch (value.status) {
    case 'pending': return '단가 입력 중 · 금액이 바뀔 수 있습니다 (이전 단가 기준)'
    case 'confirmed': return `✓ 당일 단가 확정${time ? ` (${time})` : ''}`
    case 'modified': return `단가 수정됨 · 금액이 바뀔 수 있습니다${time ? ` (${time} 수정)` : ''}`
    case 'final': return '정산 확정'
    default: return null
  }
}

export function priceStatusPrintText(value?: SpecPriceStatus | null): string | null {
  return value?.status === 'final' ? null : priceStatusText(value)
}

export const PRICE_STATUS_COLORS = {
  pending: { backgroundColor: '#FEF3C7', color: '#92400E' },
  modified: { backgroundColor: '#FFEDD5', color: '#9A3412' },
  confirmed: { backgroundColor: '#DCFCE7', color: '#166534' },
  final: { backgroundColor: '#F3F4F6', color: '#6B7280' },
} as const
