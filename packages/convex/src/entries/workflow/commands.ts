// Shared entry workflow helpers. Public callable mutations live in
// `entries/tree`, `entries/draft`, and `entries/publish`; this file should not
// grow a second command surface.

import {
  normalizeContentPath,
  uniqueContentTags,
} from '@lupinum/ginko-cms-contract/shared/contentTags.js'
import { materializeFieldData } from '@lupinum/ginko-cms-contract/shared/fields/materialize.js'
import type { JsonObject } from '@lupinum/ginko-cms-contract/shared/types.js'
import { parseMdcBody, type ParseMdcBodyResult } from '@lupinum/ginko-content/cms-contract'

import type { Doc, Id } from '../../_generated/dataModel.js'
import { previewPublishImpactForEntry } from '../../diagnostics.js'
import { throwCmsError } from '../../errors.js'
import { logActivity } from '../../lib/activity.js'
import { getCollectionOrThrow, isLocalizedSlugMode } from '../../lib/collections.js'
import { generateStableId } from '../../lib/paths.js'
import type { QueryOrMutationCtx } from '../../lib/types.js'
import {
  assertFieldDataValid,
  assertValidLocaleCode,
  assertValidSlug,
} from '../../lib/validation.js'
import { scheduleRevalidationOutboxDelivery } from '../../revalidation.js'
import { resolveEntryPlacement } from '../placement.js'
import { ensureSharedSlugUnique } from '../slugs.js'
import {
  deleteEntryAssetRefsBySourceKind,
  extractAssetRefsFromText,
  extractAssetRefsFromValues,
  replaceAssetRefs,
  uniqueAssetRefs,
} from './assetRefs.js'
import { applyDraftPatch, readDraftRows, type SaveDraftPatch } from './drafts.js'
import { stableHash } from './hashing.js'
import {
  entrySnapshotPath,
  localeSnapshotPathFromPublicPath,
  pathSegments,
  pathPrefixForLocale,
} from './path.js'
import {
  deleteAllPublicProjections,
  deletePublicProjection,
  readPublicRevisionIdsByLocale,
  upsertPublicProjection,
} from './projection.js'
import { buildPublicProjectionFromRevisionSnapshot } from './projectionBuild.js'
import { assertPublicBodySafe } from './renderSafety.js'
import {
  appendRevisionAndPatchEntry,
  type appendRevision,
  type RevisionLocaleSnapshot,
} from './revisions.js'
import {
  appendDescendantRouteRebuildRevisions,
  collectDescendantProjectionRebuilds,
  descendantRevalidationState,
} from './subtreeRoutes.js'

type MarkdownRoot = ParseMdcBodyResult['body']
type Toc = NonNullable<ParseMdcBodyResult['toc']>

type PublicRevalidationState = {
  tags: string[]
  paths: string[]
}

const PUBLISHABLE_IMPACT_STATUSES = new Set(['ready', 'no_changes'])

async function capturePublicRevalidationState(
  ctx: Parameters<typeof appendRevision>[0],
  args: { entryId: Id<'entries'>; locales?: string[] },
): Promise<PublicRevalidationState> {
  const scopedEntries = args.locales
    ? (
        await Promise.all(
          uniqueContentTags(args.locales).map((locale) =>
            ctx.db
              .query('publicEntries')
              .withIndex('by_entry_locale', (q) =>
                q.eq('entryId', args.entryId).eq('locale', locale),
              )
              .first(),
          ),
        )
      ).filter((entry): entry is Doc<'publicEntries'> => entry !== null)
    : await ctx.db
        .query('publicEntries')
        .withIndex('by_entry_locale', (q) => q.eq('entryId', args.entryId))
        .collect()
  return {
    tags: uniqueContentTags(scopedEntries.flatMap((entry) => entry.cacheTags)),
    paths: uniqueContentTags(scopedEntries.map((entry) => normalizeContentPath(entry.path))),
  }
}

async function insertRevalidationOutboxEvent(
  ctx: Parameters<typeof appendRevision>[0],
  args: {
    kind: 'publish' | 'unpublish' | 'archive' | 'rollback'
    collection: Doc<'collections'>
    entryId: Id<'entries'>
    appIdentityId: string
    versionId: Id<'entryRevisions'> | null
    now: number
    oldState?: PublicRevalidationState
  },
) {
  const versionKey = args.versionId ? String(args.versionId) : String(args.now)
  const idempotencyKey = `content.revalidate:${args.kind}:${String(args.entryId)}:${versionKey}`
  const existing = await ctx.db
    .query('outboxEvents')
    .withIndex('by_idempotency_key', (q) => q.eq('idempotencyKey', idempotencyKey))
    .first()
  if (existing) return existing._id

  const newState = await capturePublicRevalidationState(ctx, { entryId: args.entryId })
  const tags = uniqueContentTags([...(args.oldState?.tags ?? []), ...newState.tags])
  const directPaths = [...(args.oldState?.paths ?? []), ...newState.paths]
  const aggregatePaths = args.collection.locales.map((locale) =>
    normalizeContentPath(pathPrefixForLocale(args.collection, locale) || '/'),
  )
  const paths = uniqueContentTags([...directPaths, ...aggregatePaths].map(normalizeContentPath))

  return await ctx.db.insert('outboxEvents', {
    type: 'content.revalidate',
    status: 'pending',
    idempotencyKey,
    versionId: args.versionId ? String(args.versionId) : null,
    tags,
    paths,
    payload: {
      reason: args.kind,
      collection: args.collection.slug,
      entryId: String(args.entryId),
      appIdentityId: args.appIdentityId,
      versionId: args.versionId ? String(args.versionId) : null,
    },
    attempts: 0,
    nextAttemptAt: args.now,
    lastError: null,
    createdAt: args.now,
    updatedAt: args.now,
  })
}

