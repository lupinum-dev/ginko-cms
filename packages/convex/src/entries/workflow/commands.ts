/** Canonical entry commands. Public callables delegate here. */

import {
  normalizeContentPath,
  uniqueContentTags,
} from '@lupinum/ginko-cms-contract/shared/contentTags.js'
import { materializeFieldData } from '@lupinum/ginko-cms-contract/shared/fields/materialize.js'
import type { JsonObject, JsonValue } from '@lupinum/ginko-cms-contract/shared/types.js'
import { parseMdcBody } from '@lupinum/ginko-content/cms-contract'

import type { Doc, Id } from '../../_generated/dataModel.js'
import { throwCmsError } from '../../errors.js'
import { logActivity } from '../../lib/activity.js'
import {
  assertCollectionSupportsLocale,
  getCollectionOrThrow,
  isLocalizedSlugMode,
  needsStableId,
} from '../../lib/collections.js'
import { assertCmsContractWritable, readInstalledCmsContract } from '../../lib/installedContract.js'
import { rankAfter } from '../../lib/ordering.js'
import { generateStableId, pathPrefixForLocale, rootSlugForLocale } from '../../lib/paths.js'
import { enqueueRevalidationEvent } from '../../lib/revalidationOutbox.js'
import type { CmsCollection, MutationCtx, QueryOrMutationCtx } from '../../lib/types.js'
import {
  assertFieldDataValid,
  assertValidLocaleCode,
  assertValidSlug,
} from '../../lib/validation.js'
import { scheduleRevalidationOutboxDelivery } from '../../revalidation.js'
import {
  extractAssetRefsFromText,
  extractAssetRefsFromValues,
  replaceAssetRefs,
  uniqueAssetRefs,
} from './assetRefs.js'
import { applyDraftPatch, readDraftRows, type SaveDraftPatch } from './drafts.js'
import { stableHash } from './hashing.js'
import {
  deleteAllPublicProjections,
  deletePublicProjection,
  readPublicRevisionIdsByLocale,
  upsertPublicProjection,
} from './projection.js'
import { buildPublicProjectionFromRevisionSnapshot } from './projectionBuild.js'
import {
  publicPathForEntry,
  publicPathForPlacement,
  validatePublicPlacement,
  validatePublicRedirectCandidate,
  type PublicTreePathOptions,
} from './publicTree.js'
import {
  appendRevision,
  type RevisionKind,
  type RevisionLocaleSnapshot,
  type RevisionSnapshots,
} from './revisions.js'
import { bumpRouteGeneration } from './routeGeneration.js'

type WorkflowMutationCtx = MutationCtx

function operationId(kind: RevisionKind, entryId: Id<'entries'>, now: number): string {
  return `${kind}:${String(entryId)}:${now}`
}

async function activeContractOrThrow(ctx: QueryOrMutationCtx) {
  return await assertCmsContractWritable(ctx)
}

function publicSegment(collection: CmsCollection, entry: Doc<'entries'>, slug: string): string {
  return needsStableId(collection) ? `${slug}-${entry.stableId}` : slug
}

function publicTreeOptions(collection: CmsCollection, locale: string): PublicTreePathOptions {
  return {
    pathPrefix: pathPrefixForLocale(collection, locale),
    rootSlug: rootSlugForLocale(collection, locale),
  }
}

async function publicPathForSnapshot(
  ctx: QueryOrMutationCtx,
  args: {
    entry: Doc<'entries'>
    collection: CmsCollection
    locale: string
    snapshot: RevisionLocaleSnapshot
  },
): Promise<string> {
  const path = await publicPathForPlacement(ctx, {
    collection: args.entry.collection,
    locale: args.locale,
    parentEntryId: args.snapshot.parentEntryId,
    slug: publicSegment(args.collection, args.entry, args.snapshot.slug),
    options: publicTreeOptions(args.collection, args.locale),
  })
  if (!path) {
    throwCmsError('PUBLIC_PARENT_UNREACHABLE', 'Publish the parent before publishing this entry.')
  }
  return path
}

