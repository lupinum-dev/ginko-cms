import { materializeFieldData } from '@lupinum/ginko-cms-contract/shared/fields/materialize.js'
import type { JsonMap } from '@lupinum/ginko-cms-contract/shared/types.js'

import type { Doc, Id } from '../_generated/dataModel.js'
import { requireRecord } from '../auth/checks.js'
import { throwCmsError } from '../errors.js'
import { getCollectionOrThrow } from '../lib/collections.js'
import { asEntryId, toOptionalStringId, toStringId } from '../lib/ids.js'
import type { HandlerMutationCtx, MutationCtx, QueryOrMutationCtx } from '../lib/types.js'
import { getFieldCompletionState } from '../lib/validation.js'
import { clearEntryProjectionRows } from './projections.js'
import { readDraftRows, type EntryDraftDoc } from './workflow/drafts.js'
import { entrySnapshotPath, publicPathForLocaleSnapshot } from './workflow/path.js'

export type EntryDoc = Doc<'entries'>
export type EntryRevisionDoc = Doc<'entryRevisions'>

type CollectionForEntry = Awaited<ReturnType<typeof getCollectionForEntry>>

export type StudioLocaleDraftView = {
  locale: string
  draftSlug: string | null
  draftPath: string
  publishedSlug: string | null
  publishedPath: string | null
  draft: { values: JsonMap; bodyMdc?: string | null }
  published: { values: JsonMap; bodyMdc?: string | null } | null
  updatedBy: string
  updatedAt: number
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
  const entry = await ctx.db.get(asEntryId(id))
  requireRecord(entry, 'Entry')
  return entry
}

export async function getCollectionForEntry(ctx: QueryOrMutationCtx, entry: EntryDoc) {
  const collectionDoc = await ctx.db.get(entry.collectionId)
  requireRecord(collectionDoc, 'Collection')
  return await getCollectionOrThrow(ctx, collectionDoc.slug)
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
  return collection.locales[0] ?? 'en'
}

function localeCodesForDraftView(args: {
  collection: CollectionForEntry
  draftRows: Awaited<ReturnType<typeof readDraftRows>>
}) {
  return Array.from(new Set([...args.collection.locales, ...Object.keys(args.draftRows.byLocale)]))
}

function rowDraftSlug(args: {
  collection: CollectionForEntry
  entry: EntryDoc
  sharedRow: EntryDraftDoc | null
  localeRow: EntryDraftDoc | null
}) {
  return args.localeRow?.localeSlug ?? args.sharedRow?.slug ?? args.entry.baseSlug
}

async function computeStudioDraftPath(
  ctx: QueryOrMutationCtx,
  args: {
    collection: CollectionForEntry
    entry: EntryDoc
    slug: string
    locale: string
  },
) {
  const ancestorSlugs = await resolveStudioDraftAncestorSlugs(ctx, {
    entry: args.entry,
    locale: args.locale,
  })
  const localePath = entrySnapshotPath(args.collection, {
    slug: args.slug,
    stableId: args.entry.stableId ?? null,
    ancestorSlugs,
  })
  return publicPathForLocaleSnapshot(args.collection, localePath, args.locale)
}

async function resolveStudioDraftAncestorSlugs(
  ctx: QueryOrMutationCtx,
  args: { entry: EntryDoc; locale: string },
) {
  const slugs: string[] = []
  let parentEntryId = args.entry.parentEntryId ?? null
  while (parentEntryId) {
    const parent = await ctx.db.get(parentEntryId)
    if (!parent) break
    const parentDraftRows = await readDraftRows(ctx, parent._id)
    const parentLocaleRow = parentDraftRows.byLocale[args.locale] ?? null
    slugs.unshift(parentLocaleRow?.localeSlug ?? parentDraftRows.shared?.slug ?? parent.baseSlug)
    parentEntryId = parent.parentEntryId ?? null
  }
  return slugs
}

