/** Canonical entry creation and draft snapshot commands. */

import { materializeFieldData } from '@lupinum/ginko-cms-contract/shared/fields/materialize.js'
import type { JsonObject } from '@lupinum/ginko-cms-contract/shared/types.js'
import { parseMdcBody } from '@lupinum/ginko-content/cms-contract'

import type { Doc, Id } from '../../_generated/dataModel.js'
import { throwCmsError } from '../../errors.js'
import { logActivity } from '../../lib/activity.js'
import {
  assertCollectionSupportsLocale,
  getCollectionOrThrow,
  isLocalizedSlugMode,
  isRouteBackedCollection,
} from '../../lib/collections.js'
import { assertMdcBodyWithinLimit } from '../../lib/contentLimits.js'
import { assertCmsContractWritable, readInstalledCmsContract } from '../../lib/installedContract.js'
import { rankAfter } from '../../lib/ordering.js'
import { generateStableId } from '../../lib/paths.js'
import type { CmsCollection, MutationCtx, QueryOrMutationCtx } from '../../lib/types.js'
import {
  assertFieldDataValid,
  assertValidLocaleCode,
  assertValidSlug,
} from '../../lib/validation.js'
import {
  extractAssetRefsFromText,
  extractAssetRefsFromValues,
  replaceAssetRefs,
  uniqueAssetRefs,
} from './assetRefs.js'
import { assertDraftParentDepthForCreate } from './draftPlacement.js'
import { readDraftRows } from './drafts.js'
import { refreshDraftSearchEntriesForEntry } from './draftSearch.js'
import { stableHash } from './hashing.js'
import type { RevisionSnapshots } from './revisions.js'

async function nextOrderRank(
  ctx: QueryOrMutationCtx,
  collection: string,
  parentEntryId: Id<'entries'> | null,
): Promise<string> {
  const siblings = await ctx.db
    .query('entries')
    .withIndex('by_parent', (q) =>
      q.eq('collection', collection).eq('parentEntryId', parentEntryId),
    )
    .order('desc')
    .take(1)
  return rankAfter(siblings[0]?.orderRank)
}

async function resolveParent(
  ctx: QueryOrMutationCtx,
  collection: CmsCollection,
  parentEntryId: string | undefined,
): Promise<Id<'entries'> | null> {
  if (!parentEntryId) return null
  if (collection.type !== 'tree') {
    throwCmsError('ENTRY_PARENT_NOT_ALLOWED', 'Flat collections cannot assign a parent entry.')
  }
  const id = ctx.db.normalizeId('entries', parentEntryId)
  const parent = id ? await ctx.db.get(id) : null
  if (!parent || parent.collection !== collection.slug || parent.lifecycle !== 'active') {
    throwCmsError('ENTRY_PARENT_NOT_FOUND', 'Parent entry not found.', { parentEntryId })
  }
  return parent._id
}

