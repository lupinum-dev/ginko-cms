import { materializeFieldData } from '@lupinum/ginko-cms-contract/shared/fields/materialize.js'

import type { Doc } from '../../_generated/dataModel.js'
import { boundedSearchText } from '../../lib/contentLimits.js'
import { resolveEntryTitle } from '../../lib/fields.js'
import { buildPublicSearchText } from '../../lib/publicData.js'
import type { CmsCollection, MutationCtx, QueryOrMutationCtx } from '../../lib/types.js'
import { stableHash } from './hashing.js'

function bodySearchText(bodyMdc: string) {
  return bodyMdc
    .replace(/<[^>]*>/gu, ' ')
    .replace(/[#*_`[\](){}>~|]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
}

export function draftSearchPublicationHash(entry: Doc<'entries'>) {
  return stableHash(
    [...entry.activePublications]
      .sort((left, right) => left.locale.localeCompare(right.locale))
      .map((publication) => ({
        locale: publication.locale,
        revisionId: String(publication.revisionId),
        sharedVersion: publication.sharedVersion,
        localeVersion: publication.localeVersion,
        firstPublishedAt: publication.firstPublishedAt,
        activatedAt: publication.activatedAt,
      })),
  )
}

export type DraftSearchEntryState = {
  hasUnpublishedChanges: boolean
  hasMissingTranslations: boolean
}

export function deriveDraftSearchEntryState(
  entry: Doc<'entries'>,
  drafts: Doc<'entryLocaleDrafts'>[],
  collection: CmsCollection,
): DraftSearchEntryState {
  const draftByLocale = new Map(drafts.map((row) => [row.locale, row]))
  const publicationByLocale = new Map(
    entry.activePublications.map((publication) => [publication.locale, publication]),
  )
  return {
    hasUnpublishedChanges: drafts.some((row) => {
      const publication = publicationByLocale.get(row.locale)
      return (
        !publication ||
        publication.sharedVersion !== entry.sharedVersion ||
        publication.localeVersion !== row.version
      )
    }),
    hasMissingTranslations: collection.locales.some(
      (locale) => !draftByLocale.has(locale) && !publicationByLocale.has(locale),
    ),
  }
}

export function buildDraftSearchPayload(
  entry: Doc<'entries'>,
  row: Doc<'entryLocaleDrafts'> | null,
  collection: CmsCollection,
  entryState: DraftSearchEntryState,
  locale = row?.locale ?? collection.locales[0] ?? 'en',
) {
  const values = materializeFieldData(collection.fields, entry.shared, row?.values ?? {})
  const slug = row?.slug ?? entry.slug
  const title = resolveEntryTitle(values, collection.fields, collection.settings) ?? slug
  const fieldText = buildPublicSearchText({ values, fields: collection.fields }) ?? ''
  const searchText = boundedSearchText(
    [title, slug, entry.stableId, fieldText, bodySearchText(row?.bodyMdc ?? '')]
      .filter(Boolean)
      .join(' '),
  )
  const lifecycle = entry.lifecycle
  const status: Doc<'draftSearchEntries'>['status'] =
    lifecycle === 'archived' ? 'archived' : entry.activePublications.length ? 'published' : 'draft'
  return {
    entryId: entry._id,
    collection: entry.collection,
    locale,
    slug,
    title,
    searchText,
    lifecycle,
    status,
    updatedAt: entry.updatedAt,
    sourceDraftVersion: entry.draftVersion,
    sourceSharedVersion: entry.sharedVersion,
    sourceLocaleVersion: row?.version ?? 0,
    sourcePublicationHash: draftSearchPublicationHash(entry),
    ...entryState,
  }
}

export async function upsertDraftSearchEntry(
  ctx: MutationCtx,
  entry: Doc<'entries'>,
  row: Doc<'entryLocaleDrafts'> | null,
  collection: CmsCollection,
  locale = row?.locale ?? collection.locales[0] ?? 'en',
  entryState?: DraftSearchEntryState,
) {
  const state =
    entryState ??
    deriveDraftSearchEntryState(
      entry,
      await ctx.db
        .query('entryLocaleDrafts')
        .withIndex('by_entry', (query) => query.eq('entryId', entry._id))
        .collect(),
      collection,
    )
  const expected = buildDraftSearchPayload(entry, row, collection, state, locale)
  const existing = await ctx.db
    .query('draftSearchEntries')
    .withIndex('by_entry_locale', (query) => query.eq('entryId', entry._id).eq('locale', locale))
    .unique()
  if (existing) {
    const { _id: _id, _creationTime: _creationTime, ...actual } = existing
    if (stableHash(actual) !== stableHash(expected)) await ctx.db.replace(existing._id, expected)
  } else {
    await ctx.db.insert('draftSearchEntries', expected)
  }
}

export async function deleteDraftSearchEntry(
  ctx: MutationCtx,
  entryId: Doc<'entries'>['_id'],
  locale: string,
) {
  const existing = await ctx.db
    .query('draftSearchEntries')
    .withIndex('by_entry_locale', (query) => query.eq('entryId', entryId).eq('locale', locale))
    .unique()
  if (existing) await ctx.db.delete(existing._id)
}

export async function refreshDraftSearchEntriesForEntry(
  ctx: MutationCtx,
  entryId: Doc<'entries'>['_id'],
  collection: CmsCollection,
) {
  const entry = await ctx.db.get(entryId)
  if (!entry) return
  const drafts = await ctx.db
    .query('entryLocaleDrafts')
    .withIndex('by_entry', (query) => query.eq('entryId', entryId))
    .collect()
  const draftByLocale = new Map(drafts.map((row) => [row.locale, row]))
  const entryState = deriveDraftSearchEntryState(entry, drafts, collection)
  const locales = new Set([...collection.locales, ...draftByLocale.keys()])
  for (const locale of locales) {
    await upsertDraftSearchEntry(
      ctx,
      entry,
      draftByLocale.get(locale) ?? null,
      collection,
      locale,
      entryState,
    )
  }
  const existing = await ctx.db
    .query('draftSearchEntries')
    .withIndex('by_entry_locale', (query) => query.eq('entryId', entryId))
    .collect()
  for (const row of existing) {
    if (!locales.has(row.locale)) await ctx.db.delete(row._id)
  }
}

export async function draftSearchEntryMatches(
  ctx: QueryOrMutationCtx,
  entry: Doc<'entries'>,
  row: Doc<'entryLocaleDrafts'> | null,
  collection: CmsCollection,
  locale = row?.locale ?? collection.locales[0] ?? 'en',
) {
  const existing = await ctx.db
    .query('draftSearchEntries')
    .withIndex('by_entry_locale', (query) => query.eq('entryId', entry._id).eq('locale', locale))
    .unique()
  if (!existing) return false
  const drafts = await ctx.db
    .query('entryLocaleDrafts')
    .withIndex('by_entry', (query) => query.eq('entryId', entry._id))
    .collect()
  const { _id: _id, _creationTime: _creationTime, ...actual } = existing
  return (
    stableHash(actual) ===
    stableHash(
      buildDraftSearchPayload(
        entry,
        row,
        collection,
        deriveDraftSearchEntryState(entry, drafts, collection),
        locale,
      ),
    )
  )
}