async function assertPublicPlacementAvailable(
  ctx: QueryOrMutationCtx,
  args: {
    entry: Doc<'entries'>
    collection: CmsCollection
    locale: string
    snapshot: RevisionLocaleSnapshot
  },
): Promise<void> {
  const segment = publicSegment(args.collection, args.entry, args.snapshot.slug)
  const issues = await validatePublicPlacement(ctx, {
    collection: args.entry.collection,
    locale: args.locale,
    entryId: args.entry._id,
    parentEntryId: args.snapshot.parentEntryId,
    slug: segment,
    options: publicTreeOptions(args.collection, args.locale),
  })
  if (issues.length) {
    throwCmsError('ENTRY_PUBLISHED_PATH_CONFLICT', issues[0]!.message, {
      locale: args.locale,
      slug: segment,
      issues,
    })
  }
}

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
  ctx: WorkflowMutationCtx,
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
  await activeContractOrThrow(ctx)
  const collection = await getCollectionOrThrow(ctx, args.collection)
  const locale = args.locale ?? collection.locales[0] ?? 'en'
  assertValidLocaleCode(locale, 'ENTRY_LOCALE_INVALID')
  assertCollectionSupportsLocale(collection, locale)
  const slug = collection.routing.singleton ? collection.slug : args.slug
  if (!collection.routing.singleton) assertValidSlug(slug)
  const parentEntryId = await resolveParent(ctx, collection, args.parentEntryId)
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
    now,
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
  ctx: WorkflowMutationCtx,
  args: {
    entryId: Id<'entries'>
    collection: string
    sharedUpdated: boolean
    affectedLocales: string[]
    now: number
  },
): Promise<void> {
  const drafts = await readDraftRows(ctx, args.entryId)
  if (args.sharedUpdated) {
    await replaceAssetRefs(ctx, {
      sourceKind: 'draft',
      sourceId: `${args.entryId}:shared`,
      entryId: args.entryId,
      collection: args.collection,
      refs: extractAssetRefsFromValues(drafts.shared?.shared ?? {}, { locale: null }),
      now: args.now,
    })
  }
  for (const locale of [...new Set(args.affectedLocales)]) {
    const row = drafts.byLocale[locale]
    await replaceAssetRefs(ctx, {
      sourceKind: 'draft',
      sourceId: `${args.entryId}:${locale}`,
      entryId: args.entryId,
      collection: args.collection,
      refs: uniqueAssetRefs([
        ...extractAssetRefsFromValues(row?.values ?? {}, { locale }),
        ...extractAssetRefsFromText(row?.bodyMdc ?? '', { fieldPath: 'bodyMdc', locale }),
      ]),
      now: args.now,
    })
  }
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

async function draftSnapshots(
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
    const slug = row.slug ?? entry.slug
    assertValidSlug(slug)
    const merged = materializeFieldData(collection.fields, entry.shared, row.values)
    assertFieldDataValid(collection.fields, merged, { publish: parseBody })
    const parsed = parseBody ? await parseMdcBody(row.bodyMdc) : null
    snapshots[locale] = {
      shared: entry.shared,
      values: row.values,
      bodyMdc: row.bodyMdc,
      ...(parsed
        ? {
            bodyAst: parsed.body as unknown as JsonValue,
            searchText: parsed.searchText,
            toc: (parsed.toc as unknown as JsonValue | null) ?? null,
          }
        : {}),
      slug,
      parentEntryId: entry.parentEntryId,
      orderRank: entry.orderRank,
      sharedVersion: entry.sharedVersion,
      localeVersion: row.version,
    }
  }
  return snapshots
}

async function replaceRevisionAssetRefs(
  ctx: WorkflowMutationCtx,
  args: {
    revisionId: Id<'entryRevisions'>
    entry: Doc<'entries'>
    snapshots: RevisionSnapshots
    now: number
  },
): Promise<void> {
  for (const [locale, snapshot] of Object.entries(args.snapshots)) {
    await replaceAssetRefs(ctx, {
      sourceKind: 'revision',
      sourceId: `${String(args.revisionId)}:${locale}`,
      entryId: args.entry._id,
      collection: args.entry.collection,
      refs: uniqueAssetRefs([
        ...extractAssetRefsFromValues(snapshot.shared, { locale: null }),
        ...extractAssetRefsFromValues(snapshot.values, { locale }),
        ...extractAssetRefsFromText(snapshot.bodyMdc, { fieldPath: 'bodyMdc', locale }),
      ]),
      now: args.now,
    })
  }
}

