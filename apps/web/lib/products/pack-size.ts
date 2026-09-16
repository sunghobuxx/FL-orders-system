import { normalizeUnit } from '@/lib/units'

/**
 * 포장 규격 — kg 로 시킨 수량을 포장 단위로 되돌리기 위한 값.
 * 양파는 1포(bag)가 15kg, 청양고추는 1박스(box)가 10kg 이다.
 */
export type PackSpec = {
  pack_unit: string | null
  kg_per_pack: number | null
  /** 품목별로 변환을 잠시 끌 때 쓰려고 부르는 쪽이 함께 넘긴다. 지금은 끈 품목이 없다. */
  standard_name?: string | null
}

/**
 * kg 수량이 규격의 **정확한 배수일 때만** 포장 단위로 바꾼다.
 *
 * 일산킨텍스가 2026-09-07 에 양파 1포를 "15kg" 으로 발주했다. 시스템은 그것을
 * "24,000원짜리 15개" 로 읽어 360,000원을 청구했다. 규격을 알면 1포로 되돌릴 수 있다.
 *
 * 배수가 아니면 손대지 않는다. 3kg·8kg 은 정말 낱개로 시킨 것이고,
 * 20kg 을 "1포 + 5kg" 로 쪼개면 명세서만 복잡해진다.
 *
 * @returns 바꿀 값, 또는 바꿀 것이 없으면 null
 */
export function toPackQty(
  qty: number,
  unit: string | null | undefined,
  spec: PackSpec | null | undefined,
): { qty: number; unit: string } | null {
  const packUnit = spec?.pack_unit
  const perPack = Number(spec?.kg_per_pack ?? 0)
  if (!packUnit || !(perPack > 0)) return null
  if (normalizeUnit(packUnit) === 'kg') return null
  if (normalizeUnit(unit) !== 'kg') return null
  if (!Number.isFinite(qty) || qty <= 0) return null

  const packs = qty / perPack
  const rounded = Math.round(packs)
  if (rounded < 1 || Math.abs(packs - rounded) > 1e-9) return null
  return { qty: rounded, unit: packUnit }
}
