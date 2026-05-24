export function compareOrderRank(left?: string | null, right?: string | null): number {
  const a = left ?? ''
  const b = right ?? ''
  if (a === b) return 0
  return a < b ? -1 : 1
}
