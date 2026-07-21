export function fmtWon(n: number) {
  return `${Number(n ?? 0).toLocaleString('ko-KR')}원`
}

export function fmtDateTime(iso?: string | null) {
  if (!iso) return '-'
  return new Date(iso).toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function getKstToday() {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
}
