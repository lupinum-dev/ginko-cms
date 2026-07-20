import { materializeFieldData } from '@lupinum/ginko-cms-contract/shared/fields/materialize.js'
import type { JsonMap } from '@lupinum/ginko-cms-contract/shared/types.js'

import type { Doc, Id } from '../_generated/dataModel.js'
import { requireRecord } from '../auth/checks.js'
import { throwCmsError } from '../errors.js'
import { getCollectionDefaultLocale, getCollectionOrThrow } from '../lib/collections.js'
import { asEntryId, toOptionalStringId, toStringId } from '../lib/ids.js'
import { pathPrefixForLocale, rootSlugForLocale } from '../lib/paths.js'
import type { HandlerMutationCtx, QueryOrMutationCtx } from '../lib/types.js'
import { getFieldCompletionState } from '../lib/validation.js'
import {
  computeDraftPath,
  effectiveDraftParent,
  effectiveDraftSlug,
} from './workflow/draftPlacement.js'
import { readDraftRows } from './workflow/drafts.js'
import { publicPathForEntry } from './workflow/publicTree.js'

export type EntryDoc = Doc<'entries'>
export type EntryRevisionDoc = Doc<'entryRevisions'>

type CollectionForEntry = Awaited<ReturnType<typeof getCollectionForEntry>>

export type StudioLocaleDraftView = {
  locale: string
  draftExists: boolean
  draftSlug: string | null
  draftPath: string
  publishedSlug: string | null
  publishedPath: string | null
  draft: { values: JsonMap; bodyMdc?: string | null }
  published: { values: JsonMap; bodyMdc?: string | null } | null
  publishedShared: JsonMap | null
  updatedBy: string
  updatedAt: number
  draftVersion: number
  data: JsonMap
  publishedData: JsonMap
}

export type StudioDraftView = {
  shared: JsonMap
  publishedShared: JsonMap | null
  baseSlug: string
  parentEntryId: Id<'entries'> | null
  orderRank: string
  locales: StudioLocaleDraftView[]
}

export type LoadedEntryMutation = {
  appIdentityId: string
  now: number
  entry: EntryDoc
  collection: Awaited<ReturnType<typeof getCollectionForEntry>>
}

export async function getEntryOrThrow(ctx: QueryOrMutationCtx, id: string): Promise<EntryDoc> {
  const entry = await ctx.db.get(asEntryId(ctx, id))
  requireRecord(entry, 'Entry')
  return entry
}

export async function getCollectionForEntry(ctx: QueryOrMutationCtx, entry: EntryDoc) {
  return await getCollectionOrThrow(ctx, entry.collection)
}

export async function loadEntryMutationContext(
  ctx: HandlerMutationCtx,
  entryId: string,
  options: { expectedVersion?: number } = {},
): Promise<LoadedEntryMutation> {
  const appIdentity = await ctx.appIdentity()
  if (!appIdentity) {
    throwCmsError('AUTH_REQUIRED', 'Authentication required')
  }
  const entry = await getEntryOrThrow(ctx, entryId)
  if (options.expectedVersion !== undefined && entry.draftVersion !== options.expectedVersion) {
    throwCmsError(
      'ENTRY_CONCURRENT_EDIT',
      'This entry changed in another session. Reload and try again.',
      {
        entryId,
        expectedVersion: options.expectedVersion,
        actualVersion: entry.draftVersion,
      },
    )
  }

  return {
    appIdentityId: appIdentity.userId,
    now: Date.now(),
    entry,
    collection: await getCollectionForEntry(ctx, entry),
  }
}

export function buildVersionedEntry(
  entry: EntryDoc,
  appIdentityId: string,
  now: number,
  patch: Partial<EntryDoc> = {},
): EntryDoc {
  return {
    ...entry,
    ...patch,
    draftVersion: entry.draftVersion + 1,
    updatedAt: now,
    updatedBy: appIdentityId,
  } as EntryDoc
}

export function getDefaultLocale(
  collection: Awaited<ReturnType<typeof getCollectionOrThrow>>,
): string {
  return getCollectionDefaultLocale(collection)
}

function localeCodesForDraftView(args: {
  collection: CollectionForEntry
  draftRows: Awaited<ReturnType<typeof readDraftRows>>
}) {
  return Array.from(new Set([...args.collection.locales, ...Object.keys(args.draftRows.byLocale)]))
}

