// 단위는 **코드 하나에 이름 하나**다.
//
// 예전에는 드롭다운이 'box' 와 '박스' 를 나란히 내줬다. 같은 박스인데 등록할 때마다
// 다른 값으로 들어가고, 단가를 단위로 찾을 때 갈라져 옛 값에 멈춘다. 미나리가
// 그래서 8/19 명세서에 36,000 대신 22,000 으로 나갔다 (2026-08-19).
// 화면에는 한글을 보여주되, 저장되는 값은 항상 영문 코드다.
export const UNIT_OPTIONS = [
  { value: 'ea', label: '개 (단·통·묶음)' },
  { value: 'box', label: '박스' },
  { value: 'kg', label: 'kg' },
  { value: 'g', label: 'g' },
  { value: 'pack', label: '팩 (판)' },
  { value: 'bag', label: '포 (봉지)' },
  { value: 'bottle', label: '병' },
] as const

export const UNITS = UNIT_OPTIONS.map(u => u.value)

export function unitLabel(unit: string) {
  return UNIT_OPTIONS.find(u => u.value === unit)?.label ?? unit
}

// 과거 발주(order_items)에는 '박스', '포', '망' 같은 한글 단위가 그대로 남아 있다.
// 이력이라 고치지 않는 대신, 단가를 찾을 때 여기서 코드로 맞춰 준다.
const ALIASES: Record<string, string> = {
  '박스': 'box', '통': 'ea', '단': 'ea', '개': 'ea', '망': 'ea',
  '판': 'pack', '팩': 'pack', '포': 'bag', '봉지': 'bag', '병': 'bottle',
}

export function normalizeUnit(unit: string | null | undefined) {
  if (!unit) return unit ?? null
  return ALIASES[unit] ?? unit
}