export async function createCanonicalEntry(
  ctx: Parameters<typeof refreshDraftAssetRefsForSave>[0],
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
  const now = Date.now()
  const collection = await getCollectionOrThrow(ctx, args.collection)
  const locale = args.locale ?? collection.locales[0] ?? 'en'
  assertValidLocaleCode(locale, 'ENTRY_LOCALE_INVALID')

  const baseSlug = collection.routing.singleton ? collection.slug : args.slug
  if (!collection.routing.singleton) {
    assertValidSlug(baseSlug)
  }
  await ensureSharedSlugUnique(ctx, collection._id, baseSlug)

  const placement = await resolveEntryPlacement(ctx, {
    collection,
    collectionId: collection._id,
    parentEntryId: args.parentEntryId,
    currentOrder: args.orderRank ?? null,
  })
  const stableId = await generateStableId(ctx, collection._id)
  const shared = (args.shared ?? {}) as JsonObject
  const localized = { ...((args.localized ?? {}) as JsonObject) }
  // Rich-text content is canonical on the draft row's bodyMdc column, never in
  // the values map. Lift a richtext value out of `localized` for callers that
  // send it as a plain field (Studio create, MCP create) so the body is not
  // silently stranded where no reader looks.
  let bodyMdc = args.bodyMdc ?? null
  for (const field of collection.fields) {
    if (field.type !== 'richtext') continue
    const value = localized[field.key]
    delete localized[field.key]
    if (bodyMdc === null && typeof value === 'string') bodyMdc = value
  }
  const mergedDraft = materializeFieldData(collection.fields, shared, localized)
  assertFieldDataValid(collection.fields, mergedDraft, { publish: false })

  const entryId = await ctx.db.insert('entries', {
    collectionId: collection._id,
    baseSlug,
    stableId,
    status: 'draft',
    dirtyLocales: [locale],
    parentEntryId: placement.parentEntryId,
    orderRank: placement.orderRank,
    nodeKind: args.nodeKind ?? null,
    sortCache: {},
    draftVersion: 1,
    latestRevisionId: null,
    createdBy: args.appIdentity,
    updatedBy: args.appIdentity,
    publishedBy: null,
    createdAt: now,
    updatedAt: now,
    publishedAt: null,
    firstPublishedAt: null,
  })

  await ctx.db.insert('entryDrafts', {
    entryId,
    locale: null,
    baseRevisionId: null,
    parentEntryId: placement.parentEntryId,
    orderRank: placement.orderRank,
    slug: baseSlug,
    shared,
    updatedBy: args.appIdentity,
    updatedAt: now,
  })
  await ctx.db.insert('entryDrafts', {
    entryId,
    locale,
    baseRevisionId: null,
    ...(isLocalizedSlugMode(collection) ? { localeSlug: baseSlug } : {}),
    values: localized,
    bodyMdc: bodyMdc ?? '',
    updatedBy: args.appIdentity,
    updatedAt: now,
  })

  await refreshDraftAssetRefsForSave(ctx, {
    entryId,
    collectionId: collection._id,
    sharedUpdated: true,
    affectedLocales: [locale],
    now,
  })
  await logActivity(ctx, {
    kind: 'entry.created',
    summary: `Created ${collection.slug} entry "${baseSlug}"`,
    appIdentityId: args.appIdentity,
    entryId,
    collectionId: collection._id,
    locale,
    detail: { locale },
    createdAt: now,
  })

  return entryId
}

export async function refreshDraftAssetRefsForSave(
  ctx: Parameters<typeof replaceAssetRefs>[0],
  args: {
    entryId: Id<'entries'>
    collectionId: Id<'collections'>
    sharedUpdated: boolean
    affectedLocales: string[]
    now: number
  },
): Promise<void> {
  // Refresh contentAssetRefs for any locale this save touched. The
  // shared row's `shared` field is treated as locale=null. Per-locale
  // rows record their own asset refs scoped to that locale.
  const draftRowsAfterSave = await readDraftRows(ctx, args.entryId)
  if (args.sharedUpdated) {
    const sharedRow = draftRowsAfterSave.shared
    const refs = extractAssetRefsFromValues((sharedRow?.shared ?? {}) as JsonObject, {
      locale: null,
    })
    await replaceAssetRefs(ctx, {
      sourceKind: 'draft',
      sourceId: `${args.entryId}:shared`,
      entryId: args.entryId,
      collectionId: args.collectionId,
      refs,
      now: args.now,
    })
  }
  for (const locale of args.affectedLocales) {
    const localeRow = draftRowsAfterSave.byLocale[locale]
    const refs = uniqueAssetRefs([
      ...extractAssetRefsFromValues((localeRow?.values ?? {}) as JsonObject, {
        locale,
      }),
      ...extractAssetRefsFromText(localeRow?.bodyMdc ?? '', {
        fieldPath: 'bodyMdc',
        locale,
      }),
    ])
    await replaceAssetRefs(ctx, {
      sourceKind: 'draft',
      sourceId: `${args.entryId}:${locale}`,
      entryId: args.entryId,
      collectionId: args.collectionId,
      refs,
      now: args.now,
    })
  }
}

export async function computePublishDraftHash(
  ctx: Parameters<typeof readDraftRows>[0],
  args: { entryId: Id<'entries'>; locales: string[] },
): Promise<string> {
  const drafts = await readDraftRows(ctx, args.entryId)
  return stableHash(publishDraftHashPayload(drafts, args.locales))
}

