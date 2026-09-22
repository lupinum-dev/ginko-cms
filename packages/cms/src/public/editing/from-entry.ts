import type { JsonObject, NodeKind } from '@lupinum/ginko-cms-contract/shared/types.js'

import type { DraftSnapshot } from './session.js'

export interface EditableEntry {
  draftVersion: number
  locale: string
  slug: string
  baseSlug?: string | null
  parentEntryId?: string | null
  nodeKind?: NodeKind | null
  draft?: JsonObject
  localeData?: {
    draftId?: string | null
    draftSlug?: string | null
    draft: { values: JsonObject; bodyMdc?: string | null }
  } | null
  locales?: Array<{ locale: string; draftExists?: boolean; draftId?: string | null }>
}

/** Persisted values only: rendered fallbacks and defaults are never write baselines. */
export function entryDraftSnapshot(entry: EditableEntry): DraftSnapshot {
  const exists = entry.locales?.find((item) => item.locale === entry.locale)?.draftExists !== false
  return {
    version: entry.draftVersion,
    localeDraftIds:
      entry.localeData?.draftId && exists ? { [entry.locale]: entry.localeData.draftId } : {},
    patch: {
      shared: {
        shared: entry.draft ?? {},
        slug: entry.baseSlug ?? entry.slug,
        parentEntryId: entry.parentEntryId ?? null,
        nodeKind: entry.nodeKind ?? 'page',
      },
      ...(entry.localeData && exists
        ? {
            locales: {
              [entry.locale]: {
                slug: entry.localeData.draftSlug ?? null,
                values: entry.localeData.draft.values,
                bodyMdc: entry.localeData.draft.bodyMdc ?? '',
              },
            },
          }
        : {}),
    },
  }
}