async function upsertRedirectForPathChange(
  ctx: WorkflowMutationCtx,
  args: {
    entry: Doc<'entries'>
    collection: CmsCollection
    locale: string
    oldPath: string | null
    newPath: string
    operationId: string
    appIdentity: string
    now: number
  },
): Promise<void> {
  if (!args.oldPath || args.oldPath === args.newPath) return
  const existing = await ctx.db
    .query('redirects')
    .withIndex('by_collection_locale_state_from', (q) =>
      q
        .eq('collection', args.entry.collection)
        .eq('locale', args.locale)
        .eq('state', 'active')
        .eq('fromPath', args.oldPath!),
    )
    .first()
  if (existing && existing.targetEntryId !== args.entry._id) {
    throwCmsError('REDIRECT_SOURCE_CONFLICT', 'An active redirect already owns the old path.')
  }
  if (existing) return
  const child = await ctx.db
    .query('publicEntries')
    .withIndex('by_collection_locale_parent_orderKey', (q) =>
      q
        .eq('collection', args.entry.collection)
        .eq('locale', args.locale)
        .eq('parentEntryId', args.entry._id),
    )
    .first()
  const redirectKind = child ? 'prefix' : 'exact'
  const validation = await validatePublicRedirectCandidate(ctx, {
    collection: args.entry.collection,
    locale: args.locale,
    kind: redirectKind,
    fromPath: args.oldPath,
    targetEntryId: args.entry._id,
    options: publicTreeOptions(args.collection, args.locale),
  })
  if (!validation.ok) {
    throwCmsError('REDIRECT_INVALID', validation.issues[0]!.message, {
      issues: validation.issues,
    })
  }
  await ctx.db.insert('redirects', {
    collection: args.entry.collection,
    locale: args.locale,
    kind: redirectKind,
    fromPath: args.oldPath,
    targetEntryId: args.entry._id,
    state: 'active',
    statusCode: 308,
    source: 'publish',
    operationId: args.operationId,
    createdBy: args.appIdentity,
    createdAt: args.now,
    retiredBy: null,
    retiredAt: null,
    updatedAt: args.now,
  })
  await bumpRouteGeneration(ctx, args.entry.collection, args.locale, args.now)
}

async function enqueueWorkflowRevalidation(
  ctx: WorkflowMutationCtx,
  args: {
    kind: 'publish' | 'unpublish' | 'archive' | 'rollback'
    entry: Doc<'entries'>
    revisionId: Id<'entryRevisions'>
    tags: string[]
    paths: string[]
    appIdentity: string
    now: number
  },
): Promise<void> {
  await enqueueRevalidationEvent(ctx, {
    idempotencyKey: `content.revalidate:${args.kind}:${String(args.entry._id)}:${String(args.revisionId)}`,
    versionId: String(args.revisionId),
    tags: uniqueContentTags(args.tags),
    paths: uniqueContentTags(args.paths.map(normalizeContentPath)),
    payload: {
      reason: args.kind,
      collection: args.entry.collection,
      entryId: String(args.entry._id),
      appIdentityId: args.appIdentity,
      revisionId: String(args.revisionId),
    },
    now: args.now,
  })
  await scheduleRevalidationOutboxDelivery(ctx)
}

async function activateSnapshots(
  ctx: WorkflowMutationCtx,
  args: {
    entry: Doc<'entries'>
    collection: CmsCollection
    snapshots: RevisionSnapshots
    revisionId: Id<'entryRevisions'>
    appIdentity: string
    now: number
    kind: 'publish' | 'rollback'
    operationId: string
  },
): Promise<{ paths: string[]; tags: string[] }> {
  const paths: string[] = []
  const tags: string[] = []
  for (const [locale, snapshot] of Object.entries(args.snapshots)) {
    await assertPublicPlacementAvailable(ctx, {
      entry: args.entry,
      collection: args.collection,
      locale,
      snapshot,
    })
    const oldRow = await ctx.db
      .query('publicEntries')
      .withIndex('by_entry_locale', (q) => q.eq('entryId', args.entry._id).eq('locale', locale))
      .unique()
    const oldPath = oldRow
      ? await publicPathForEntry(ctx, oldRow, publicTreeOptions(args.collection, locale))
      : null
    if (oldRow) {
      if (oldPath) paths.push(oldPath)
      tags.push(...oldRow.cacheTags)
    }
    const publicPath = await publicPathForSnapshot(ctx, {
      entry: args.entry,
      collection: args.collection,
      locale,
      snapshot,
    })
    const built = await buildPublicProjectionFromRevisionSnapshot(ctx, {
      entry: args.entry,
      collection: args.collection,
      revisionId: args.revisionId,
      locale,
      localeSnapshot: snapshot,
      publicPath,
      now: args.now,
    })
    built.input.slug = publicSegment(args.collection, args.entry, snapshot.slug)
    await upsertPublicProjection(ctx, built.input)
    await replaceAssetRefs(ctx, {
      sourceKind: 'public',
      sourceId: `${String(args.entry._id)}:${locale}`,
      entryId: args.entry._id,
      collection: args.entry.collection,
      refs: built.assetRefs,
      now: args.now,
    })
    await upsertRedirectForPathChange(ctx, {
      entry: args.entry,
      collection: args.collection,
      locale,
      oldPath,
      newPath: publicPath,
      operationId: args.operationId,
      appIdentity: args.appIdentity,
      now: args.now,
    })
    paths.push(publicPath)
    tags.push(...built.input.cacheTags!)
  }
  return { paths, tags }
}

