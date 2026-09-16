export type PackSpec = {
  pack_unit: string | null
  kg_per_pack: number | null
  standard_name?: string | null
}

const UNIT_ALIASES: Record<string, string> = {
  개: 'ea', 통: 'ea', 단: 'ea', 망: 'ea', 박스: 'box', 상자: 'box', 킬로: 'kg', 키로: 'kg', 그램: 'g',
  팩: 'pack', 판: 'pack', 포: 'bag', 봉: 'bag', 봉지: 'bag', 병: 'bottle',
}

const UNIT_LABELS: Record<string, string> = {
  ea: '개', box: '박스', kg: 'kg', g: 'g', pack: '팩', bag: '포', bottle: '병',
}

// 박스 단가 확인 전까지 청양고추류 자동 변환은 운영에서 보류한다.
const SUSPENDED_PRODUCTS = new Set(['청양고추', '청양고추B'])

export function normalizeUnit(unit: string | null | undefined) {
  const value = String(unit ?? '').trim().toLowerCase()
  return UNIT_ALIASES[value] ?? value
}

export function unitLabel(unit: string | null | undefined) {
  const normalized = normalizeUnit(unit)
  return UNIT_LABELS[normalized] ?? String(unit ?? '')
}

export function toPackQty(
  qty: number,
  unit: string | null | undefined,
  spec: PackSpec | null | undefined,
): { qty: number; unit: string } | null {
  if (spec?.standard_name && SUSPENDED_PRODUCTS.has(spec.standard_name)) return null
  const packUnit = spec?.pack_unit
  const perPack = Number(spec?.kg_per_pack ?? 0)
  if (!packUnit || !(perPack > 0)) return null
  if (normalizeUnit(packUnit) === 'kg' || normalizeUnit(unit) !== 'kg') return null
  if (!Number.isFinite(qty) || qty <= 0) return null

  const packs = qty / perPack
  const rounded = Math.round(packs)
  if (rounded < 1 || Math.abs(packs - rounded) > 1e-9) return null
  return { qty: rounded, unit: packUnit }
}