export async function readStudioDraftView(
  ctx: QueryOrMutationCtx,
  entry: EntryDoc,
  collection: CollectionForEntry,
): Promise<StudioDraftView> {
  const [draftRows, publicRows] = await Promise.all([
    readDraftRows(ctx, entry._id),
    ctx.db
      .query('publicEntries')
      .filter((q) => q.eq(q.field('entryId'), entry._id))
      .collect(),
  ])
  const publicByLocale = new Map(publicRows.map((row) => [row.locale, row]))
  const shared = (draftRows.shared?.shared ?? {}) as JsonMap
  const publishedShared = await latestPublishedShared(ctx, publicRows)
  const sharedSlug = draftRows.shared?.slug ?? entry.baseSlug
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
      const slug = rowDraftSlug({
        collection,
        entry,
        sharedRow: draftRows.shared,
        localeRow,
      })
      const draftPath = await computeStudioDraftPath(ctx, {
        collection,
        entry,
        slug,
        locale,
      })
      const publishedValues = publicRow ? ((publicRow.data ?? {}) as JsonMap) : null
      const publishedBodyMdc = publicRow?.bodyMdc ?? null
      const data = materializeFieldData(collection.fields, shared, values)
      const publishedData = publishedValues
        ? materializeFieldData(collection.fields, publishedShared ?? {}, publishedValues)
        : {}

      return {
        locale,
        draftSlug: localeRow?.localeSlug ?? (draftRows.shared?.slug ? null : null),
        draftPath,
        publishedSlug: publicRow?.slug ?? null,
        publishedPath: publicRow?.path ?? null,
        draft: { values, bodyMdc },
        published: publishedValues ? { values: publishedValues, bodyMdc: publishedBodyMdc } : null,
        updatedBy: localeRow?.updatedBy ?? entry.updatedBy,
        updatedAt: localeRow?.updatedAt ?? entry.updatedAt,
        data,
        publishedData,
      }
    }),
  )

  return {
    shared,
    publishedShared,
    baseSlug: sharedSlug,
    parentEntryId: draftRows.shared?.parentEntryId ?? entry.parentEntryId ?? null,
    orderRank: draftRows.shared?.orderRank ?? entry.orderRank ?? '',
    locales,
  }
}

export async function deleteEntryRecords(ctx: MutationCtx, entryId: Id<'entries'>) {
  await clearEntryProjectionRows(ctx, entryId)

  let revisionsDeleted = 0
  do {
    const revisions = await ctx.db
      .query('entryRevisions')
      .withIndex('by_entry_createdAt', (q) => q.eq('entryId', entryId))
      .take(100)
    revisionsDeleted = revisions.length
    for (const revision of revisions) {
      await ctx.db.delete(revision._id)
    }
  } while (revisionsDeleted === 100)

  let draftsDeleted = 0
  do {
    const drafts = await ctx.db
      .query('entryDrafts')
      .withIndex('by_entry', (q) => q.eq('entryId', entryId))
      .take(100)
    draftsDeleted = drafts.length
    for (const draft of drafts) {
      await ctx.db.delete(draft._id)
    }
  } while (draftsDeleted === 100)
}

async function latestPublishedShared(
  ctx: QueryOrMutationCtx,
  publicRows: Array<Doc<'publicEntries'>>,
): Promise<JsonMap | null> {
  if (publicRows.length === 0) return null
  // `publicEntries` rows are locale-scoped and point at the `entryRevisions`
  // snapshot they were projected from. The shared portion of that snapshot is
  // the authoritative published shared state. After a partial publish or a
  // partial unpublish, the surviving public rows may reference different
  // revisions; we read the most recently created backing revision so the
  // shared snapshot reflects the last write that still has a live public row.
  const revisionIds = Array.from(new Set(publicRows.map((row) => String(row.revisionId))))
  const revisions = (
    await Promise.all(revisionIds.map((id) => ctx.db.get(id as Id<'entryRevisions'>)))
  ).filter((revision): revision is EntryRevisionDoc => revision !== null)
  if (revisions.length === 0) return null
  const latest = revisions.reduce((acc, revision) =>
    revision.createdAt > acc.createdAt ? revision : acc,
  )
  return (latest.snapshot.shared ?? {}) as JsonMap
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

  return {
    _id: toStringId(entry._id),
    collection: collection.slug,
    collectionId: toStringId(entry.collectionId),
    baseSlug: draftView.baseSlug,
    stableId: entry.stableId ?? null,
    status: entry.status,
    dirtyLocales: entry.dirtyLocales,
    parentEntryId: toOptionalStringId(draftView.parentEntryId),
    orderRank: draftView.orderRank,
    nodeKind: entry.nodeKind ?? 'page',
    draft: draftView.shared,
    published: draftView.publishedShared,
    draftVersion: entry.draftVersion,
    createdBy: entry.createdBy,
    updatedBy: entry.updatedBy,
    publishedBy: entry.publishedBy ?? null,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
    publishedAt: entry.publishedAt ?? null,
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
