import type { JsonValue } from '@lupinum/ginko-cms-contract/shared/types.js'
import { isEqualJsonValue } from '@lupinum/ginko-cms-contract/shared/utils.js'

import type { StudioEntry } from './types'

function cloneJson(value: JsonValue): JsonValue {
  if (Array.isArray(value)) return value.map(cloneJson)
  if (value && typeof value === 'object')
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, cloneJson(item)]))
  return value
}

/** Only fields this locale form can write participate in its conflict fence. */
export function readEntryDraftBase(entry: StudioEntry) {
  return {
    metadata: {
      slug: entry.slug,
      parentEntryId: entry.parentEntryId ?? '',
      nodeKind: entry.nodeKind ?? 'page',
      shared: cloneJson(entry.draft ?? {}),
      values: cloneJson(entry.localeData?.draft.values ?? {}),
    },
    body: entry.localeData?.draft.bodyMdc ?? '',
  }
}

export function canRebaseEntryBody(
  base: ReturnType<typeof readEntryDraftBase>,
  next: StudioEntry,
  localBody: string | undefined,
) {
  return (
    (localBody === undefined || localBody === base.body) &&
    isEqualJsonValue(base.metadata, readEntryDraftBase(next).metadata)
  )
}