function publishDraftHashPayload(
  drafts: Awaited<ReturnType<typeof readDraftRows>>,
  locales: string[],
) {
  return {
    shared: drafts.shared
      ? {
          parentEntryId: drafts.shared.parentEntryId ?? null,
          orderRank: drafts.shared.orderRank ?? null,
          slug: drafts.shared.slug ?? null,
          values: drafts.shared.shared ?? {},
        }
      : null,
    locales: Object.fromEntries(
      locales
        .filter((locale) => drafts.byLocale[locale])
        .map((locale) => {
          const row = drafts.byLocale[locale]!
          return [
            locale,
            {
              slug: row.localeSlug ?? null,
              values: row.values ?? {},
              bodyMdc: row.bodyMdc ?? '',
            },
          ]
        }),
    ),
  }
}

// ─── publish workflow helpers ────────────────────────────────────────────

interface ParsedLocaleBody {
  bodyMdc: string
  bodyAst: MarkdownRoot
  searchText: string
  toc: Toc | null
}

interface PublishEntryRunInput {
  entryId: Id<'entries'>
  locales: string[]
  expectedDraftVersion: number
  expectedDraftHash: string
  appIdentity: string
  kind?: 'publish' | 'rollback'
  message?: string | null
  parsedLocales: Record<
    string,
    { bodyMdc: string; bodyAst: JsonObject; searchText: string; toc: JsonObject | null }
  >
}

type PublishPlacementSnapshot = {
  parentEntryId: Id<'entries'> | null
  orderRank: string | null
  slug: string | null
  shared: JsonObject
}

function publishPlacementSnapshot(
  entry: Doc<'entries'>,
  drafts: Awaited<ReturnType<typeof readDraftRows>>,
): PublishPlacementSnapshot {
  const shared = drafts.shared
  return {
    parentEntryId:
      shared && shared.parentEntryId !== undefined
        ? (shared.parentEntryId ?? null)
        : (entry.parentEntryId ?? null),
    orderRank:
      shared && shared.orderRank !== undefined
        ? (shared.orderRank ?? null)
        : (entry.orderRank ?? null),
    slug: shared && shared.slug !== undefined ? (shared.slug ?? null) : entry.baseSlug,
    shared: (shared?.shared as JsonObject) ?? {},
  }
}

function mergeRevalidationState(
  left: PublicRevalidationState,
  right: PublicRevalidationState,
): PublicRevalidationState {
  return {
    tags: uniqueContentTags([...left.tags, ...right.tags]),
    paths: uniqueContentTags(
      [...left.paths, ...right.paths].map((path) => normalizeContentPath(path)),
    ),
  }
}

