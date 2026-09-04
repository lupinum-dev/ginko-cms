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
    // Text-like types are always indexed; `searchable: true` opts other types
    // in. `searchable: false` cannot mean opt-out here: both contract
    // normalizers (ginko-content resolved contracts and shared
    // `normalizeField`) store `searchable ?? false`, so every field the
    // author never touched arrives as a concrete `false`. Treating that as
    // opt-out silently dropped titles/descriptions from every search index.
    const isSearchable = field.searchable === true || SEARCHABLE_TYPES.has(field.type)
    if (!isSearchable) continue
    parts.push(...extractTextFragments(args.values?.[field.key]).map(stripMarkdown))
  }

  const text = parts.join(' ').replace(/\s+/g, ' ').trim().slice(0, 10_000)

  return text || null
}