export async function publishCurrentDraft(
  ctx: WorkflowMutationCtx,
  args: {
    entryId: Id<'entries'>
    locales: string[]
    expectedDraftVersion: number
    expectedDraftHash: string
    appIdentity: string
    kind?: 'publish' | 'rollback'
    message?: string | null
  },
): Promise<{ revisionId: Id<'entryRevisions'>; affectedLocales: string[] }> {
  const installed = await activeContractOrThrow(ctx)
  const entry = await ctx.db.get(args.entryId)
  if (!entry) throwCmsError('ENTRY_NOT_FOUND', 'Entry not found.')
  if (entry.lifecycle !== 'active')
    throwCmsError('ENTRY_ARCHIVED', 'Archived entries cannot publish.')
  if (entry.draftVersion !== args.expectedDraftVersion) {
    throwCmsError('ENTRY_DRAFT_STALE', 'The draft changed after preview.', {
      expected: args.expectedDraftVersion,
      actual: entry.draftVersion,
    })
  }
  const locales = [...new Set(args.locales)].sort()
  if (!locales.length) throwCmsError('ENTRY_LOCALES_REQUIRED', 'Select at least one locale.')
  const currentHash = await computePublishDraftHash(ctx, { entryId: entry._id, locales })
  if (currentHash !== args.expectedDraftHash) {
    throwCmsError('ENTRY_DRAFT_STALE', 'The publish preview no longer matches the draft.')
  }
  const collection = await getCollectionOrThrow(ctx, entry.collection)
  const snapshots = await draftSnapshots(ctx, entry, collection, locales, true)
  const now = Date.now()
  const kind = args.kind ?? 'publish'
  const opId = operationId(kind, entry._id, now)
  const revision = await appendRevision(ctx, {
    entryId: entry._id,
    collection: entry.collection,
    parentRevisionId: entry.latestEditorialRevisionId,
    kind,
    snapshots,
    affectedLocales: locales,
    contentHash: installed.record.contentHash,
    operationId: opId,
    message: args.message ?? null,
    appIdentity: args.appIdentity,
    now,
  })
  const publicationByLocale = new Map(entry.activePublications.map((row) => [row.locale, row]))
  for (const locale of locales) {
    const snapshot = snapshots[locale]!
    publicationByLocale.set(locale, {
      locale,
      revisionId: revision.revisionId,
      sharedVersion: snapshot.sharedVersion,
      localeVersion: snapshot.localeVersion,
      activatedAt: now,
      activatedBy: args.appIdentity,
    })
  }
  await ctx.db.patch(entry._id, {
    activePublications: [...publicationByLocale.values()].sort((a, b) =>
      a.locale.localeCompare(b.locale),
    ),
    latestEditorialRevisionId: revision.revisionId,
    updatedBy: args.appIdentity,
    updatedAt: now,
  })
  const effect = await activateSnapshots(ctx, {
    entry,
    collection,
    snapshots,
    revisionId: revision.revisionId,
    appIdentity: args.appIdentity,
    now,
    kind,
    operationId: opId,
  })
  await replaceRevisionAssetRefs(ctx, {
    revisionId: revision.revisionId,
    entry,
    snapshots,
    now,
  })
  await logActivity(ctx, {
    kind: kind === 'rollback' ? 'entry.public-rolled-back' : 'entry.published',
    summary: kind === 'rollback' ? 'Rolled back public output' : 'Published entry',
    appIdentityId: args.appIdentity,
    entryId: entry._id,
    collection: entry.collection,
    detail: { locales, revisionId: String(revision.revisionId) },
    createdAt: now,
  })
  await enqueueWorkflowRevalidation(ctx, {
    kind,
    entry,
    revisionId: revision.revisionId,
    tags: effect.tags,
    paths: effect.paths,
    appIdentity: args.appIdentity,
    now,
  })
  return { revisionId: revision.revisionId, affectedLocales: locales }
}

function assertExpectedPublicRevisionIds(
  current: Record<string, Id<'entryRevisions'>>,
  expected: Record<string, Id<'entryRevisions'>>,
  locales: string[],
): void {
  for (const locale of locales) {
    if (!expected[locale] || current[locale] !== expected[locale]) {
      throwCmsError('PUBLIC_STATE_STALE', `Public locale "${locale}" changed after preview.`)
    }
  }
}

async function activeSnapshots(
  ctx: QueryOrMutationCtx,
  entry: Doc<'entries'>,
  locales: string[],
): Promise<RevisionSnapshots> {
  const snapshots: RevisionSnapshots = {}
  for (const locale of locales) {
    const pointer = entry.activePublications.find((row) => row.locale === locale)
    if (!pointer) continue
    const revision = await ctx.db.get(pointer.revisionId)
    const snapshot = revision?.snapshots[locale]
    if (!snapshot) {
      throw new Error(`Active publication ${pointer.revisionId} has no ${locale} snapshot`)
    }
    snapshots[locale] = snapshot
  }
  return snapshots
}

