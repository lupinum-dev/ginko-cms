import type { Doc } from '../_generated/dataModel.js'
import { throwCmsError } from '../errors.js'
import type { HandlerQueryCtx } from '../lib/types.js'
import type { StudioEntryStatus } from './studioRows.js'

export type StudioSearchPosition = {
  updatedAt: number
  entryId: string
}

export type IndexedStudioWorkState = 'changed' | 'missing_translation' | null

function matchesQuery(row: Doc<'draftSearchEntries'>, normalizedQuery: string) {
  const haystack = row.searchText.toLocaleLowerCase()
  return normalizedQuery.split(/\s+/u).every((term) => haystack.includes(term))
}

export async function readStudioSearchRows(
  ctx: HandlerQueryCtx,
  args: {
    collection: string
    locale: string
    status: StudioEntryStatus | null
    workState: IndexedStudioWorkState
    query: string
    take: number
  },
) {
  const rows = await ctx.db
    .query('draftSearchEntries')
    .withSearchIndex('search_collection_locale', (query) => {
      const scoped = query
        .search('searchText', args.query)
        .eq('collection', args.collection)
        .eq('locale', args.locale)
      const visible = args.status
        ? scoped.eq('status', args.status)
        : scoped.eq('lifecycle', 'active')
      if (args.workState === 'changed') return visible.eq('hasUnpublishedChanges', true)
      if (args.workState === 'missing_translation') {
        return visible.eq('hasMissingTranslations', true)
      }
      return visible
    })
    .take(args.take + 1)

  if (rows.length > args.take) {
    throwCmsError(
      'STUDIO_SEARCH_TOO_BROAD',
      `Studio search matched more than ${args.take} entries. Refine the query to continue.`,
      { collection: args.collection, locale: args.locale, limit: args.take },
    )
  }
  return rows.filter((row) => matchesQuery(row, args.query))
}

export async function readStudioFacetRows(
  ctx: HandlerQueryCtx,
  args: {
    collection: string
    locale: string
    status: StudioEntryStatus | null
    workState: Exclude<IndexedStudioWorkState, null>
    cursor: StudioSearchPosition | null
    take: number
  },
) {
  const cursorEntryId = args.cursor ? ctx.db.normalizeId('entries', args.cursor.entryId) : null
  if (args.cursor && !cursorEntryId) {
    throwCmsError('INVALID_CURSOR', 'Invalid filtered entry pagination cursor.')
  }

  const readChanged = async (sameTimestamp: boolean, take: number) => {
    if (args.status) {
      return await ctx.db
        .query('draftSearchEntries')
        .withIndex('by_collection_locale_changes_status_updatedAt', (query) => {
          const scope = query
            .eq('collection', args.collection)
            .eq('locale', args.locale)
            .eq('hasUnpublishedChanges', true)
            .eq('status', args.status!)
          if (!args.cursor) return scope
          return sameTimestamp
            ? scope.eq('updatedAt', args.cursor.updatedAt).lt('entryId', cursorEntryId!)
            : scope.lt('updatedAt', args.cursor.updatedAt)
        })
        .order('desc')
        .take(take)
    }
    return await ctx.db
      .query('draftSearchEntries')
      .withIndex('by_collection_locale_changes_lifecycle_updatedAt', (query) => {
        const scope = query
          .eq('collection', args.collection)
          .eq('locale', args.locale)
          .eq('hasUnpublishedChanges', true)
          .eq('lifecycle', 'active')
        if (!args.cursor) return scope
        return sameTimestamp
          ? scope.eq('updatedAt', args.cursor.updatedAt).lt('entryId', cursorEntryId!)
          : scope.lt('updatedAt', args.cursor.updatedAt)
      })
      .order('desc')
      .take(take)
  }

  const readMissing = async (sameTimestamp: boolean, take: number) => {
    if (args.status) {
      return await ctx.db
        .query('draftSearchEntries')
        .withIndex('by_collection_locale_missing_status_updatedAt', (query) => {
          const scope = query
            .eq('collection', args.collection)
            .eq('locale', args.locale)
            .eq('hasMissingTranslations', true)
            .eq('status', args.status!)
          if (!args.cursor) return scope
          return sameTimestamp
            ? scope.eq('updatedAt', args.cursor.updatedAt).lt('entryId', cursorEntryId!)
            : scope.lt('updatedAt', args.cursor.updatedAt)
        })
        .order('desc')
        .take(take)
    }
    return await ctx.db
      .query('draftSearchEntries')
      .withIndex('by_collection_locale_missing_lifecycle_updatedAt', (query) => {
        const scope = query
          .eq('collection', args.collection)
          .eq('locale', args.locale)
          .eq('hasMissingTranslations', true)
          .eq('lifecycle', 'active')
        if (!args.cursor) return scope
        return sameTimestamp
          ? scope.eq('updatedAt', args.cursor.updatedAt).lt('entryId', cursorEntryId!)
          : scope.lt('updatedAt', args.cursor.updatedAt)
      })
      .order('desc')
      .take(take)
  }

  const read = args.workState === 'changed' ? readChanged : readMissing
  if (!args.cursor) return await read(false, args.take)
  const sameTimestamp = await read(true, args.take)
  if (sameTimestamp.length >= args.take) return sameTimestamp
  return [...sameTimestamp, ...(await read(false, args.take - sameTimestamp.length))]
}