async function executePublishEntryRun(
  ctx: Parameters<typeof appendRevision>[0],
  args: PublishEntryRunInput,
): Promise<{ revisionId: Id<'entryRevisions'>; affectedLocales: string[] }> {
  const now = Date.now()

  const entry = await ctx.db.get(args.entryId)
  if (!entry) {
    throw new Error(`Publish rejected: entry ${args.entryId} no longer exists`)
  }
  if (entry.draftVersion !== args.expectedDraftVersion) {
    throw new Error(
      `Publish rejected: draft-version-drift expected=${args.expectedDraftVersion} actual=${entry.draftVersion}`,
    )
  }

  const drafts = await readDraftRows(ctx, args.entryId)
  const recomputedHash = stableHash(publishDraftHashPayload(drafts, args.locales))

  if (recomputedHash !== args.expectedDraftHash) {
    throw new Error(
      `Publish rejected: draft-hash-drift expected=${args.expectedDraftHash} actual=${recomputedHash}`,
    )
  }

  // Build the full per-locale revision snapshot. Start from the latest
  // meaningful revision and replace only the locales this publish affects,
  // so every publish revision can reconstruct the complete published state.
  const priorSnapshot = await latestRevisionSnapshotOrEmpty(ctx, entry)
  const collection = await ctx.db.get(entry.collectionId)
  if (!collection) {
    throw new Error(`Publish rejected: collection ${entry.collectionId} no longer exists`)
  }
  await assertCurrentDraftPublishable(ctx, {
    collection,
    entryId: args.entryId,
    locales: args.locales,
  })
  const oldRevalidationState = await capturePublicRevalidationState(ctx, {
    entryId: args.entryId,
    locales: args.locales,
  })
  const localeSnapshots: Record<string, RevisionLocaleSnapshot | null> = {
    ...(priorSnapshot.locales ?? {}),
  }
  const publishPlacement = publishPlacementSnapshot(entry, drafts)
  for (const locale of args.locales) {
    const row = drafts.byLocale[locale]
    if (!row) {
      throwCmsError('ENTRY_PUBLISH_LOCALE_NOT_FOUND', `Draft locale "${locale}" not found`, {
        entryId: String(args.entryId),
        locale,
      })
    }
    const parsed = args.parsedLocales[locale]
    const localeSlug = row.localeSlug ?? null
    const sharedSlug = publishPlacement.slug
    const slug = localeSlug ?? sharedSlug ?? entry.baseSlug
    const mergedDraft = materializeFieldData(
      collection.fields,
      (drafts.shared?.shared as JsonObject) ?? {},
      (row.values as JsonObject) ?? {},
    )
    assertFieldDataValid(collection.fields, mergedDraft, { publish: true })
    assertCmsSchemaArtifactValid(collection.settings, mergedDraft)
    const localeValues: JsonObject = { ...mergedDraft }
    const rowValues = (row.values as JsonObject) ?? {}
    if (rowValues.public !== undefined) localeValues.public = rowValues.public
    if (rowValues.seo !== undefined) localeValues.seo = rowValues.seo
    const ancestorSlugs = await computePublishedAncestorSlugs(ctx, {
      collection,
      parentEntryId: publishPlacement.parentEntryId,
      locale,
    })
    const path = entrySnapshotPath(collection, {
      slug,
      stableId: entry.stableId ?? null,
      ancestorSlugs,
    })
    localeSnapshots[locale] = {
      slug,
      path,
      values: localeValues,
      bodyMdc: parsed?.bodyMdc ?? '',
      searchText: parsed?.searchText ?? '',
      toc: parsed?.toc ?? null,
    }
  }
  const descendantRebuilds = await collectDescendantProjectionRebuilds(ctx, {
    collection,
    rootEntry: entry,
    localeSnapshots,
    locales: args.locales,
  })

  const remainingDirtyLocales = (entry.dirtyLocales ?? []).filter(
    (locale) => !args.locales.includes(locale),
  )
  const entryFirstPublishedAt = entry.firstPublishedAt ?? now
  const revisionResult = await appendRevisionAndPatchEntry(
    ctx,
    {
      entryId: args.entryId,
      collectionId: entry.collectionId,
      parentRevisionId: entry.latestRevisionId ?? null,
      kind: args.kind ?? 'publish',
      snapshot: {
        parentEntryId: publishPlacement.parentEntryId,
        orderRank: publishPlacement.orderRank,
        slug: publishPlacement.slug,
        shared: publishPlacement.shared,
        locales: localeSnapshots,
      },
      affectedLocales: args.locales,
      message: args.message ?? null,
      appIdentity: args.appIdentity,
      now,
    },
    {
      status: 'published',
      publishedAt: now,
      firstPublishedAt: entryFirstPublishedAt,
      publishedBy: args.appIdentity,
      dirtyLocales: remainingDirtyLocales,
      baseSlug: publishPlacement.slug ?? entry.baseSlug,
      parentEntryId: publishPlacement.parentEntryId,
      orderRank: publishPlacement.orderRank,
    },
  )

  // Upsert publicEntries + publicRoutes per affected locale.
  for (const locale of args.locales) {
    const localeSnapshot = localeSnapshots[locale]
    if (!localeSnapshot) continue
    const projection = await buildPublicProjectionFromRevisionSnapshot(ctx, {
      entry,
      collection,
      revisionId: revisionResult.revisionId,
      locale,
      snapshot: {
        parentEntryId: publishPlacement.parentEntryId,
        orderRank: publishPlacement.orderRank,
      },
      localeSnapshot,
      now,
    })
    await upsertPublicProjection(ctx, projection.input)

    // Asset refs: revision + public.
    await replaceAssetRefs(ctx, {
      sourceKind: 'revision',
      sourceId: `${revisionResult.revisionId}:${locale}`,
      entryId: args.entryId,
      collectionId: entry.collectionId,
      refs: projection.assetRefs,
      now,
    })
    await replaceAssetRefs(ctx, {
      sourceKind: 'public',
      sourceId: `${args.entryId}:${locale}`,
      entryId: args.entryId,
      collectionId: entry.collectionId,
      refs: projection.assetRefs,
      now,
    })
  }

  const descendantRevisionIds = await appendDescendantRouteRebuildRevisions(ctx, {
    rebuilds: descendantRebuilds,
    appIdentity: args.appIdentity,
    now,
  })

  for (const rebuild of descendantRebuilds) {
    const revisionId = descendantRevisionIds.get(String(rebuild.entry._id))
    if (!revisionId) {
      throw new Error(`Descendant route rebuild did not create a revision for ${rebuild.entry._id}`)
    }
    const projection = await buildPublicProjectionFromRevisionSnapshot(ctx, {
      entry: rebuild.entry,
      collection,
      revisionId,
      locale: rebuild.locale,
      snapshot: rebuild.snapshot,
      localeSnapshot: rebuild.localeSnapshot,
      now,
    })
    await upsertPublicProjection(ctx, projection.input)
    rebuild.cacheTags = uniqueContentTags([
      ...rebuild.cacheTags,
      ...(projection.input.cacheTags ?? []),
    ])
    await replaceAssetRefs(ctx, {
      sourceKind: 'revision',
      sourceId: `${revisionId}:${rebuild.locale}`,
      entryId: rebuild.entry._id,
      collectionId: rebuild.entry.collectionId,
      refs: projection.assetRefs,
      now,
    })
    await replaceAssetRefs(ctx, {
      sourceKind: 'public',
      sourceId: `${rebuild.entry._id}:${rebuild.locale}`,
      entryId: rebuild.entry._id,
      collectionId: rebuild.entry.collectionId,
      refs: projection.assetRefs,
      now,
    })
  }

  await logActivity(ctx, {
    kind: 'entry.published',
    summary: 'Published entry',
    appIdentityId: args.appIdentity,
    entryId: entry._id,
    collectionId: entry.collectionId,
    detail: {
      locales: args.locales,
      revisionId: String(revisionResult.revisionId),
    },
    createdAt: now,
  })
  await insertRevalidationOutboxEvent(ctx, {
    kind: 'publish',
    collection,
    entryId: entry._id,
    appIdentityId: args.appIdentity,
    versionId: revisionResult.revisionId,
    now,
    oldState: mergeRevalidationState(
      oldRevalidationState,
      descendantRevalidationState(descendantRebuilds),
    ),
  })
  await scheduleRevalidationOutboxDelivery(ctx)

  return {
    revisionId: revisionResult.revisionId,
    affectedLocales: args.locales,
  }
}

async function assertCurrentDraftPublishable(
  ctx: QueryOrMutationCtx,
  args: {
    collection: Doc<'collections'>
    entryId: Id<'entries'>
    locales: string[]
  },
) {
  const impact = await previewPublishImpactForEntry(ctx, {
    collection: args.collection.slug,
    entryId: String(args.entryId),
    locales: args.locales,
  })
  const blockedLocales = impact.locales.filter(
    (locale) => !PUBLISHABLE_IMPACT_STATUSES.has(locale.status),
  )
  if (
    PUBLISHABLE_IMPACT_STATUSES.has(impact.status) &&
    blockedLocales.length === 0 &&
    impact.blockingDiagnostics.length === 0
  ) {
    return
  }

  throwCmsError('ENTRY_PUBLISH_NOT_READY', 'Publish rejected: current draft is not publishable.', {
    entryId: String(args.entryId),
    locales: args.locales,
    status: impact.status,
    blockedLocales: blockedLocales.map((locale) => locale.locale),
    blockingDiagnostics: impact.blockingDiagnostics.map((diagnostic) => ({
      code: diagnostic.code,
      severity: diagnostic.severity,
      locale: diagnostic.locale ?? null,
      path: diagnostic.path ?? null,
      href: diagnostic.href ?? null,
      message: diagnostic.message,
    })),
  })
}