export async function readStudioDraftView(
  ctx: QueryOrMutationCtx,
  entry: EntryDoc,
  collection: CollectionForEntry,
  options: {
    draftRows?: Awaited<ReturnType<typeof readDraftRows>>
    publicRows?: Array<Doc<'publicEntries'>>
    includePublishedSnapshots?: boolean
  } = {},
): Promise<StudioDraftView> {
  const [draftRows, publicRows] = await Promise.all([
    options.draftRows ?? readDraftRows(ctx, entry._id),
    options.publicRows ??
      ctx.db
        .query('publicEntries')
        .withIndex('by_entry_locale', (q) => q.eq('entryId', entry._id))
        .collect(),
  ])
  const publicByLocale = new Map(publicRows.map((row) => [row.locale, row]))
  const shared = (draftRows.shared?.shared ?? {}) as JsonMap
  const publishedSnapshotsByLocale =
    options.includePublishedSnapshots === false
      ? new Map<string, Doc<'entryRevisions'>['snapshots'][string]>()
      : await publishedSnapshotsForRows(ctx, publicRows)
  const sharedSlug = effectiveDraftSlug(entry, draftRows.shared, null)
  const draftParentEntryId = effectiveDraftParent(entry, draftRows.shared)
  const localeCodes = localeCodesForDraftView({
    collection,
    draftRows,
  })

  const locales = await Promise.all(
    localeCodes.map(async (locale): Promise<StudioLocaleDraftView> => {
      const localeRow = draftRows.byLocale[locale] ?? null
      const publicRow = publicByLocale.get(locale) ?? null
      const values = (localeRow?.values ?? {}) as JsonMap
      const bodyMdc = localeRow?.bodyMdc ?? ''
      const slug = effectiveDraftSlug(entry, draftRows.shared, localeRow)
      const draftPath = await computeDraftPath(ctx, {
        collection,
        entry,
        parentEntryId: draftParentEntryId,
        slug,
        locale,
      })
      const publishedSnapshot = publishedSnapshotsByLocale.get(locale) ?? null
      const publishedValues = publishedSnapshot ? (publishedSnapshot.values as JsonMap) : null
      const publishedBodyMdc = publishedSnapshot?.bodyMdc ?? null
      const publishedShared = publishedSnapshot ? (publishedSnapshot.shared as JsonMap) : null
      const data = materializeFieldData(collection.fields, shared, values)
      const publishedData = publishedValues
        ? materializeFieldData(collection.fields, publishedShared ?? {}, publishedValues)
        : {}

      return {
        locale,
        draftExists: localeRow !== null,
        draftSlug: localeRow?.slug ?? null,
        draftPath,
        publishedSlug: publicRow?.slug ?? null,
        publishedPath: publicRow
          ? await publicPathForEntry(ctx, publicRow, {
              pathPrefix: pathPrefixForLocale(collection, locale),
              rootSlug: rootSlugForLocale(collection, locale),
            })
          : null,
        draft: { values, bodyMdc },
        published: publishedValues ? { values: publishedValues, bodyMdc: publishedBodyMdc } : null,
        publishedShared,
        updatedBy: localeRow?.updatedBy ?? entry.updatedBy,
        updatedAt: localeRow?.updatedAt ?? entry.updatedAt,
        draftVersion: localeRow?.version ?? 0,
        data,
        publishedData,
      }
    }),
  )

  return {
    shared,
    // There is intentionally no global published shared snapshot. Each
    // locale exposes the shared values from its own active revision.
    publishedShared: null,
    baseSlug: sharedSlug,
    parentEntryId: draftParentEntryId,
    orderRank: draftRows.shared?.orderRank ?? entry.orderRank ?? '',
    locales,
  }
}

async function publishedSnapshotsForRows(
  ctx: QueryOrMutationCtx,
  publicRows: Array<Doc<'publicEntries'>>,
): Promise<Map<string, Doc<'entryRevisions'>['snapshots'][string]>> {
  const byLocale = new Map<string, Doc<'entryRevisions'>['snapshots'][string]>()
  await Promise.all(
    publicRows.map(async (row) => {
      const revision = await ctx.db.get(row.revisionId)
      const snapshot = revision?.snapshots[row.locale]
      if (revision?.entryId === row.entryId && revision.collection === row.collection && snapshot) {
        byLocale.set(row.locale, snapshot)
      }
    }),
  )
  return byLocale
}

