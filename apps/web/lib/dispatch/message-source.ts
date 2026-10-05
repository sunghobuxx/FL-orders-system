/**
 * 발주 문자 본문을 어디서 만들지 정한다.
 * - 확정된 줄(제외 안 된 줄)이 있으면 그걸로 보낸다.
 * - 줄이 있었는데 전부 제외됐으면 아무것도 보내지 않는다 — 원래 발주로 되돌리면 뺀 품목이 다시 나간다.
 * - 확정 줄 자체가 없을 때만 발주 원본으로 되돌린다.
 */
export function pickMessageSource(args: { confirmedLineCount: number; snapshotRowCount: number }): 'confirmed' | 'none' | 'order' {
  if (args.confirmedLineCount > 0) return 'confirmed'
  if (args.snapshotRowCount > 0) return 'none'
  return 'order'
}