export async function createCanonicalEntry(
  ctx: MutationCtx,
  args: {
    collection: string
    locale?: string
    slug: string
    shared?: JsonObject
    localized?: JsonObject
    bodyMdc?: string | null
    parentEntryId?: string
    orderRank?: string
    nodeKind?: Doc<'entries'>['nodeKind']
    appIdentity: string
  },
): Promise<Id<'entries'>> {
  await assertCmsContractWritable(ctx)
  const collection = await getCollectionOrThrow(ctx, args.collection)
  const locale = args.locale ?? collection.locales[0] ?? 'en'
  assertValidLocaleCode(locale, 'ENTRY_LOCALE_INVALID')
  assertCollectionSupportsLocale(collection, locale)
  const slug = collection.routing.singleton ? collection.slug : args.slug
  if (!collection.routing.singleton) assertValidSlug(slug)
  const parentEntryId = await resolveParent(ctx, collection, args.parentEntryId)
  await assertDraftParentDepthForCreate(ctx, { collection, parentEntryId })
  const existing = await ctx.db
    .query('entries')
    .withIndex('by_collection_parent_slug', (q) =>
      q.eq('collection', collection.slug).eq('parentEntryId', parentEntryId).eq('slug', slug),
    )
    .first()
  if (existing) throwCmsError('ENTRY_SLUG_CONFLICT', `Slug "${slug}" already exists.`)

  const shared = args.shared ?? {}
  const richtextKeys = new Set(
    collection.fields.filter((field) => field.type === 'richtext').map((field) => field.key),
  )
  let bodyMdc = args.bodyMdc ?? ''
  for (const key of richtextKeys) {
    const value = args.localized?.[key]
    if (!bodyMdc && typeof value === 'string') bodyMdc = value
  }
  assertMdcBodyWithinLimit(bodyMdc, { locale, field: 'bodyMdc' })
  const localized = Object.fromEntries(
    Object.entries(args.localized ?? {}).filter(([key]) => !richtextKeys.has(key)),
  )
  assertFieldDataValid(
    collection.fields,
    materializeFieldData(collection.fields, shared, localized),
    { publish: false },
  )

  const now = Date.now()
  const orderRank = args.orderRank ?? (await nextOrderRank(ctx, collection.slug, parentEntryId))
  const entryId = await ctx.db.insert('entries', {
    collection: collection.slug,
    stableId: await generateStableId(ctx, collection.slug),
    lifecycle: 'active',
    slug,
    parentEntryId,
    orderRank,
    nodeKind: args.nodeKind ?? null,
    shared,
    draftVersion: 1,
    sharedVersion: 1,
    activePublications: [],
    latestEditorialRevisionId: null,
    createdBy: args.appIdentity,
    updatedBy: args.appIdentity,
    createdAt: now,
    updatedAt: now,
  })
  await ctx.db.insert('entryLocaleDrafts', {
    entryId,
    locale,
    slug: isLocalizedSlugMode(collection) ? slug : null,
    values: localized,
    bodyMdc,
    version: 1,
    updatedBy: args.appIdentity,
    updatedAt: now,
  })
  await refreshDraftAssetRefsForSave(ctx, {
    entryId,
    collection: collection.slug,
    sharedUpdated: true,
    affectedLocales: [locale],
  })
  await logActivity(ctx, {
    kind: 'entry.created',
    summary: `Created ${collection.slug} entry "${slug}"`,
    appIdentityId: args.appIdentity,
    entryId,
    collection: collection.slug,
    locale,
    detail: { locale },
    createdAt: now,
  })
  return entryId
}

export async function refreshDraftAssetRefsForSave(
  ctx: MutationCtx,
  args: {
    entryId: Id<'entries'>
    collection: string
    sharedUpdated: boolean
    affectedLocales: string[]
  },
): Promise<void> {
  const drafts = await readDraftRows(ctx, args.entryId)
  const entry = drafts.shared
  if (!entry) throwCmsError('ENTRY_NOT_FOUND', 'Entry not found.')
  await replaceAssetRefs(
    ctx,
    {
      sourceKind: 'draft',
      sourceId: `${args.entryId}:shared`,
      sourceFence: { kind: 'draftVersion', version: entry.sharedVersion },
      entryId: args.entryId,
      collection: args.collection,
      refs: extractAssetRefsFromValues(entry.shared, { locale: null }),
    },
    'canonical',
  )
  for (const locale of [...new Set(args.affectedLocales)]) {
    const row = drafts.byLocale[locale]
    if (!row) {
      throwCmsError('ENTRY_LOCALE_DRAFT_MISSING', `No draft exists for locale "${locale}".`)
    }
    await replaceAssetRefs(
      ctx,
      {
        sourceKind: 'draft',
        sourceId: `${args.entryId}:${locale}`,
        sourceFence: { kind: 'draftVersion', version: row.version },
        entryId: args.entryId,
        collection: args.collection,
        refs: uniqueAssetRefs([
          ...extractAssetRefsFromValues(row.values, { locale }),
          ...extractAssetRefsFromText(row.bodyMdc, { fieldPath: 'bodyMdc', locale }),
        ]),
      },
      'canonical',
    )
  }
  const collection = await getCollectionOrThrow(ctx, args.collection)
  await refreshDraftSearchEntriesForEntry(ctx, entry._id, collection)
}