export function deriveDirtyLocales(
  entry: EntryDoc,
  localeVersions: ReadonlyMap<string, number>,
): string[] {
  return entry.activePublications
    .filter((publication) => {
      const localeVersion = localeVersions.get(publication.locale)
      return (
        publication.sharedVersion !== entry.sharedVersion ||
        localeVersion === undefined ||
        publication.localeVersion !== localeVersion
      )
    })
    .map((publication) => publication.locale)
    .sort()
}

export async function buildStudioEntry(ctx: QueryOrMutationCtx, entry: EntryDoc, locale?: string) {
  const collection = await getCollectionForEntry(ctx, entry)
  const draftView = await readStudioDraftView(ctx, entry, collection)
  const locales = draftView.locales
  const primaryLocale = locale ?? getDefaultLocale(collection)
  const primary = locales.find((item) => item.locale === primaryLocale) ?? locales[0] ?? null

  const localizedEntries = locales.map((item) => {
    const completion = getFieldCompletionState(collection.fields, item.data, item.data)

    return {
      locale: item.locale,
      draftExists: item.draftExists,
      entryId: toStringId(entry._id),
      draftSlug: item.draftSlug ?? null,
      draftPath: item.draftPath,
      publishedSlug: item.publishedSlug ?? null,
      publishedPath: item.publishedPath ?? null,
      draft: item.draft,
      published: item.published,
      updatedBy: item.updatedBy,
      updatedAt: item.updatedAt,
      completion,
      data: item.data,
      publishedData: item.publishedData,
    }
  })

  const primaryData = primary ? primary.data : draftView.shared
  const localeVersionByCode = new Map(
    draftView.locales.map((item) => [item.locale, item.draftVersion]),
  )
  const dirtyLocales = deriveDirtyLocales(entry, localeVersionByCode)
  const latestPublication = [...entry.activePublications].sort(
    (left, right) => right.activatedAt - left.activatedAt,
  )[0]

  return {
    _id: toStringId(entry._id),
    collection: collection.slug,
    baseSlug: draftView.baseSlug,
    stableId: entry.stableId ?? null,
    status:
      entry.lifecycle === 'archived'
        ? 'archived'
        : entry.activePublications.length
          ? 'published'
          : 'draft',
    dirtyLocales,
    parentEntryId: toOptionalStringId(draftView.parentEntryId),
    orderRank: draftView.orderRank,
    nodeKind: entry.nodeKind ?? 'page',
    draft: draftView.shared,
    published: draftView.publishedShared,
    draftVersion: entry.draftVersion,
    createdBy: entry.createdBy,
    updatedBy: entry.updatedBy,
    publishedBy: latestPublication?.activatedBy ?? null,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
    publishedAt: latestPublication?.activatedAt ?? null,
    locale: primary?.locale ?? primaryLocale,
    slug: primary?.draftSlug ?? draftView.baseSlug,
    path: primary?.draftPath ?? null,
    data: primaryData,
    publishedData: primary?.published ? primary.publishedData : draftView.publishedShared,
    localeData: primary
      ? {
          draftSlug: primary.draftSlug ?? null,
          draftPath: primary.draftPath,
          publishedSlug: primary.publishedSlug ?? null,
          publishedPath: primary.publishedPath ?? null,
          draft: primary.draft,
          published: primary.published,
        }
      : null,
    locales: localizedEntries,
    localeVariants: localizedEntries.map((item) => ({
      locale: item.locale,
      entryId: toStringId(entry._id),
      label: item.locale,
      isCurrent: item.locale === (primary?.locale ?? primaryLocale),
      draftExists: item.draftExists,
      filledRequired: item.completion.filledRequired,
      totalRequired: item.completion.totalRequired,
      complete: item.completion.complete,
      draftPath: item.draftPath,
      publishedPath: item.publishedPath ?? null,
      updatedAt: item.updatedAt,
    })),
    schema: {
      slug: collection.slug,
      type: collection.type,
      routing: collection.routing,
      locales: collection.locales,
      fields: collection.fields,
      settings: collection.settings ?? {},
    },
  }
}
