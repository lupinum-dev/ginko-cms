import type { CmsField } from './types.js'
import { extractTextFragments, stripMarkdown } from './utils.js'

/** Text-like field types that are always indexed for search. */
const SEARCHABLE_TYPES = new Set(['text', 'textarea', 'richtext', 'slug', 'email', 'url'])

export function buildSearchText(args: {
  values?: Record<string, unknown>
  fields: CmsField[]
}): string | null {
  const parts: string[] = []

  for (const field of args.fields) {
    const isSearchable = field.searchable ?? SEARCHABLE_TYPES.has(field.type)
    if (!isSearchable) continue
    parts.push(...extractTextFragments(args.values?.[field.key]).map(stripMarkdown))
  }

  const text = parts.join(' ').replace(/\s+/g, ' ').trim().slice(0, 10_000)

  return text || null
}