export async function unpublishCurrentPublic(
  ctx: WorkflowMutationCtx,
  args: {
    entryId: Id<'entries'>
    locales: string[]
    expectedPublicRevisionIds: Record<string, Id<'entryRevisions'>>
    appIdentity: string
  },
): Promise<{
  revisionId: Id<'entryRevisions'>
  affectedLocales: string[]
  remainingLocales: string[]
}> {
  const installed = await activeContractOrThrow(ctx)
  const entry = await ctx.db.get(args.entryId)
  if (!entry) throwCmsError('ENTRY_NOT_FOUND', 'Entry not found.')
  const locales = [...new Set(args.locales)].sort()
  if (!locales.length) throwCmsError('ENTRY_LOCALES_REQUIRED', 'Select at least one locale.')
  const current = await readPublicRevisionIdsByLocale(ctx, entry._id)
  assertExpectedPublicRevisionIds(current, args.expectedPublicRevisionIds, locales)
  const snapshots = await activeSnapshots(ctx, entry, locales)
  const oldRows = (
    await Promise.all(
      locales.map((locale) =>
        ctx.db
          .query('publicEntries')
          .withIndex('by_entry_locale', (q) => q.eq('entryId', entry._id).eq('locale', locale))
          .unique(),
      ),
    )
  ).filter((row): row is Doc<'publicEntries'> => row !== null)
  const collection = await getCollectionOrThrow(ctx, entry.collection)
  const paths = (
    await Promise.all(
      oldRows.map((row) => publicPathForEntry(ctx, row, publicTreeOptions(collection, row.locale))),
    )
  ).filter((path): path is string => path !== null)
  const tags = oldRows.flatMap((row) => row.cacheTags)
  const now = Date.now()
  const opId = operationId('unpublish', entry._id, now)
  const revision = await appendRevision(ctx, {
    entryId: entry._id,
    collection: entry.collection,
    parentRevisionId: entry.latestEditorialRevisionId,
    kind: 'unpublish',
    snapshots,
    affectedLocales: locales,
    contentHash: installed.record.contentHash,
    operationId: opId,
    message: null,
    appIdentity: args.appIdentity,
    now,
  })
  for (const locale of locales) {
    await deletePublicProjection(ctx, { entryId: entry._id, locale })
    await replaceAssetRefs(ctx, {
      sourceKind: 'public',
      sourceId: `${String(entry._id)}:${locale}`,
      entryId: entry._id,
      collection: entry.collection,
      refs: [],
      now,
    })
  }
  const remaining = entry.activePublications.filter((row) => !locales.includes(row.locale))
  await ctx.db.patch(entry._id, {
    activePublications: remaining,
    latestEditorialRevisionId: revision.revisionId,
    updatedBy: args.appIdentity,
    updatedAt: now,
  })
  await replaceRevisionAssetRefs(ctx, { revisionId: revision.revisionId, entry, snapshots, now })
  await logActivity(ctx, {
    kind: 'entry.unpublished',
    summary: 'Unpublished entry locales',
    appIdentityId: args.appIdentity,
    entryId: entry._id,
    collection: entry.collection,
    detail: { locales, revisionId: String(revision.revisionId) },
    createdAt: now,
  })
  await enqueueWorkflowRevalidation(ctx, {
    kind: 'unpublish',
    entry,
    revisionId: revision.revisionId,
    tags,
    paths,
    appIdentity: args.appIdentity,
    now,
  })
  return {
    revisionId: revision.revisionId,
    affectedLocales: locales,
    remainingLocales: remaining.map((row) => row.locale).sort(),
  }
}