type SchemaArtifactNode =
  | { kind: 'object'; required?: string[]; shape?: Record<string, SchemaArtifactNode> }
  | { kind: 'array'; element?: SchemaArtifactNode }
  | {
      kind: 'string'
      checks?: Array<
        | { kind: 'min'; value: number }
        | { kind: 'max'; value: number }
        | { kind: 'email' }
        | { kind: 'url' }
      >
    }
  | { kind: 'number' }
  | { kind: 'boolean' }
  | { kind: 'date' }
  | { kind: 'enum'; values?: string[] }
  | { kind: 'optional'; inner?: SchemaArtifactNode }
  | { kind: 'nullable'; inner?: SchemaArtifactNode }
  | { kind: 'default'; inner?: SchemaArtifactNode; value?: unknown }

function assertCmsSchemaArtifactValid(settings: unknown, value: JsonObject) {
  const schemaRef = cmsSchemaRef(settings)
  if (!schemaRef) return
  if (!schemaRef.artifact) {
    throwCmsError(
      'ENTRY_PUBLISH_SCHEMA_ARTIFACT_MISSING',
      'Publish rejected: schema artifact missing',
    )
  }
  const actualChecksum = schemaArtifactChecksum(schemaRef.artifact)
  if (schemaRef.checksum !== actualChecksum) {
    throwCmsError(
      'ENTRY_PUBLISH_SCHEMA_ARTIFACT_MISMATCH',
      'Publish rejected: schema artifact checksum mismatch',
      {
        expected: schemaRef.checksum,
        actual: actualChecksum,
      },
    )
  }
  const errors: string[] = []
  let artifact: { root?: SchemaArtifactNode }
  try {
    artifact = JSON.parse(schemaRef.artifact) as { root?: SchemaArtifactNode }
  } catch {
    throwCmsError(
      'ENTRY_PUBLISH_SCHEMA_ARTIFACT_INVALID',
      'Publish rejected: schema artifact is not valid JSON',
    )
  }
  validateSchemaNode(artifact.root, value, '<root>', errors)
  if (errors.length > 0) {
    throwCmsError(
      'ENTRY_PUBLISH_SCHEMA_INVALID',
      'Publish rejected: draft does not match collection schema',
      {
        errors,
      },
    )
  }
}

function cmsSchemaRef(settings: unknown): {
  checksum: string
  artifact?: string
} | null {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return null
  const ref = (settings as Record<string, unknown>).cmsSchema
  if (!ref || typeof ref !== 'object' || Array.isArray(ref)) return null
  const checksum = (ref as Record<string, unknown>).checksum
  const artifact = (ref as Record<string, unknown>).artifact
  return {
    checksum: typeof checksum === 'string' ? checksum : '',
    artifact: typeof artifact === 'string' ? artifact : undefined,
  }
}

function validateSchemaNode(
  node: SchemaArtifactNode | undefined,
  value: unknown,
  path: string,
  errors: string[],
): void {
  if (!node) {
    errors.push(`${path}: schema node missing`)
    return
  }
  if (node.kind === 'optional') {
    if (value === undefined) return
    validateSchemaNode(node.inner, value, path, errors)
    return
  }
  if (node.kind === 'nullable') {
    if (value === null) return
    validateSchemaNode(node.inner, value, path, errors)
    return
  }
  if (node.kind === 'default') {
    if (value === undefined) return
    validateSchemaNode(node.inner, value, path, errors)
    return
  }
  if (value === undefined || value === null) {
    errors.push(`${path}: required value missing`)
    return
  }
  if (node.kind === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      errors.push(`${path}: expected object`)
      return
    }
    const objectValue = value as Record<string, unknown>
    for (const key of node.required ?? []) {
      if (objectValue[key] === undefined) errors.push(`${path}.${key}: required value missing`)
    }
    for (const [key, child] of Object.entries(node.shape ?? {})) {
      validateSchemaNode(child, objectValue[key], `${path}.${key}`, errors)
    }
    return
  }
  if (node.kind === 'array') {
    if (!Array.isArray(value)) {
      errors.push(`${path}: expected array`)
      return
    }
    value.forEach((entry, index) =>
      validateSchemaNode(node.element, entry, `${path}[${index}]`, errors),
    )
    return
  }
  if (node.kind === 'string') {
    if (typeof value !== 'string') {
      errors.push(`${path}: expected string`)
      return
    }
    for (const check of node.checks ?? []) {
      if (check.kind === 'min' && value.length < check.value) {
        errors.push(`${path}: expected at least ${check.value} character(s)`)
      }
      if (check.kind === 'max' && value.length > check.value) {
        errors.push(`${path}: expected at most ${check.value} character(s)`)
      }
      if (check.kind === 'email' && !looksLikeEmail(value)) {
        errors.push(`${path}: expected email`)
      }
      if (check.kind === 'url' && !looksLikeUrl(value)) {
        errors.push(`${path}: expected url`)
      }
    }
    return
  }
  if (node.kind === 'number' && typeof value !== 'number') errors.push(`${path}: expected number`)
  if (node.kind === 'boolean' && typeof value !== 'boolean')
    errors.push(`${path}: expected boolean`)
  if (node.kind === 'date' && !(value instanceof Date) && typeof value !== 'string') {
    errors.push(`${path}: expected date`)
  }
  if (node.kind === 'enum' && !((node.values ?? []) as unknown[]).includes(value)) {
    errors.push(`${path}: expected one of ${(node.values ?? []).join(', ')}`)
  }
}

