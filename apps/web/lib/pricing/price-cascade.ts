import { normalizeUnit } from '@/lib/units'

/**
 * 단가를 새로 등록하면 그 이후 날짜의 발주·명세서 단가를 따라 고친다.
 * 이때 **어느 줄까지 고칠지** 를 정하는 규칙이다.
 *
 * 예전에는 품목만 보고 전부 고쳤다. 그래서 2026-09-07 에 양파 **bag** 24,000 을
 * 등록하자 그날 양파 **kg** 발주까지 24,000 이 붙었다 — 일산킨텍스 15kg 이
 * 360,000 원으로 나갔다(정상 45,000). 같은 날 청양고추 box 4,000 을 등록했을 땐
 * 반대로 kg 줄 5건이 6,000 에서 4,000 으로 내려가 덜 청구됐다.
 *
 * 단위가 다른 단가는 그 단위의 가격이 아니다. 단위가 둘 이상인 품목은
 * 등록한 단위의 줄만 고친다 — 명세서 생성(`buildPriceMapByProduct`) 과 같은 규칙이다.
 */
export function isMultiUnitProduct(
  defaultUnit: string | null | undefined,
  allowedUnits: string[] | null | undefined,
): boolean {
  const units = new Set(
    [defaultUnit, ...(allowedUnits ?? [])]
      .map(u => normalizeUnit(u))
      .filter((u): u is string => Boolean(u)),
  )
  return units.size > 1
}

/**
 * 단위가 하나뿐인 품목은 종전대로 전부 고친다.
 * 거기까지 단위로 가리면 표기가 어긋났을 때 옛 단가에 멈춘다 — 미나리가
 * 품목은 'box' 인데 단가는 '박스' 로 등록돼 8/19 명세서가 22,000 으로 나갔던 사고다.
 */
export function rowsToReprice<T extends { id: string; unit: string | null }>(
  rows: T[],
  registeredUnit: string,
  multiUnit: boolean,
): string[] {
  if (!multiUnit) return rows.map(r => r.id)
  const want = normalizeUnit(registeredUnit)
  return rows.filter(r => r.unit != null && normalizeUnit(r.unit) === want).map(r => r.id)
}