export async function archiveCurrentEntry(
  ctx: WorkflowMutationCtx,
  args: {
    entryId: Id<'entries'>
    expectedPublicRevisionIds: Record<string, Id<'entryRevisions'>>
    appIdentity: string
  },
): Promise<{ revisionId: Id<'entryRevisions'>; affectedLocales: string[] }> {
  const installed = await activeContractOrThrow(ctx)
  const entry = await ctx.db.get(args.entryId)
  if (!entry) throwCmsError('ENTRY_NOT_FOUND', 'Entry not found.')
  const current = await readPublicRevisionIdsByLocale(ctx, entry._id)
  const locales = Object.keys(current).sort()
  if (Object.keys(args.expectedPublicRevisionIds).length !== locales.length) {
    throwCmsError('PUBLIC_STATE_STALE', 'Public locales changed after preview.')
  }
  assertExpectedPublicRevisionIds(current, args.expectedPublicRevisionIds, locales)
  const snapshots = await activeSnapshots(ctx, entry, locales)
  const collection = await getCollectionOrThrow(ctx, entry.collection)
  const oldRows = await ctx.db
    .query('publicEntries')
    .withIndex('by_entry_locale', (q) => q.eq('entryId', entry._id))
    .collect()
  const paths = (
    await Promise.all(
      oldRows.map((row) => publicPathForEntry(ctx, row, publicTreeOptions(collection, row.locale))),
    )
  ).filter((path): path is string => path !== null)
  const tags = oldRows.flatMap((row) => row.cacheTags)
  const now = Date.now()
  const revision = await appendRevision(ctx, {
    entryId: entry._id,
    collection: entry.collection,
    parentRevisionId: entry.latestEditorialRevisionId,
    kind: 'archive',
    snapshots,
    affectedLocales: locales,
    contentHash: installed.record.contentHash,
    operationId: operationId('archive', entry._id, now),
    message: null,
    appIdentity: args.appIdentity,
    now,
  })
  await deleteAllPublicProjections(ctx, entry._id)
  for (const locale of locales) {
    await replaceAssetRefs(ctx, {
      sourceKind: 'public',
      sourceId: `${String(entry._id)}:${locale}`,
      entryId: entry._id,
      collection: entry.collection,
      refs: [],
      now,
    })
  }
  await ctx.db.patch(entry._id, {
    lifecycle: 'archived',
    activePublications: [],
    latestEditorialRevisionId: revision.revisionId,
    updatedBy: args.appIdentity,
    updatedAt: now,
  })
  await replaceRevisionAssetRefs(ctx, { revisionId: revision.revisionId, entry, snapshots, now })
  await logActivity(ctx, {
    kind: 'entry.archived',
    summary: 'Archived entry',
    appIdentityId: args.appIdentity,
    entryId: entry._id,
    collection: entry.collection,
    detail: { locales, revisionId: String(revision.revisionId) },
    createdAt: now,
  })
  await enqueueWorkflowRevalidation(ctx, {
    kind: 'archive',
    entry,
    revisionId: revision.revisionId,
    tags,
    paths,
    appIdentity: args.appIdentity,
    now,
  })
  return { revisionId: revision.revisionId, affectedLocales: locales }
}

export async function restoreArchivedEntry(
  ctx: WorkflowMutationCtx,
  args: {
    entryId: Id<'entries'>
    expectedDraftVersion: number
    appIdentity: string
  },
): Promise<{ revisionId: Id<'entryRevisions'> }> {
  const installed = await activeContractOrThrow(ctx)
  const entry = await ctx.db.get(args.entryId)
  if (!entry) throwCmsError('ENTRY_NOT_FOUND', 'Entry not found.')
  if (entry.lifecycle !== 'archived') {
    throwCmsError('ENTRY_RESTORE_NOT_ARCHIVED', 'Only archived entries can be restored.', {
      entryId: String(entry._id),
      status: entry.lifecycle,
    })
  }
  if (entry.draftVersion !== args.expectedDraftVersion) {
    throwCmsError('ENTRY_DRAFT_STALE', 'The draft changed before restore.')
  }

  const collection = await getCollectionOrThrow(ctx, entry.collection)
  const rows = await ctx.db
    .query('entryLocaleDrafts')
    .withIndex('by_entry', (q) => q.eq('entryId', entry._id))
    .collect()
  const locales = rows.map((row) => row.locale).sort()
  const snapshots = await draftSnapshots(ctx, entry, collection, locales, false)
  const now = Date.now()
  const revision = await appendRevision(ctx, {
    entryId: entry._id,
    collection: entry.collection,
    parentRevisionId: entry.latestEditorialRevisionId,
    kind: 'restore',
    snapshots,
    affectedLocales: locales,
    contentHash: installed.record.contentHash,
    operationId: operationId('restore', entry._id, now),
    message: 'Restored archived editorial record',
    appIdentity: args.appIdentity,
    now,
  })
  await ctx.db.patch(entry._id, {
    lifecycle: 'active',
    latestEditorialRevisionId: revision.revisionId,
    updatedAt: now,
    updatedBy: args.appIdentity,
    draftVersion: entry.draftVersion + 1,
  })
  await replaceRevisionAssetRefs(ctx, { revisionId: revision.revisionId, entry, snapshots, now })
  await logActivity(ctx, {
    kind: 'entry.restored',
    summary: 'Restored entry',
    appIdentityId: args.appIdentity,
    entryId: entry._id,
    collection: entry.collection,
    detail: { revisionId: String(revision.revisionId) },
    createdAt: now,
  })
  return { revisionId: revision.revisionId }
}

