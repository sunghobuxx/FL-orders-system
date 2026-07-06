export function getKstToday(): string {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().split('T')[0]
}

export function getKstDateOffset(days: number): string {
  return new Date(Date.now() + 9 * 60 * 60 * 1000 + days * 24 * 60 * 60 * 1000)
    .toISOString()
    .split('T')[0]
}