export async function computePublishDraftHash(
  ctx: QueryOrMutationCtx,
  args: { entryId: Id<'entries'>; locales: string[] },
): Promise<string> {
  const [entry, drafts, installed] = await Promise.all([
    ctx.db.get(args.entryId),
    readDraftRows(ctx, args.entryId),
    readInstalledCmsContract(ctx),
  ])
  if (!entry) throwCmsError('ENTRY_NOT_FOUND', 'Entry not found.')
  return stableHash({
    entryId: String(entry._id),
    collection: entry.collection,
    contract: installed?.record.contentHash ?? null,
    draftVersion: entry.draftVersion,
    sharedVersion: entry.sharedVersion,
    shared: entry.shared,
    slug: entry.slug,
    parentEntryId: entry.parentEntryId ? String(entry.parentEntryId) : null,
    orderRank: entry.orderRank,
    locales: [...new Set(args.locales)].sort().map((locale) => {
      const row = drafts.byLocale[locale]
      return row
        ? { locale, slug: row.slug, values: row.values, bodyMdc: row.bodyMdc, version: row.version }
        : { locale, missing: true }
    }),
  })
}

export async function buildDraftSnapshots(
  ctx: QueryOrMutationCtx,
  entry: Doc<'entries'>,
  collection: CmsCollection,
  locales: string[],
  parseBody: boolean,
): Promise<RevisionSnapshots> {
  const rows = await readDraftRows(ctx, entry._id)
  const snapshots: RevisionSnapshots = {}
  for (const locale of [...new Set(locales)]) {
    assertCollectionSupportsLocale(collection, locale)
    const row = rows.byLocale[locale]
    if (!row) throwCmsError('ENTRY_LOCALE_DRAFT_MISSING', `No draft exists for locale "${locale}".`)
    assertMdcBodyWithinLimit(row.bodyMdc, { locale, field: 'bodyMdc' })
    const draftSlug = row.slug ?? entry.slug
    const slug = isRouteBackedCollection(collection) ? draftSlug : entry.stableId
    if (isRouteBackedCollection(collection)) assertValidSlug(slug)
    const merged = materializeFieldData(collection.fields, entry.shared, row.values)
    assertFieldDataValid(collection.fields, merged, { publish: parseBody })
    if (parseBody) await parseMdcBody(row.bodyMdc)
    snapshots[locale] = {
      shared: entry.shared,
      values: row.values,
      bodyMdc: row.bodyMdc,
      slug,
      parentEntryId: entry.parentEntryId,
      orderRank: entry.orderRank,
      sharedVersion: entry.sharedVersion,
      localeVersion: row.version,
    }
  }
  return snapshots
}

export async function replaceRevisionAssetRefs(
  ctx: MutationCtx,
  args: {
    revisionId: Id<'entryRevisions'>
    entry: Doc<'entries'>
    snapshots: RevisionSnapshots
  },
): Promise<void> {
  const revision = await ctx.db.get(args.revisionId)
  if (!revision || revision.entryId !== args.entry._id) {
    throwCmsError('ENTRY_VERSION_NOT_FOUND', 'Version not found.')
  }
  for (const [locale, snapshot] of Object.entries(args.snapshots)) {
    await replaceAssetRefs(
      ctx,
      {
        sourceKind: 'revision',
        sourceId: `${String(args.revisionId)}:${locale}`,
        sourceFence: {
          kind: 'revision',
          revisionId: revision._id,
          contentHash: revision.contentHash,
        },
        entryId: args.entry._id,
        collection: args.entry.collection,
        refs: uniqueAssetRefs([
          ...extractAssetRefsFromValues(snapshot.shared, { locale: null }),
          ...extractAssetRefsFromValues(snapshot.values, { locale }),
          ...extractAssetRefsFromText(snapshot.bodyMdc, { fieldPath: 'bodyMdc', locale }),
        ]),
      },
      'canonical',
    )
  }
}
