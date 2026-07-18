export function duplicateTitleCandidate(source: string): string {
  const title = source.trim() || 'Untitled'
  return `${title} copy`
}

export function duplicateSlugCandidate(source: string): string {
  const normalized = source
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return `${normalized || 'entry'}-copy`
}

export function isValidDuplicateSlug(value: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value.trim())
}
