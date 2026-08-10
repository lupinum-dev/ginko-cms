import { computed, type ComputedRef } from 'vue'

import { api } from '../../../boundary/api'
import { useCmsStudioPaginatedQuery } from '../../../composables/useCmsStudioPaginatedQuery'
import type { FieldDefinition } from './useFieldCommon'
import { asFieldContext } from './useFieldCommon'

export type RelatedEntry = {
  _id: string
  stableId: string
  title: string
  slug: string
}

export function useRelationEntries(
  field: ComputedRef<FieldDefinition>,
  locale: ComputedRef<string | undefined>,
  search: ComputedRef<string>,
) {
  const relatedEntriesArgs = computed(() => {
    const relationCollection = field.value.relation?.collection
    if (!relationCollection) return 'skip' as const
    const query = search.value.trim()
    return {
      collection: relationCollection,
      locale: locale.value ?? 'en',
      parentEntryId: null,
      ...(query ? { query } : {}),
    }
  })

  const relatedEntriesQuery = useCmsStudioPaginatedQuery(
    api.ginkoCms.editor.listEntriesForStudio,
    relatedEntriesArgs,
    { initialNumItems: 50, keepPreviousData: true },
  )
  const relatedEntries = computed<RelatedEntry[]>(() =>
    (relatedEntriesQuery.data.value ?? []).flatMap((entry: unknown) => {
      const record = asFieldContext(entry)
      if (
        typeof record._id !== 'string' ||
        typeof record.stableId !== 'string' ||
        record.stableId.length === 0
      ) {
        return []
      }
      return [
        {
          _id: record._id,
          stableId: record.stableId,
          title: typeof record.title === 'string' && record.title ? record.title : record.stableId,
          slug: typeof record.slug === 'string' ? record.slug : '',
        },
      ]
    }),
  )

  const entryByStableId = computed(() => {
    return new Map(relatedEntries.value.map((entry) => [entry.stableId, entry]))
  })

  return {
    relatedEntries,
    entryByStableId,
    hasMoreEntries: relatedEntriesQuery.canLoadMore,
    status: relatedEntriesQuery.status,
  }
}
