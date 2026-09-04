import { materializeFieldData } from '@lupinum/ginko-cms-contract/shared/fields/materialize.js'
import type { JsonMap } from '@lupinum/ginko-cms-contract/shared/types.js'

import type { Id } from '../_generated/dataModel.js'
import { toOptionalStringId, toStringId } from '../lib/ids.js'
import { getLocaleChain } from '../lib/locale.js'
import { pathPrefixForLocale, rootSlugForLocale } from '../lib/paths.js'
import { buildSearchText } from '../lib/search.js'
import type { CmsCollection, HandlerQueryCtx } from '../lib/types.js'
import type { EntryDoc } from './context.js'
import { deriveDirtyLocales } from './context.js'
import {
  computeDraftPath,
  effectiveDraftParent,
  effectiveDraftSlug,
} from './workflow/draftPlacement.js'
import { readDraftRows } from './workflow/drafts.js'
import { publicPathForEntry } from './workflow/publicTree.js'

const ORDER_KEY_TIME_PAD = 16
const ORDER_KEY_TIME_MAX = 9_999_999_999_999

export type StudioEntryStatus = 'draft' | 'published' | 'archived'

export type StudioEntryRowDoc = {
  entryId: Id<'entries'>
  collection: string
  locale: string
  baseSlug: string
  stableId: string | null
  status: StudioEntryStatus
  dirtyLocales: string[]
  draftVersion: number
  createdAt: number
  updatedAt: number
  publishedAt: number | null
  parentEntryId?: Id<'entries'> | null
  orderRank: string
  orderKey: string
  nodeKind: 'page' | 'folder' | 'group' | 'section'
  path: string
  data: Record<string, unknown>
  localeSummaries: Array<{
    locale: string
    draftExists: boolean
    draftPath: string
    publishedPath: string | null
    published: boolean
    updatedAt: number
  }>
  queryText: string
}

export function studioEntryStatus(entry: EntryDoc): StudioEntryStatus {
  if (entry.lifecycle === 'archived') return 'archived'
  return entry.activePublications.length > 0 ? 'published' : 'draft'
}

function buildStudioOrderKey(entry: Pick<EntryDoc, '_id' | 'orderRank' | 'updatedAt'>) {
  const reverseUpdatedAt = String(ORDER_KEY_TIME_MAX - entry.updatedAt).padStart(
    ORDER_KEY_TIME_PAD,
    '0',
  )
  return `${entry.orderRank ?? ''}\u0000${reverseUpdatedAt}\u0000${String(entry._id)}`
}

function selectStudioLocaleCode(locales: string[], fallbackChain: string[]) {
  for (const localeCode of fallbackChain) {
    if (locales.includes(localeCode)) return localeCode
  }
  return [...locales].sort()[0] ?? null
}

