// Shared field-label derivation. Writers must never see raw schema keys
// (DESIGN.md rule 6): contract labels win, unless they merely echo the key
// (a synced "BodyMdc" label for the bodyMdc column) — echoes re-humanize.

/** bodyMdc -> "Body", publishDate -> "Publish Date", hero_image -> "Hero image". */
export function humanizeFieldKey(key: string): string {
  return key
    .replace(/Mdc$/, '')
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (s) => s.toUpperCase())
    .replace(/[-_]/g, ' ')
    .trim()
}

function normalizeForEchoCheck(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/gi, '')
}

/** Display label for a field: its label, unless that just restates the key. */
export function fieldDisplayLabel(field: { key: string; label?: unknown }): string {
  const label = typeof field.label === 'string' ? field.label.trim() : ''
  if (label) {
    if (normalizeForEchoCheck(label) !== normalizeForEchoCheck(field.key)) return label
    // Keep deliberate acronym labels (URL, SEO) that humanizing would re-case.
    if (label === label.toUpperCase()) return label
  }
  return humanizeFieldKey(field.key)
}

/** Humanized last named segment of a dotted field path (skips array indexes). */
export function humanizeFieldPath(path: string): string {
  const segments = path.split('.').filter((segment) => segment && !/^\d+$/.test(segment))
  const last = segments.at(-1)
  return last ? humanizeFieldKey(last) : path
}
