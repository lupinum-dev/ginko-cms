import {
  normalizeContentPath,
  uniqueContentTags,
} from '@lupinum/ginko-cms-contract/shared/contentTags.js'

import type { Doc, Id } from '../../_generated/dataModel.js'
import { throwCmsError } from '../../errors.js'
import { logActivity } from '../../lib/activity.js'
import {
  getCollectionOrThrow,
  isRouteBackedCollection,
  needsStableId,
} from '../../lib/collections.js'
import { assertCmsContractWritable } from '../../lib/installedContract.js'
import { pathPrefixForLocale, rootSlugForLocale } from '../../lib/paths.js'
import { enqueueRevalidationEvent } from '../../lib/revalidationOutbox.js'
import type { CmsCollection, MutationCtx, QueryOrMutationCtx } from '../../lib/types.js'
import { scheduleRevalidationOutboxDelivery } from '../../revalidation.js'
import { replaceAssetRefs } from './assetRefs.js'
import {
  buildDraftSnapshots,
  computePublishDraftHash,
  replaceRevisionAssetRefs,
} from './draftCommands.js'
import { refreshDraftSearchEntriesForEntry } from './draftSearch.js'
import { stableHash } from './hashing.js'
import { buildCheckedPublicProjectionDocuments, upsertPublicProjection } from './projection.js'
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

export const workflowOperationId = (
  kind: RevisionKind,
  entryId: Id<'entries'>,
  now: number,
): string => `${kind}:${String(entryId)}:${now}`

function publicSegment(collection: CmsCollection, entry: Doc<'entries'>, slug: string): string {
  if (!isRouteBackedCollection(collection)) return entry.stableId
  return needsStableId(collection) ? `${slug}-${entry.stableId}` : slug
}

export function publicTreeOptions(
  collection: CmsCollection,
  locale: string,
): PublicTreePathOptions {
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

async function upsertRedirectForPathChange(
  ctx: MutationCtx,
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
    redirectId: `${args.operationId}:${args.locale}:${args.oldPath}`,
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

export async function enqueueWorkflowRevalidation(
  ctx: MutationCtx,
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

export async function activateSnapshots(
  ctx: MutationCtx,
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
    await replaceAssetRefs(
      ctx,
      {
        sourceKind: 'public',
        sourceId: `${String(args.entry._id)}:${locale}`,
        sourceFence: { kind: 'publicRevision', revisionId: args.revisionId },
        entryId: args.entry._id,
        collection: args.entry.collection,
        refs: built.assetRefs,
      },
      'canonical',
    )
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

/**
 * Read-only activation validation used by guarded historical rollback previews.
 * It exercises the same route, render, relation, and asset materialization path
 * as activation and returns a compact fence for every derived byte.
 */
export async function validateRevisionSnapshotsForActivation(
  ctx: QueryOrMutationCtx,
  args: {
    entry: Doc<'entries'>
    collection: CmsCollection
    revisionId: Id<'entryRevisions'>
    snapshots: RevisionSnapshots
    stableNow: number
  },
): Promise<{ projectionHash: string }> {
  const materialized: Record<string, unknown> = {}
  for (const [locale, snapshot] of Object.entries(args.snapshots).sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    await assertPublicPlacementAvailable(ctx, {
      entry: args.entry,
      collection: args.collection,
      locale,
      snapshot,
    })
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
      now: args.stableNow,
    })
    built.input.slug = publicSegment(args.collection, args.entry, snapshot.slug)
    buildCheckedPublicProjectionDocuments(built.input)
    materialized[locale] = {
      ...built.input,
      firstPublishedAt: 0,
      lastPublishedAt: 0,
      assetRefs: built.assetRefs,
    }
  }
  return { projectionHash: stableHash(materialized) }
}

export function assertExpectedPublicRevisionIds(
  current: Record<string, Id<'entryRevisions'>>,
  expected: Record<string, Id<'entryRevisions'>>,
  locales: string[],
): void {
  for (const locale of locales) {
    if (current[locale] !== expected[locale]) {
      throwCmsError('PUBLIC_STATE_STALE', `Public locale "${locale}" changed after preview.`)
    }
  }
}

export async function readActiveSnapshots(
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

export async function publishCurrentDraft(
  ctx: MutationCtx,
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
  const installed = await assertCmsContractWritable(ctx)
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
  const snapshots = await buildDraftSnapshots(ctx, entry, collection, locales, true)
  const now = Date.now()
  const kind = args.kind ?? 'publish'
  const operationId = workflowOperationId(kind, entry._id, now)
  const revision = await appendRevision(ctx, {
    entryId: entry._id,
    collection: entry.collection,
    parentRevisionId: entry.latestEditorialRevisionId,
    kind,
    snapshots,
    affectedLocales: locales,
    contentHash: installed.record.contentHash,
    operationId,
    message: args.message ?? null,
    appIdentity: args.appIdentity,
    now,
  })
  const publicationByLocale = new Map(entry.activePublications.map((row) => [row.locale, row]))
  for (const locale of locales) {
    const snapshot = snapshots[locale]!
    const currentPublication = publicationByLocale.get(locale)
    publicationByLocale.set(locale, {
      locale,
      revisionId: revision.revisionId,
      sharedVersion: snapshot.sharedVersion,
      localeVersion: snapshot.localeVersion,
      firstPublishedAt: currentPublication?.firstPublishedAt ?? now,
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
  await refreshDraftSearchEntriesForEntry(ctx, entry._id, collection)
  const effect = await activateSnapshots(ctx, {
    entry,
    collection,
    snapshots,
    revisionId: revision.revisionId,
    appIdentity: args.appIdentity,
    now,
    kind,
    operationId,
  })
  await replaceRevisionAssetRefs(ctx, {
    revisionId: revision.revisionId,
    entry,
    snapshots,
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