export async function buildSourceStudioRow(
  ctx: HandlerQueryCtx,
  collection: CmsCollection,
  entry: EntryDoc,
  requestedLocale: string,
): Promise<StudioEntryRowDoc | null> {
  const [draftRows, publicRows] = await Promise.all([
    readDraftRows(ctx, entry._id),
    ctx.db
      .query('publicEntries')
      .withIndex('by_entry_locale', (query) => query.eq('entryId', entry._id))
      .collect(),
  ])
  const publicByLocale = new Map(publicRows.map((row) => [row.locale, row]))
  const locales = Array.from(
    new Set([...collection.locales, ...Object.keys(draftRows.byLocale), ...publicByLocale.keys()]),
  )
  const { chain } = await getLocaleChain(ctx, requestedLocale)
  const preferredLocale = selectStudioLocaleCode(locales, chain)
  if (!preferredLocale) return null
  const shared = (draftRows.shared?.shared ?? {}) as JsonMap
  const preferredLocaleRow = draftRows.byLocale[preferredLocale] ?? null
  const preferredData = materializeFieldData(
    collection.fields,
    shared,
    (preferredLocaleRow?.values ?? {}) as JsonMap,
  )
  const preferredSlug = effectiveDraftSlug(entry, draftRows.shared, preferredLocaleRow)
  const draftParentEntryId = effectiveDraftParent(entry, draftRows.shared)
  const preferredPath = await computeDraftPath(ctx, {
    collection,
    entry,
    parentEntryId: draftParentEntryId,
    slug: preferredSlug,
    locale: preferredLocale,
  })
  const localeSummaries = await Promise.all(
    locales.map(async (locale) => {
      const localeRow = draftRows.byLocale[locale] ?? null
      const slug = effectiveDraftSlug(entry, draftRows.shared, localeRow)
      const publicRow = publicByLocale.get(locale) ?? null
      return {
        locale,
        draftPath: await computeDraftPath(ctx, {
          collection,
          entry,
          parentEntryId: draftParentEntryId,
          slug,
          locale,
        }),
        draftExists: !!localeRow,
        publishedPath: publicRow
          ? await publicPathForEntry(ctx, publicRow, {
              pathPrefix: pathPrefixForLocale(collection, locale),
              rootSlug: rootSlugForLocale(collection, locale),
            })
          : null,
        published: !!publicRow,
        updatedAt: localeRow?.updatedAt ?? entry.updatedAt,
      }
    }),
  )
  const localeVersions = new Map(
    Object.values(draftRows.byLocale).map((localeRow) => [localeRow.locale, localeRow.version]),
  )
  return {
    entryId: entry._id,
    collection: collection.slug,
    locale: preferredLocale,
    baseSlug: preferredSlug,
    stableId: entry.stableId ?? null,
    status: studioEntryStatus(entry),
    dirtyLocales: deriveDirtyLocales(entry, localeVersions),
    draftVersion: entry.draftVersion,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
    publishedAt: publicRows.length
      ? Math.max(...publicRows.map((row) => row.lastPublishedAt))
      : null,
    parentEntryId: draftParentEntryId,
    orderRank: draftRows.shared?.orderRank ?? entry.orderRank ?? '',
    orderKey: buildStudioOrderKey(entry),
    nodeKind: entry.nodeKind ?? 'page',
    path: preferredPath,
    data: preferredData,
    localeSummaries: localeSummaries.sort((left, right) => left.locale.localeCompare(right.locale)),
    queryText: buildSearchText({ values: preferredData, fields: collection.fields }) ?? '',
  }
}

export async function buildStudioRowsForEntries(
  ctx: HandlerQueryCtx,
  collection: CmsCollection,
  entries: EntryDoc[],
  requestedLocale: string,
) {
  const rows = await Promise.all(
    entries.map((entry) => buildSourceStudioRow(ctx, collection, entry, requestedLocale)),
  )
  return rows.filter((row): row is StudioEntryRowDoc => row !== null)
}

export function entryTitle(row: Pick<StudioEntryRowDoc, 'baseSlug' | 'data'>): string {
  const candidates = [row.data.title, row.data.name, row.data.label, row.data.heading]
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate
  }
  return row.baseSlug
}

export function mapStudioSourceRow(row: StudioEntryRowDoc, collection: CmsCollection) {
  return {
    _id: toStringId(row.entryId),
    collection: collection.slug,
    locale: row.locale,
    title: entryTitle(row),
    baseSlug: row.baseSlug,
    stableId: row.stableId,
    status: row.status,
    dirtyLocales: row.dirtyLocales,
    draftVersion: row.draftVersion,
    path: row.path,
    data: row.data,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    publishedAt: row.publishedAt,
    parentEntryId: toOptionalStringId(row.parentEntryId),
    orderRank: row.orderRank,
    nodeKind: row.nodeKind,
    localeSummaries: row.localeSummaries.map((locale) => ({
      locale: locale.locale,
      draftExists: locale.draftExists,
      draftPath: locale.draftPath,
      publishedPath: locale.publishedPath,
      published: locale.published,
      updatedAt: locale.updatedAt,
    })),
  }
}
