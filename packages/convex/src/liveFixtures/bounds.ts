const MAX_PAGE_SIZE = 100

export function boundedPage(start: number, count: number, maximum: number) {
  if (!Number.isSafeInteger(start) || start < 0 || start > maximum) {
    throw new Error('Live fixture page start is invalid.')
  }
  if (!Number.isSafeInteger(count) || count < 1 || count > MAX_PAGE_SIZE) {
    throw new Error(`Live fixture page count must be from 1 through ${MAX_PAGE_SIZE}.`)
  }
  return { start, end: Math.min(maximum, start + count) }
}