export async function createDraftCheckpoint(
  ctx: WorkflowMutationCtx,
  args: { entryId: Id<'entries'>; appIdentity: string; message?: string | null },
): Promise<Id<'entryRevisions'>> {
  const installed = await activeContractOrThrow(ctx)
  const entry = await ctx.db.get(args.entryId)
  if (!entry) throwCmsError('ENTRY_NOT_FOUND', 'Entry not found.')
  const collection = await getCollectionOrThrow(ctx, entry.collection)
  const rows = await ctx.db
    .query('entryLocaleDrafts')
    .withIndex('by_entry', (q) => q.eq('entryId', entry._id))
    .collect()
  const locales = rows.map((row) => row.locale).sort()
  const snapshots = await draftSnapshots(ctx, entry, collection, locales, false)
  const now = Date.now()
  const revision = await appendRevision(ctx, {
    entryId: entry._id,
    collection: entry.collection,
    parentRevisionId: entry.latestEditorialRevisionId,
    kind: 'checkpoint',
    snapshots,
    affectedLocales: locales,
    contentHash: installed.record.contentHash,
    operationId: operationId('checkpoint', entry._id, now),
    message: args.message ?? null,
    appIdentity: args.appIdentity,
    now,
  })
  await ctx.db.patch(entry._id, { latestEditorialRevisionId: revision.revisionId })
  await replaceRevisionAssetRefs(ctx, { revisionId: revision.revisionId, entry, snapshots, now })
  await logActivity(ctx, {
    kind: 'entry.checkpointed',
    summary: 'Created draft checkpoint',
    appIdentityId: args.appIdentity,
    entryId: entry._id,
    collection: entry.collection,
    detail: { revisionId: String(revision.revisionId) },
    createdAt: now,
  })
  return revision.revisionId
}

export async function restoreRevisionSnapshotToDraft(
  ctx: WorkflowMutationCtx,
  args: {
    entry: Doc<'entries'>
    sourceRevision: Doc<'entryRevisions'>
    appIdentity: string
    now: number
    expectedDraftVersion: number
  },
) {
  if (args.entry.draftVersion !== args.expectedDraftVersion) {
    throwCmsError('ENTRY_DRAFT_STALE', 'The draft changed before restore.')
  }
  await createDraftCheckpoint(ctx, {
    entryId: args.entry._id,
    appIdentity: args.appIdentity,
    message: `Before restore of revision ${args.sourceRevision.revisionNumber}`,
  })
  const locales = Object.keys(args.sourceRevision.snapshots).sort()
  if (!locales.length)
    throwCmsError('REVISION_SNAPSHOT_EMPTY', 'Revision contains no restorable locales.')
  const first = args.sourceRevision.snapshots[locales[0]!]!
  const patch: SaveDraftPatch = {
    shared: {
      shared: first.shared,
      slug: first.slug,
      parentEntryId: first.parentEntryId,
      orderRank: first.orderRank,
    },
    locales: Object.fromEntries(
      locales.map((locale) => {
        const snapshot = args.sourceRevision.snapshots[locale]!
        return [locale, { slug: snapshot.slug, values: snapshot.values, bodyMdc: snapshot.bodyMdc }]
      }),
    ),
  }
  const result = await applyDraftPatch(ctx, {
    entryId: args.entry._id,
    expectedDraftVersion: args.expectedDraftVersion,
    patch,
    appIdentity: args.appIdentity,
    now: args.now,
  })
  await refreshDraftAssetRefsForSave(ctx, {
    entryId: args.entry._id,
    collection: args.entry.collection,
    sharedUpdated: result.sharedUpdated,
    affectedLocales: result.affectedLocales,
    now: args.now,
  })
  const installed = await activeContractOrThrow(ctx)
  const refreshed = await ctx.db.get(args.entry._id)
  if (!refreshed) throwCmsError('ENTRY_NOT_FOUND', 'Entry disappeared during restore.')
  const collection = await getCollectionOrThrow(ctx, refreshed.collection)
  const snapshots = await draftSnapshots(ctx, refreshed, collection, locales, false)
  const revision = await appendRevision(ctx, {
    entryId: refreshed._id,
    collection: refreshed.collection,
    parentRevisionId: refreshed.latestEditorialRevisionId,
    kind: 'restore',
    snapshots,
    affectedLocales: locales,
    contentHash: installed.record.contentHash,
    operationId: operationId('restore', refreshed._id, args.now),
    message: `Restored revision ${args.sourceRevision.revisionNumber} to draft`,
    appIdentity: args.appIdentity,
    now: args.now,
  })
  await ctx.db.patch(refreshed._id, { latestEditorialRevisionId: revision.revisionId })
  await replaceRevisionAssetRefs(ctx, {
    revisionId: revision.revisionId,
    entry: refreshed,
    snapshots,
    now: args.now,
  })
  await logActivity(ctx, {
    kind: 'entry.draft-restored',
    summary: 'Restored historical version to draft',
    appIdentityId: args.appIdentity,
    entryId: refreshed._id,
    collection: refreshed.collection,
    detail: {
      sourceRevisionId: String(args.sourceRevision._id),
      restoreRevisionId: String(revision.revisionId),
    },
    createdAt: args.now,
  })
  return result
}