function looksLikeEmail(value: string): boolean {
  const at = value.indexOf('@')
  if (at <= 0 || at !== value.lastIndexOf('@')) return false
  const domain = value.slice(at + 1)
  return domain.includes('.') && !domain.startsWith('.') && !domain.endsWith('.')
}

function looksLikeUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function schemaArtifactChecksum(source: string): string {
  let hash = 2166136261
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, '0')}`
}

async function computePublishedAncestorSlugs(
  ctx: QueryOrMutationCtx,
  args: {
    collection: Doc<'collections'> | null
    parentEntryId: Id<'entries'> | null
    locale: string
  },
): Promise<string[]> {
  if (!args.parentEntryId) return []

  const parentPublic = await ctx.db
    .query('publicEntries')
    .withIndex('by_entry_locale', (q) =>
      q.eq('entryId', args.parentEntryId!).eq('locale', args.locale),
    )
    .first()
  if (!parentPublic) {
    const parent = await ctx.db.get(args.parentEntryId)
    return parent ? [parent.baseSlug] : []
  }

  return pathSegments(
    localeSnapshotPathFromPublicPath(args.collection, parentPublic.path, args.locale),
  )
}

export async function publishCurrentDraft(
  ctx: Parameters<typeof executePublishEntryRun>[0],
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
  const draftRows = await readDraftRows(ctx, args.entryId)
  const entry = await ctx.db.get(args.entryId)
  if (!entry) throwCmsError('ENTRY_NOT_FOUND', 'Entry not found.', { entryId: args.entryId })
  const collection = await ctx.db.get(entry.collectionId)
  if (!collection) {
    throwCmsError('COLLECTION_NOT_FOUND', 'Entry collection not found.', {
      collectionId: entry.collectionId,
    })
  }

  const parsedLocales: Record<string, ParsedLocaleBody> = {}
  for (const locale of args.locales) {
    const draft = draftRows.byLocale[locale]
    const bodyMdc = draft?.bodyMdc ?? ''
    const parsed = await parseMdcBody(bodyMdc)
    await assertPublicBodySafe(ctx, parsed.body, collection)
    parsedLocales[locale] = {
      bodyMdc,
      bodyAst: parsed.body,
      searchText: parsed.searchText,
      toc: parsed.toc ?? null,
    }
  }

  return await executePublishEntryRun(ctx, {
    entryId: args.entryId,
    locales: args.locales,
    expectedDraftVersion: args.expectedDraftVersion,
    expectedDraftHash: args.expectedDraftHash,
    appIdentity: args.appIdentity,
    kind: args.kind,
    message: args.message ?? null,
    parsedLocales: Object.fromEntries(
      Object.entries(parsedLocales).map(([locale, body]) => [
        locale,
        {
          bodyMdc: body.bodyMdc,
          bodyAst: body.bodyAst as unknown as JsonObject,
          searchText: body.searchText,
          toc: (body.toc as unknown as JsonObject | null) ?? null,
        },
      ]),
    ) as Record<
      string,
      { bodyMdc: string; bodyAst: JsonObject; searchText: string; toc: JsonObject | null }
    >,
  })
}

// ─── unpublishEntry / archiveEntry / restoreRevision ─────────────────────

function assertExpectedPublicRevisionIds(
  current: Record<string, Id<'entryRevisions'>>,
  expected: Record<string, Id<'entryRevisions'>>,
  locales: string[],
): void {
  for (const locale of locales) {
    const expectedRevisionId = expected[locale]
    const currentRevisionId = current[locale]
    if (!expectedRevisionId) {
      throw new Error(
        `Public state concurrency rejected: missing expected revision for locale ${locale}`,
      )
    }
    if (!currentRevisionId) {
      throw new Error(`Public state concurrency rejected: locale ${locale} is not published`)
    }
    if (currentRevisionId !== expectedRevisionId) {
      throw new Error(
        `Public state concurrency rejected: locale ${locale} moved from ${expectedRevisionId} to ${currentRevisionId}`,
      )
    }
  }
}

function assertExactExpectedPublicRevisionIds(
  current: Record<string, Id<'entryRevisions'>>,
  expected: Record<string, Id<'entryRevisions'>>,
): void {
  const currentLocales = Object.keys(current).sort()
  const expectedLocales = Object.keys(expected).sort()
  if (currentLocales.length !== expectedLocales.length) {
    throw new Error(
      `Public state concurrency rejected: expected locales ${expectedLocales.join(',')} do not match current locales ${currentLocales.join(',')}`,
    )
  }
  assertExpectedPublicRevisionIds(current, expected, currentLocales)
}

async function latestRevisionSnapshotOrEmpty(
  ctx: Parameters<typeof appendRevision>[0],
  entry: { latestRevisionId?: Id<'entryRevisions'> | null },
) {
  if (!entry.latestRevisionId) {
    return {
      parentEntryId: null,
      orderRank: null,
      slug: null,
      shared: {},
      locales: {},
    }
  }
  const latestRevision = await ctx.db.get(entry.latestRevisionId)
  if (!latestRevision) {
    throw new Error(`Latest revision not found: ${entry.latestRevisionId}`)
  }
  return latestRevision.snapshot
}

export async function unpublishCurrentPublic(
  ctx: Parameters<typeof appendRevision>[0],
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
  const entry = await ctx.db.get(args.entryId)
  if (!entry) throw new Error(`Entry not found: ${args.entryId}`)
  const collection = await ctx.db.get(entry.collectionId)
  if (!collection) throw new Error(`Collection not found: ${entry.collectionId}`)

  const locales = [...new Set(args.locales)]
  if (locales.length === 0) {
    throw new Error('Unpublish rejected: at least one locale is required')
  }

  const currentPublicRevisionIds = await readPublicRevisionIdsByLocale(ctx, args.entryId)
  assertExpectedPublicRevisionIds(currentPublicRevisionIds, args.expectedPublicRevisionIds, locales)

  const now = Date.now()
  const oldRevalidationState = await capturePublicRevalidationState(ctx, {
    entryId: args.entryId,
    locales,
  })
  const priorSnapshot = await latestRevisionSnapshotOrEmpty(ctx, entry)
  const nextSnapshot = {
    ...priorSnapshot,
    locales: { ...(priorSnapshot.locales ?? {}) },
  }
  for (const locale of locales) {
    nextSnapshot.locales[locale] = null
  }
  for (const locale of locales) {
    await deletePublicProjection(ctx, { entryId: args.entryId, locale })
    await replaceAssetRefs(ctx, {
      sourceKind: 'public',
      sourceId: `${args.entryId}:${locale}`,
      entryId: args.entryId,
      collectionId: entry.collectionId,
      refs: [],
      now,
    })
  }

  const remainingPublicRevisionIds = await readPublicRevisionIdsByLocale(ctx, args.entryId)
  const remainingLocales = Object.keys(remainingPublicRevisionIds).sort()
  const revisionResult = await appendRevisionAndPatchEntry(
    ctx,
    {
      entryId: args.entryId,
      collectionId: entry.collectionId,
      parentRevisionId: entry.latestRevisionId ?? null,
      kind: 'unpublish',
      snapshot: nextSnapshot,
      affectedLocales: locales,
      message: null,
      appIdentity: args.appIdentity,
      now,
    },
    {
      status: remainingLocales.length > 0 ? 'published' : 'draft',
      ...(remainingLocales.length === 0 ? { publishedAt: null, publishedBy: null } : {}),
    },
  )
  await logActivity(ctx, {
    kind: 'entry.unpublished',
    summary: 'Unpublished entry',
    appIdentityId: args.appIdentity,
    entryId: args.entryId,
    collectionId: entry.collectionId,
    detail: {
      locales,
      revisionId: String(revisionResult.revisionId),
    },
    createdAt: now,
  })
  await insertRevalidationOutboxEvent(ctx, {
    kind: 'unpublish',
    collection,
    entryId: args.entryId,
    appIdentityId: args.appIdentity,
    versionId: revisionResult.revisionId,
    now,
    oldState: oldRevalidationState,
  })
  await scheduleRevalidationOutboxDelivery(ctx)

  return {
    revisionId: revisionResult.revisionId,
    affectedLocales: locales,
    remainingLocales,
  }
}

export async function archiveCurrentEntry(
  ctx: Parameters<typeof appendRevision>[0],
  args: {
    entryId: Id<'entries'>
    expectedPublicRevisionIds: Record<string, Id<'entryRevisions'>>
    appIdentity: string
  },
): Promise<{ revisionId: Id<'entryRevisions'>; affectedLocales: string[] }> {
  const entry = await ctx.db.get(args.entryId)
  if (!entry) throw new Error(`Entry not found: ${args.entryId}`)
  const collection = await ctx.db.get(entry.collectionId)
  if (!collection) throw new Error(`Collection not found: ${entry.collectionId}`)

  const currentPublicRevisionIds = await readPublicRevisionIdsByLocale(ctx, args.entryId)
  assertExactExpectedPublicRevisionIds(currentPublicRevisionIds, args.expectedPublicRevisionIds)

  const now = Date.now()
  const oldRevalidationState = await capturePublicRevalidationState(ctx, { entryId: args.entryId })
  const priorSnapshot = await latestRevisionSnapshotOrEmpty(ctx, entry)
  const affectedLocales = Object.keys(currentPublicRevisionIds).sort()
  const deletedLocales = await deleteAllPublicProjections(ctx, args.entryId)
  for (const locale of deletedLocales) {
    await replaceAssetRefs(ctx, {
      sourceKind: 'public',
      sourceId: `${args.entryId}:${locale}`,
      entryId: args.entryId,
      collectionId: entry.collectionId,
      refs: [],
      now,
    })
  }

  const revisionResult = await appendRevisionAndPatchEntry(
    ctx,
    {
      entryId: args.entryId,
      collectionId: entry.collectionId,
      parentRevisionId: entry.latestRevisionId ?? null,
      kind: 'archive',
      snapshot: priorSnapshot,
      affectedLocales,
      message: null,
      appIdentity: args.appIdentity,
      now,
    },
    {
      status: 'archived',
      publishedAt: null,
      publishedBy: null,
    },
  )
  await logActivity(ctx, {
    kind: 'entry.archived',
    summary: 'Archived entry',
    appIdentityId: args.appIdentity,
    entryId: args.entryId,
    collectionId: entry.collectionId,
    detail: {
      locales: affectedLocales,
      revisionId: String(revisionResult.revisionId),
    },
    createdAt: now,
  })
  await insertRevalidationOutboxEvent(ctx, {
    kind: 'archive',
    collection,
    entryId: args.entryId,
    appIdentityId: args.appIdentity,
    versionId: revisionResult.revisionId,
    now,
    oldState: oldRevalidationState,
  })
  await scheduleRevalidationOutboxDelivery(ctx)

  return {
    revisionId: revisionResult.revisionId,
    affectedLocales,
  }
}

export async function restoreRevisionSnapshotToDraft(
  ctx: Parameters<typeof applyDraftPatch>[0],
  args: {
    entry: Doc<'entries'>
    sourceRevision: Doc<'entryRevisions'>
    appIdentity: string
    now: number
    expectedDraftVersion: number
  },
): Promise<{ draftVersion: number; affectedLocales: string[] }> {
  if (args.expectedDraftVersion !== args.entry.draftVersion) {
    throw new Error(
      `Restore rejected: expectedDraftVersion=${args.expectedDraftVersion} but entries.draftVersion=${args.entry.draftVersion}`,
    )
  }

  const existingDraftRows = await ctx.db
    .query('entryDrafts')
    .withIndex('by_entry', (q) => q.eq('entryId', args.entry._id))
    .collect()
  for (const row of existingDraftRows) {
    await ctx.db.delete(row._id)
  }
  await deleteEntryAssetRefsBySourceKind(ctx, {
    entryId: args.entry._id,
    sourceKind: 'draft',
  })

  const localePatch: SaveDraftPatch['locales'] = {}
  for (const [locale, localeSnapshot] of Object.entries(args.sourceRevision.snapshot.locales)) {
    if (!localeSnapshot) continue
    localePatch[locale] = {
      slug: localeSnapshot.slug,
      values: localeSnapshot.values,
      bodyMdc: localeSnapshot.bodyMdc ?? '',
    }
  }

  const result = await applyDraftPatch(ctx, {
    entryId: args.entry._id,
    expectedDraftVersion: args.entry.draftVersion,
    patch: {
      shared: {
        parentEntryId: args.sourceRevision.snapshot.parentEntryId ?? null,
        orderRank: args.sourceRevision.snapshot.orderRank ?? null,
        slug: args.sourceRevision.snapshot.slug ?? null,
        shared: args.sourceRevision.snapshot.shared,
      },
      locales: localePatch,
    },
    appIdentity: args.appIdentity,
    now: args.now,
  })

  const draftRowsAfterRestore = await readDraftRows(ctx, args.entry._id)
  const sharedRow = draftRowsAfterRestore.shared
  const sharedRefs = extractAssetRefsFromValues((sharedRow?.shared as JsonObject) ?? {}, {
    locale: null,
  })
  await replaceAssetRefs(ctx, {
    sourceKind: 'draft',
    sourceId: `${args.entry._id}:shared`,
    entryId: args.entry._id,
    collectionId: args.entry.collectionId,
    refs: sharedRefs,
    now: args.now,
  })
  for (const locale of result.affectedLocales) {
    const localeRow = draftRowsAfterRestore.byLocale[locale]
    const refs = uniqueAssetRefs([
      ...extractAssetRefsFromValues((localeRow?.values as JsonObject) ?? {}, { locale }),
      ...extractAssetRefsFromText(localeRow?.bodyMdc ?? '', {
        fieldPath: 'bodyMdc',
        locale,
      }),
    ])
    await replaceAssetRefs(ctx, {
      sourceKind: 'draft',
      sourceId: `${args.entry._id}:${locale}`,
      entryId: args.entry._id,
      collectionId: args.entry.collectionId,
      refs,
      now: args.now,
    })
  }

  return result
}

export async function createDraftCheckpoint(
  ctx: Parameters<typeof appendRevision>[0],
  args: {
    entryId: Id<'entries'>
    appIdentity: string
    message?: string | null
  },
): Promise<Id<'entryRevisions'>> {
  const now = Date.now()
  const entry = await ctx.db.get(args.entryId)
  if (!entry) throw new Error(`Entry not found: ${args.entryId}`)
  const drafts = await readDraftRows(ctx, args.entryId)
  const localeSnapshots: Record<string, RevisionLocaleSnapshot | null> = {}
  for (const [locale, row] of Object.entries(drafts.byLocale)) {
    const slug = row.localeSlug ?? drafts.shared?.slug ?? entry.baseSlug
    localeSnapshots[locale] = {
      slug,
      path: slug,
      values: (row.values as JsonObject) ?? {},
      bodyMdc: row.bodyMdc ?? '',
    }
  }

  const revisionResult = await appendRevisionAndPatchEntry(
    ctx,
    {
      entryId: args.entryId,
      collectionId: entry.collectionId,
      parentRevisionId: entry.latestRevisionId ?? null,
      kind: 'checkpoint',
      snapshot: {
        parentEntryId: drafts.shared?.parentEntryId ?? null,
        orderRank: drafts.shared?.orderRank ?? null,
        slug: drafts.shared?.slug ?? null,
        shared: (drafts.shared?.shared as JsonObject) ?? {},
        locales: localeSnapshots,
      },
      affectedLocales: Object.keys(localeSnapshots).sort(),
      message: args.message ?? null,
      appIdentity: args.appIdentity,
      now,
    },
    {},
  )

  const sharedRefs = extractAssetRefsFromValues((drafts.shared?.shared as JsonObject) ?? {}, {
    locale: null,
  })
  await replaceAssetRefs(ctx, {
    sourceKind: 'revision',
    sourceId: `${revisionResult.revisionId}:shared`,
    entryId: args.entryId,
    collectionId: entry.collectionId,
    refs: sharedRefs,
    now,
  })
  for (const [locale, row] of Object.entries(drafts.byLocale)) {
    const refs = uniqueAssetRefs([
      ...extractAssetRefsFromValues((row.values as JsonObject) ?? {}, { locale }),
      ...extractAssetRefsFromText(row.bodyMdc ?? '', {
        fieldPath: 'bodyMdc',
        locale,
      }),
    ])
    await replaceAssetRefs(ctx, {
      sourceKind: 'revision',
      sourceId: `${revisionResult.revisionId}:${locale}`,
      entryId: args.entryId,
      collectionId: entry.collectionId,
      refs,
      now,
    })
  }

  await logActivity(ctx, {
    kind: 'entry.checkpointed',
    summary: 'Saved version',
    appIdentityId: args.appIdentity,
    entryId: args.entryId,
    collectionId: entry.collectionId,
    detail: {
      revisionId: String(revisionResult.revisionId),
      message: args.message ?? null,
    },
    createdAt: now,
  })

  return revisionResult.revisionId
}