/** Activate compatible historical output without modifying the current draft. */
export async function rollbackPublicToRevision(
  ctx: WorkflowMutationCtx,
  args: {
    entryId: Id<'entries'>
    sourceRevisionId: Id<'entryRevisions'>
    locales?: string[]
    expectedPublicRevisionIds: Record<string, Id<'entryRevisions'>>
    appIdentity: string
    message?: string | null
  },
): Promise<{ revisionId: Id<'entryRevisions'>; affectedLocales: string[] }> {
  const installed = await activeContractOrThrow(ctx)
  const [entry, source] = await Promise.all([
    ctx.db.get(args.entryId),
    ctx.db.get(args.sourceRevisionId),
  ])
  if (!entry || !source || source.entryId !== args.entryId) {
    throwCmsError('REVISION_NOT_FOUND', 'Historical publication not found.')
  }
  if (source.contentHash !== installed.record.contentHash) {
    throwCmsError(
      'REVISION_CONTRACT_MISMATCH',
      'Historical output is incompatible with this contract.',
    )
  }
  const locales = [...new Set(args.locales ?? Object.keys(source.snapshots))].sort()
  const current = await readPublicRevisionIdsByLocale(ctx, entry._id)
  const currentlyLive = locales.filter((locale) => current[locale])
  assertExpectedPublicRevisionIds(current, args.expectedPublicRevisionIds, currentlyLive)
  const snapshots = Object.fromEntries(
    locales.map((locale) => {
      const snapshot = source.snapshots[locale]
      if (!snapshot) throwCmsError('REVISION_LOCALE_MISSING', `Revision has no ${locale} snapshot.`)
      return [locale, snapshot]
    }),
  )
  const collection = await getCollectionOrThrow(ctx, entry.collection)
  const now = Date.now()
  const opId = operationId('rollback', entry._id, now)
  const revision = await appendRevision(ctx, {
    entryId: entry._id,
    collection: entry.collection,
    parentRevisionId: entry.latestEditorialRevisionId,
    kind: 'rollback',
    snapshots,
    affectedLocales: locales,
    contentHash: installed.record.contentHash,
    operationId: opId,
    message: args.message ?? `Rolled back to revision ${source.revisionNumber}`,
    appIdentity: args.appIdentity,
    now,
  })
  const publicationByLocale = new Map(entry.activePublications.map((row) => [row.locale, row]))
  for (const locale of locales) {
    const snapshot = snapshots[locale]!
    publicationByLocale.set(locale, {
      locale,
      revisionId: revision.revisionId,
      sharedVersion: snapshot.sharedVersion,
      localeVersion: snapshot.localeVersion,
      activatedAt: now,
      activatedBy: args.appIdentity,
    })
  }
  await ctx.db.patch(entry._id, {
    activePublications: [...publicationByLocale.values()].sort((a, b) =>
      a.locale.localeCompare(b.locale),
    ),
    latestEditorialRevisionId: revision.revisionId,
    updatedBy: args.appIdentity,
    updatedAt: now,
  })
  const effect = await activateSnapshots(ctx, {
    entry,
    collection,
    snapshots,
    revisionId: revision.revisionId,
    appIdentity: args.appIdentity,
    now,
    kind: 'rollback',
    operationId: opId,
  })
  await replaceRevisionAssetRefs(ctx, { revisionId: revision.revisionId, entry, snapshots, now })
  await logActivity(ctx, {
    kind: 'entry.public-rolled-back',
    summary: 'Rolled back public output',
    appIdentityId: args.appIdentity,
    entryId: entry._id,
    collection: entry.collection,
    detail: { sourceRevisionId: String(source._id), locales },
    createdAt: now,
  })
  await enqueueWorkflowRevalidation(ctx, {
    kind: 'rollback',
    entry,
    revisionId: revision.revisionId,
    tags: effect.tags,
    paths: effect.paths,
    appIdentity: args.appIdentity,
    now,
  })
  return { revisionId: revision.revisionId, affectedLocales: locales }
}
