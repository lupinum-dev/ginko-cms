import {
  applyImport as applyImportArgs,
  listImportRuns as listImportRunsArgs,
  previewImport as previewImportArgs,
} from '@lupinum/ginko-cms-contract/convex/schemas/imports.js'
import {
  importPreviewResultValidator,
  importRunValidator,
  importResultValidator,
} from '@lupinum/ginko-cms-contract/convex/validators.js'
import type {
  CmsField,
  CollectionDefinition,
  JsonMap,
  JsonValue,
} from '@lupinum/ginko-cms-contract/shared/types.js'
import { v } from 'convex/values'

import type { Id } from '../_generated/dataModel.js'
import { canManageCollections } from '../auth/checks.js'
import { readStudioDraftView } from '../entries/context.js'
import { collectRelationReferences } from '../entries/relations.js'
import {
  computePublishDraftHash,
  publishCurrentDraft,
  refreshDraftAssetRefsForSave,
} from '../entries/workflow/commands.js'
import { applyDraftPatch } from '../entries/workflow/drafts.js'
import { throwCmsError } from '../errors.js'
import { callerMutation, callerQuery } from '../functions.js'
import { getCollectionOrThrow } from '../lib/collections.js'
import { materializeFieldData, normalizeFields } from '../lib/fields.js'
import { toStringId } from '../lib/ids.js'
import type { MutationCtx } from '../lib/types.js'
import { isPlainObject } from '../lib/utils.js'
import {
  assertFieldDefinitionsValid,
  assertFieldDataValid,
  assertValidLocaleCode,
  assertValidSlug,
} from '../lib/validation.js'

function validateImportedCollection(collection: CollectionDefinition, fields: CmsField[]): void {
  assertValidSlug(collection.slug, 'COLLECTION_INVALID_SLUG')
  collection.locales.forEach((locale) => assertValidLocaleCode(locale, 'COLLECTION_LOCALE_INVALID'))
  assertFieldDefinitionsValid(fields)
}

async function compareImportedCollectionContract(
  ctx: MutationCtx,
  incoming: CollectionDefinition,
  incomingFields: CmsField[],
) {
  const existing = await ctx.db
    .query('collections')
    .withIndex('by_slug', (q) => q.eq('slug', incoming.slug))
    .first()

  if (!existing) {
    return {
      exists: false,
      collection: null,
      changes: [
        {
          kind: 'collection_missing',
          safe: false,
          reason:
            'Collection is not defined in the active code contract. Run config sync or add the collection in code before importing content.',
        },
      ],
    }
  }

  const collection = await getCollectionOrThrow(ctx, incoming.slug)
  const currentByKey = new Map(collection.fields.map((field) => [field.key, field]))
  const incomingByKey = new Map(incomingFields.map((field) => [field.key, field]))
  const changes: JsonValue[] = []

  if (incoming.type && incoming.type !== collection.type) {
    changes.push({
      kind: 'collection_type_mismatch',
      from: incoming.type,
      to: collection.type,
      safe: false,
      reason:
        'Imported content was planned against a different collection type than the active code-defined contract.',
    })
  }

  for (const field of incomingFields) {
    const current = currentByKey.get(field.key)
    if (!current) {
      changes.push({
        kind: 'field_unmapped',
        field: field.key,
        safe: false,
        reason:
          'Source field is not present in the active code-defined contract. Map or remove it before importing content.',
      })
      continue
    }

    if (current.type !== field.type) {
      changes.push({
        kind: 'field_type_mismatch',
        field: field.key,
        from: field.type,
        to: current.type,
        safe: false,
        reason:
          'Source field type differs from the active code-defined contract. Update the code contract or migration mapping first.',
      })
    }

    if ((current.localized ?? false) !== (field.localized ?? false)) {
      changes.push({
        kind: 'field_localized_mismatch',
        field: field.key,
        from: !!field.localized,
        to: !!current.localized,
        safe: false,
        reason:
          'Source field localization differs from the active code-defined contract. Update the code contract or migration mapping first.',
      })
    }
  }

  for (const current of collection.fields) {
    if (!incomingByKey.has(current.key)) {
      changes.push({
        kind: 'field_missing_from_source',
        field: current.key,
        safe: true,
        reason:
          'Code-defined field is not present in the source content. Import can continue; normal validation may still block publishing.',
      })
    }
  }

  return {
    exists: true,
    collection,
    changes,
  }
}

type ImportedEntry = {
  collection: string
  stableId: string
  parentStableId?: string | null
  locale: string
  routePath: string
  slug: string
  orderRank?: string | null
  shared: JsonMap
  localized: JsonMap
  bodyMdc?: string
  seo?: JsonMap
  public?: {
    sitemap?: boolean
    search?: boolean
    navigation?: boolean
  }
}

type ImportedEntryPublishTarget = {
  entryId: Id<'entries'>
  collectionSlug: string
  locales: Set<string>
}

type ImportRunStatus = 'previewed' | 'blocked' | 'applied' | 'published' | 'failed'

type PlannedImportEntry = {
  entry: ImportedEntry
  collection: Awaited<ReturnType<typeof getCollectionOrThrow>>
  changes: JsonMap[]
}

function buildImportRunId(kind: 'preview' | 'apply', now: number) {
  return `collection-import:${kind}:${now}`
}

function summarizeImportArgs(args: {
  source?: { provider?: string; root?: string; ref?: string } | null
  collections: CollectionDefinition[]
  entries?: unknown[] | null
  assets?: unknown[] | null
  publish?: boolean
  publishLocales?: string[] | null
  allowUnresolvedAssets?: boolean | null
}) {
  return {
    source: normalizeImportSource(args.source),
    publish: args.publish === true,
    publishLocales: [...(args.publishLocales ?? [])].sort(),
    allowUnresolvedAssets: args.allowUnresolvedAssets === true,
    collectionSlugs: args.collections.map((collection) => collection.slug).sort(),
    collectionCount: args.collections.length,
    entryCount: args.entries?.length ?? 0,
    assetCount: args.assets?.length ?? 0,
  }
}

function normalizeImportSource(
  source?: { provider?: string; root?: string; ref?: string } | null,
): JsonMap {
  const normalized: JsonMap = {}
  if (source?.provider) normalized.provider = source.provider
  if (source?.root) normalized.root = source.root
  if (source?.ref) normalized.ref = source.ref
  return normalized
}

function importRunSummary(args: {
  status: ImportRunStatus
  collectionCount: number
  entryCount: number
  assetCount: number
  blockerCount: number
  warningCount?: number
  publishedCount?: number
}): JsonMap {
  return {
    status: args.status,
    collectionCount: args.collectionCount,
    entryCount: args.entryCount,
    assetCount: args.assetCount,
    blockerCount: args.blockerCount,
    warningCount: args.warningCount ?? 0,
    publishedCount: args.publishedCount ?? 0,
  }
}

async function recordImportRun(
  ctx: MutationCtx,
  args: {
    kind: 'preview' | 'apply'
    status: ImportRunStatus
    appIdentityId: string
    now: number
    request: ReturnType<typeof summarizeImportArgs>
    result: JsonMap
    summary: JsonMap
  },
) {
  const importRunId = buildImportRunId(args.kind, args.now)
  await ctx.db.insert('collectionImportRuns', {
    importRunId,
    kind: args.kind,
    status: args.status,
    publish: args.request.publish,
    publishLocales: args.request.publishLocales,
    source: args.request.source,
    request: args.request,
    summary: args.summary,
    collectionSlugs: args.request.collectionSlugs,
    collectionCount: args.request.collectionCount,
    entryCount: args.request.entryCount,
    assetCount: args.request.assetCount,
    result: args.result,
    createdBy: args.appIdentityId,
    createdAt: args.now,
  })
  return importRunId
}

function isLocalizedSlugImportMode(slugMode?: string) {
  return slugMode === 'localized' || slugMode === 'localizedStable'
}

function validateImportPublishLocales(locales?: string[] | null) {
  for (const locale of locales ?? []) {
    assertValidLocaleCode(locale, 'ENTRY_LOCALE_INVALID')
  }
}

function normalizeLocalizedImport(entry: ImportedEntry): JsonMap {
  return {
    ...entry.localized,
    ...(entry.bodyMdc !== undefined ? { bodyMdc: entry.bodyMdc } : {}),
    ...(entry.seo !== undefined ? { seo: entry.seo } : {}),
    ...(entry.public !== undefined ? { public: entry.public as JsonMap } : {}),
  }
}

function unresolvedAssetBlockers(assets: Array<{ sourcePath: string; referencedBy: string[] }>) {
  return assets.map((asset) => ({
    kind: 'asset_unresolved',
    sourcePath: asset.sourcePath,
    referencedBy: asset.referencedBy,
    safe: false,
    reason:
      'Filesystem import detected an asset reference that has not been uploaded or rewritten. Upload/map the asset first, or rerun with allowUnresolvedAssets only for an intentional non-publishing import.',
  }))
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (isPlainObject(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

function jsonEqual(left: unknown, right: unknown): boolean {
  return stableJson(left) === stableJson(right)
}

async function describeImportedEntryChanges(
  ctx: MutationCtx,
  args: {
    entry: ImportedEntry
    collection: Awaited<ReturnType<typeof getCollectionOrThrow>>
  },
): Promise<JsonMap[]> {
  const changes: JsonMap[] = []
  const existing = await ctx.db
    .query('entries')
    .withIndex('by_collection_stableId', (q) =>
      q.eq('collectionId', args.collection._id).eq('stableId', args.entry.stableId),
    )
    .first()
  if (!existing) {
    return [
      {
        kind: 'entry_create',
        collection: args.entry.collection,
        stableId: args.entry.stableId,
        locale: args.entry.locale,
      },
    ]
  }

  const draftRows = await ctx.db
    .query('entryDrafts')
    .withIndex('by_entry', (q) => q.eq('entryId', existing._id))
    .collect()
  const sharedDraft = draftRows.find((row) => row.locale === null)
  const localeDraft = draftRows.find((row) => row.locale === args.entry.locale)
  const localized = normalizeLocalizedImport(args.entry)
  if (!jsonEqual(sharedDraft?.shared ?? {}, args.entry.shared)) {
    changes.push({
      kind: 'shared_fields_update',
      collection: args.entry.collection,
      stableId: args.entry.stableId,
    })
  }
  if (!localeDraft) {
    changes.push({
      kind: 'locale_create',
      collection: args.entry.collection,
      stableId: args.entry.stableId,
      locale: args.entry.locale,
    })
    return changes
  }
  if (!jsonEqual(localeDraft.values ?? {}, localized)) {
    changes.push({
      kind: 'localized_fields_update',
      collection: args.entry.collection,
      stableId: args.entry.stableId,
      locale: args.entry.locale,
    })
  }
  const view = await readStudioDraftView(ctx, existing, args.collection)
  const localeView = view.locales.find((item) => item.locale === args.entry.locale)
  if (localeView?.draftPath !== args.entry.routePath) {
    changes.push({
      kind: 'route_update',
      collection: args.entry.collection,
      stableId: args.entry.stableId,
      locale: args.entry.locale,
      current: localeView?.draftPath ?? null,
      next: args.entry.routePath,
    })
  }
  if (
    (existing.orderRank ?? null) !==
    (args.entry.orderRank ?? existing.orderRank ?? args.entry.routePath)
  ) {
    changes.push({
      kind: 'navigation_order_update',
      collection: args.entry.collection,
      stableId: args.entry.stableId,
      current: existing.orderRank ?? null,
      next: args.entry.orderRank ?? args.entry.routePath,
    })
  }
  const currentSeo = isPlainObject(localeDraft.values?.seo) ? localeDraft.values.seo : null
  const nextSeo = isPlainObject(args.entry.seo) ? args.entry.seo : null
  if (!jsonEqual(currentSeo, nextSeo)) {
    changes.push({
      kind: 'seo_update',
      collection: args.entry.collection,
      stableId: args.entry.stableId,
      locale: args.entry.locale,
    })
  }
  const currentPublic = isPlainObject(localeDraft.values?.public) ? localeDraft.values.public : null
  const nextPublic = isPlainObject(args.entry.public) ? args.entry.public : null
  if (!jsonEqual(currentPublic, nextPublic)) {
    changes.push({
      kind: 'public_flags_update',
      collection: args.entry.collection,
      stableId: args.entry.stableId,
      locale: args.entry.locale,
    })
  }
  return changes
}

async function validateImportedEntryRelations(
  ctx: MutationCtx,
  args: {
    entry: ImportedEntry
    collection: Awaited<ReturnType<typeof getCollectionOrThrow>>
    incomingEntryKeys: Set<string>
  },
): Promise<JsonValue[]> {
  const relationBlockers: JsonValue[] = []
  const data = materializeFieldData(
    args.collection.fields,
    args.entry.shared,
    normalizeLocalizedImport(args.entry),
  )

  for (const reference of collectRelationReferences({
    fields: args.collection.fields,
    data,
  })) {
    const targetCollectionSlug = reference.targetCollectionSlug
    if (!targetCollectionSlug) {
      relationBlockers.push({
        kind: 'relation_missing_collection',
        entryKey: `${args.entry.collection}:${args.entry.stableId}:${args.entry.locale}`,
        field: reference.fieldPath,
        targetId: reference.targetId,
        safe: false,
        reason: `Relation field "${reference.fieldPath}" has no target collection configured in the active code-defined contract.`,
      })
      continue
    }

    if (args.incomingEntryKeys.has(`${targetCollectionSlug}:${reference.targetId}`)) continue

    const targetCollection = await ctx.db
      .query('collections')
      .withIndex('by_slug', (q) => q.eq('slug', targetCollectionSlug))
      .first()
    if (!targetCollection) {
      relationBlockers.push({
        kind: 'relation_target_collection_missing',
        entryKey: `${args.entry.collection}:${args.entry.stableId}:${args.entry.locale}`,
        field: reference.fieldPath,
        targetCollection: targetCollectionSlug,
        targetId: reference.targetId,
        safe: false,
        reason: `Relation field "${reference.fieldPath}" targets missing collection "${targetCollectionSlug}".`,
      })
      continue
    }

    const target = await ctx.db
      .query('entries')
      .withIndex('by_collection_stableId', (q) =>
        q.eq('collectionId', targetCollection._id).eq('stableId', reference.targetId),
      )
      .first()
    if (target) continue

    relationBlockers.push({
      kind: 'relation_target_missing',
      entryKey: `${args.entry.collection}:${args.entry.stableId}:${args.entry.locale}`,
      field: reference.fieldPath,
      targetCollection: targetCollectionSlug,
      targetId: reference.targetId,
      safe: false,
      reason: `Relation field "${reference.fieldPath}" points to missing ${targetCollectionSlug} entry "${reference.targetId}".`,
    })
  }

  return relationBlockers
}

async function validateImportedEntryParent(
  ctx: MutationCtx,
  args: {
    entry: ImportedEntry
    collection: Awaited<ReturnType<typeof getCollectionOrThrow>>
    validIncomingEntryKeys: Set<string>
  },
): Promise<JsonValue[]> {
  if (!args.entry.parentStableId) return []
  if (args.collection.type !== 'tree') {
    return [
      {
        kind: 'parent_entry_not_allowed',
        collection: args.entry.collection,
        stableId: args.entry.stableId,
        locale: args.entry.locale,
        parentStableId: args.entry.parentStableId,
        safe: false,
        reason: 'Imported parent entries require a tree collection.',
      },
    ]
  }

  const incomingParentKey = `${args.entry.collection}:${args.entry.parentStableId}`
  if (args.validIncomingEntryKeys.has(incomingParentKey)) return []

  const parent = await ctx.db
    .query('entries')
    .withIndex('by_collection_stableId', (q) =>
      q.eq('collectionId', args.collection._id).eq('stableId', args.entry.parentStableId as string),
    )
    .first()
  if (parent) return []

  return [
    {
      kind: 'parent_entry_missing',
      collection: args.entry.collection,
      stableId: args.entry.stableId,
      locale: args.entry.locale,
      parentStableId: args.entry.parentStableId,
      safe: false,
      reason: `Parent entry "${args.entry.parentStableId}" does not exist or is blocked in this import.`,
    },
  ]
}

function validateImportedEntryFields(args: {
  entry: ImportedEntry
  collection: Awaited<ReturnType<typeof getCollectionOrThrow>>
}): JsonValue[] {
  const localized = normalizeLocalizedImport(args.entry)
  const merged = materializeFieldData(args.collection.fields, args.entry.shared, localized)
  try {
    assertFieldDataValid(args.collection.fields, merged, { publish: false })
    return []
  } catch (error) {
    return [
      {
        kind: 'field_validation_failed',
        collection: args.entry.collection,
        stableId: args.entry.stableId,
        locale: args.entry.locale,
        safe: false,
        reason: error instanceof Error ? error.message : 'Imported field data failed validation.',
      },
    ]
  }
}

function addPublishTarget(
  targets: Map<string, ImportedEntryPublishTarget>,
  args: {
    entryId: Id<'entries'>
    collectionSlug: string
    locale: string
  },
) {
  const key = toStringId(args.entryId)
  const current = targets.get(key)
  if (current) {
    current.locales.add(args.locale)
    return
  }
  targets.set(key, {
    entryId: args.entryId,
    collectionSlug: args.collectionSlug,
    locales: new Set([args.locale]),
  })
}

async function resolveImportedParentEntryId(
  ctx: MutationCtx,
  args: {
    collectionId: Id<'collections'>
    collectionSlug: string
    parentStableId?: string | null
  },
) {
  if (!args.parentStableId) return null
  const parentStableId = args.parentStableId
  const parent = await ctx.db
    .query('entries')
    .withIndex('by_collection_stableId', (q) =>
      q.eq('collectionId', args.collectionId).eq('stableId', parentStableId),
    )
    .first()
  if (!parent) {
    throwCmsError('ENTRY_PARENT_NOT_FOUND', 'Imported parent entry not found', {
      collection: args.collectionSlug,
      parentStableId,
    })
  }
  return parent._id
}

async function upsertImportedEntry(
  ctx: MutationCtx,
  args: {
    entry: ImportedEntry
    appIdentityId: string
    now: number
  },
): Promise<{ action: 'created' | 'updated' | 'skipped'; entryId?: Id<'entries'> }> {
  const collection = await getCollectionOrThrow(ctx, args.entry.collection)
  assertValidLocaleCode(args.entry.locale, 'ENTRY_LOCALE_INVALID')
  assertValidSlug(args.entry.slug)

  const localized = normalizeLocalizedImport(args.entry)
  const localizedSlug = isLocalizedSlugImportMode(collection.routing.slugMode)
    ? args.entry.slug
    : null
  if (args.entry.parentStableId && collection.type !== 'tree') {
    throwCmsError('ENTRY_PARENT_NOT_ALLOWED', 'Imported parent entries require a tree collection', {
      collection: collection.slug,
      parentStableId: args.entry.parentStableId,
    })
  }
  const parentEntryId = await resolveImportedParentEntryId(ctx, {
    collectionId: collection._id,
    collectionSlug: collection.slug,
    parentStableId: args.entry.parentStableId,
  })

  const existing = await ctx.db
    .query('entries')
    .withIndex('by_collection_stableId', (q) =>
      q.eq('collectionId', collection._id).eq('stableId', args.entry.stableId),
    )
    .first()

  if (!existing) {
    const entryId = await ctx.db.insert('entries', {
      collectionId: collection._id,
      baseSlug: args.entry.slug,
      stableId: args.entry.stableId,
      status: 'draft',
      dirtyLocales: [args.entry.locale],
      parentEntryId,
      orderRank: args.entry.orderRank ?? args.entry.routePath,
      nodeKind: 'page',
      sortCache: {},
      draftVersion: 1,
      latestRevisionId: null,
      createdBy: args.appIdentityId,
      updatedBy: args.appIdentityId,
      publishedBy: null,
      createdAt: args.now,
      updatedAt: args.now,
      publishedAt: null,
    })

    await ctx.db.insert('entryDrafts', {
      entryId,
      locale: null,
      baseRevisionId: null,
      parentEntryId,
      orderRank: args.entry.orderRank ?? args.entry.routePath,
      slug: args.entry.slug,
      shared: args.entry.shared,
      updatedBy: args.appIdentityId,
      updatedAt: args.now,
    })
    await ctx.db.insert('entryDrafts', {
      entryId,
      locale: args.entry.locale,
      baseRevisionId: null,
      ...(localizedSlug ? { localeSlug: localizedSlug } : {}),
      values: localized,
      bodyMdc: args.entry.bodyMdc ?? '',
      updatedBy: args.appIdentityId,
      updatedAt: args.now,
    })
    await refreshDraftAssetRefsForSave(ctx, {
      entryId,
      collectionId: collection._id,
      sharedUpdated: true,
      affectedLocales: [args.entry.locale],
      now: args.now,
    })

    return { action: 'created', entryId }
  }

  const nextBaseSlug = isLocalizedSlugImportMode(collection.routing.slugMode)
    ? existing.baseSlug
    : args.entry.slug

  const result = await applyDraftPatch(ctx, {
    entryId: existing._id,
    expectedDraftVersion: existing.draftVersion,
    patch: {
      shared: {
        parentEntryId,
        orderRank: args.entry.orderRank ?? existing.orderRank ?? args.entry.routePath,
        slug: nextBaseSlug,
        shared: args.entry.shared,
      },
      locales: {
        [args.entry.locale]: {
          slug: localizedSlug,
          values: localized,
          bodyMdc: args.entry.bodyMdc ?? '',
        },
      },
    },
    appIdentity: args.appIdentityId,
    now: args.now,
  })
  await refreshDraftAssetRefsForSave(ctx, {
    entryId: existing._id,
    collectionId: collection._id,
    sharedUpdated: result.sharedUpdated,
    affectedLocales: result.affectedLocales,
    now: args.now,
  })

  return { action: 'updated', entryId: existing._id }
}

async function entryDepth(ctx: MutationCtx, entryId: Id<'entries'>) {
  let depth = 0
  let current = await ctx.db.get(entryId)
  const seen = new Set<string>()
  while (current?.parentEntryId) {
    const parentId = current.parentEntryId
    const key = toStringId(parentId)
    if (seen.has(key)) break
    seen.add(key)
    depth += 1
    current = await ctx.db.get(parentId)
  }
  return depth
}

async function publishImportedEntries(
  ctx: MutationCtx,
  args: {
    targets: ImportedEntryPublishTarget[]
    appIdentityId: string
    publishLocales?: string[] | null
  },
) {
  const requestedLocaleFilter = args.publishLocales ? new Set(args.publishLocales) : null
  const orderedTargets = await Promise.all(
    args.targets.map(async (target) => ({
      target,
      depth: await entryDepth(ctx, target.entryId),
    })),
  )
  orderedTargets.sort((left, right) => left.depth - right.depth)

  const published: string[] = []
  for (const { target } of orderedTargets) {
    const locales = Array.from(target.locales)
      .filter((locale) => !requestedLocaleFilter || requestedLocaleFilter.has(locale))
      .sort()
    if (locales.length === 0) continue

    const entry = await ctx.db.get(target.entryId)
    if (!entry) {
      throwCmsError('ENTRY_NOT_FOUND', 'Imported entry not found before publish', {
        entryId: toStringId(target.entryId),
      })
    }

    const expectedDraftHash = await computePublishDraftHash(ctx, {
      entryId: entry._id,
      locales,
    })
    await publishCurrentDraft(ctx, {
      entryId: entry._id,
      locales,
      expectedDraftVersion: entry.draftVersion,
      expectedDraftHash,
      appIdentity: args.appIdentityId,
      kind: 'publish',
      message: 'Published by collection import.',
    })
    published.push(toStringId(target.entryId))
  }

  return {
    published,
  }
}

export const previewImport = callerMutation.protected({
  id: 'imports:previewImport',
  args: previewImportArgs.args,
  guard: canManageCollections,
  returns: importPreviewResultValidator,
  handler: async (ctx, args) => {
    validateImportPublishLocales(args.publishLocales)
    const appIdentity = await ctx.appIdentity()
    const now = Date.now()
    const preview = []
    const entryPreview = []
    const warnings: JsonValue[] = []
    const blockers: JsonValue[] = []
    const incomingCollections = args.collections as Array<{ slug: string }>
    const incomingCollectionSlugs = new Set(
      incomingCollections.map((collection) => collection.slug),
    )
    const incomingEntryKeys = new Set(
      ((args.entries ?? []) as Array<{ collection: string; stableId: string }>).map(
        (entry) => `${entry.collection}:${entry.stableId}`,
      ),
    )

    for (const incoming of args.collections) {
      const incomingFields = normalizeFields(incoming.fields ?? [])
      validateImportedCollection(incoming, incomingFields)
      const contract = await compareImportedCollectionContract(ctx, incoming, incomingFields)
      const blocked = contract.changes.some(
        (change) =>
          typeof change === 'object' &&
          change !== null &&
          'safe' in change &&
          change.safe === false,
      )

      preview.push({
        slug: incoming.slug,
        exists: contract.exists,
        status: !contract.exists
          ? 'blocked'
          : contract.changes.length === 0
            ? 'noop'
            : blocked
              ? 'blocked'
              : 'mapped',
        changes: contract.changes,
      })
      if (!contract.exists) {
        blockers.push({
          kind: 'collection_missing',
          collection: incoming.slug,
        })
      } else if (blocked) {
        blockers.push(
          ...contract.changes
            .filter(
              (change) =>
                typeof change === 'object' &&
                change !== null &&
                'safe' in change &&
                change.safe === false,
            )
            .map((change) => ({ ...(change as JsonMap), collection: incoming.slug })),
        )
      }
    }

    for (const incoming of args.entries ?? []) {
      const collection = await ctx.db
        .query('collections')
        .withIndex('by_slug', (q) => q.eq('slug', incoming.collection))
        .first()
      if (!collection) {
        entryPreview.push({
          collection: incoming.collection,
          stableId: incoming.stableId,
          locale: incoming.locale,
          status: 'blocked',
          changes: [],
          reason: incomingCollectionSlugs.has(incoming.collection)
            ? 'Collection is included in the source import but is not defined in the active code contract.'
            : 'Collection does not exist in the active code contract.',
        })
        blockers.push({
          kind: 'collection_missing',
          collection: incoming.collection,
          stableId: incoming.stableId,
          locale: incoming.locale,
        })
        continue
      }
      const existing = await ctx.db
        .query('entries')
        .withIndex('by_collection_stableId', (q) =>
          q.eq('collectionId', collection._id).eq('stableId', incoming.stableId),
        )
        .first()
      if (
        incoming.parentStableId &&
        !incomingEntryKeys.has(`${incoming.collection}:${incoming.parentStableId}`)
      ) {
        const parent = await ctx.db
          .query('entries')
          .withIndex('by_collection_stableId', (q) =>
            q.eq('collectionId', collection._id).eq('stableId', incoming.parentStableId),
          )
          .first()
        if (!parent) {
          entryPreview.push({
            collection: incoming.collection,
            stableId: incoming.stableId,
            locale: incoming.locale,
            status: 'blocked',
            changes: [],
            reason: `Parent entry "${incoming.parentStableId}" does not exist.`,
          })
          blockers.push({
            kind: 'parent_entry_missing',
            collection: incoming.collection,
            stableId: incoming.stableId,
            locale: incoming.locale,
            parentStableId: incoming.parentStableId,
          })
          continue
        }
      }
      const fullCollection = await getCollectionOrThrow(ctx, incoming.collection)
      const relationBlockers = await validateImportedEntryRelations(ctx, {
        entry: incoming as ImportedEntry,
        collection: fullCollection,
        incomingEntryKeys,
      })
      if (relationBlockers.length > 0) {
        entryPreview.push({
          collection: incoming.collection,
          stableId: incoming.stableId,
          locale: incoming.locale,
          status: 'blocked',
          changes: [],
          reason: 'Entry has relation fields pointing at missing collections or entries.',
          blockers: relationBlockers,
        })
        blockers.push(...relationBlockers)
        continue
      }
      const changes = await describeImportedEntryChanges(ctx, {
        entry: incoming as ImportedEntry,
        collection: fullCollection,
      })
      entryPreview.push({
        collection: incoming.collection,
        stableId: incoming.stableId,
        locale: incoming.locale,
        status: existing ? (changes.length === 0 ? 'noop' : 'update') : 'create',
        changes,
        publish: args.publish === true,
      })
    }

    const assetPreview = (
      (args.assets ?? []) as Array<{
        sourcePath: string
        referencedBy: JsonValue
      }>
    ).map((asset) => ({
      sourcePath: asset.sourcePath,
      referencedBy: asset.referencedBy,
      status: args.allowUnresolvedAssets === true ? 'allowed_unresolved' : 'blocked',
      reason:
        args.allowUnresolvedAssets === true
          ? 'Filesystem import detected an unresolved asset reference. Import can proceed because allowUnresolvedAssets is enabled, but the reference may be broken in rendered content.'
          : 'Filesystem import detected an unresolved asset reference. Upload/map the asset before applying, or explicitly allow unresolved assets for a non-publishing import.',
    }))
    if (args.allowUnresolvedAssets === true) warnings.push(...assetPreview)
    else blockers.push(...unresolvedAssetBlockers(args.assets ?? []))
    const status: ImportRunStatus =
      preview.some((collection) => collection.status === 'blocked') ||
      entryPreview.some((entry) => entry.status === 'blocked') ||
      ((args.assets?.length ?? 0) > 0 && args.allowUnresolvedAssets !== true)
        ? 'blocked'
        : 'previewed'
    const summary = importRunSummary({
      status,
      collectionCount: args.collections.length,
      entryCount: args.entries?.length ?? 0,
      assetCount: args.assets?.length ?? 0,
      blockerCount: blockers.length,
      warningCount: warnings.length,
    })
    const result: JsonMap = {
      status,
      collections: preview,
      entries: entryPreview,
      assets: assetPreview,
      warnings,
      blockers,
      summary,
    }
    const importRunId = await recordImportRun(ctx, {
      kind: 'preview',
      status,
      appIdentityId: appIdentity.userId,
      now,
      request: summarizeImportArgs(args),
      result,
      summary,
    })

    return {
      importRunId,
      ...result,
    }
  },
})

export const applyImport = callerMutation.protected({
  id: 'imports:applyImport',
  args: applyImportArgs.args,
  guard: canManageCollections,
  returns: importResultValidator,
  handler: async (ctx, args) => {
    validateImportPublishLocales(args.publishLocales)
    const appIdentity = await ctx.appIdentity()

    const created: string[] = []
    const updated: string[] = []
    const noops: string[] = []
    const blockedChanges: JsonValue[] = []
    const entryCreated: string[] = []
    const entryUpdated: string[] = []
    const entrySkipped: string[] = []
    const importChanges: JsonValue[] = []
    const warnings: JsonValue[] = []
    const publishTargetsByEntryId = new Map<string, ImportedEntryPublishTarget>()
    const now = Date.now()
    const blockedCollections = new Set<string>()
    const plannedEntries = new Map<string, PlannedImportEntry>()

    if (args.assets?.length && args.allowUnresolvedAssets !== true) {
      blockedChanges.push(...unresolvedAssetBlockers(args.assets))
    }

    for (const incoming of args.collections) {
      const incomingFields = normalizeFields(incoming.fields ?? [])
      validateImportedCollection(incoming, incomingFields)
      const contract = await compareImportedCollectionContract(ctx, incoming, incomingFields)
      if (!contract.exists) {
        blockedCollections.add(incoming.slug)
        blockedChanges.push({
          collection: incoming.slug,
          kind: 'collection_missing',
          reason:
            'Collection is not defined in the active code contract. Run config sync or add the collection in code before importing content.',
        })
        continue
      }
      const unsafeChanges = contract.changes.filter(
        (change) =>
          typeof change === 'object' &&
          change !== null &&
          'safe' in change &&
          change.safe === false,
      )
      if (unsafeChanges.length > 0) {
        blockedCollections.add(incoming.slug)
        blockedChanges.push(
          ...unsafeChanges.map((change) => ({
            ...(change as JsonMap),
            collection: incoming.slug,
          })),
        )
      } else if (contract.changes.length > 0) {
        updated.push(incoming.slug)
      } else {
        noops.push(incoming.slug)
      }
    }

    const assetBlocked = blockedChanges.some(
      (change) =>
        typeof change === 'object' &&
        change !== null &&
        'kind' in change &&
        (change as JsonMap).kind === 'asset_unresolved',
    )

    for (const incoming of args.entries ?? []) {
      const entryKey = `${incoming.collection}:${incoming.stableId}:${incoming.locale}`
      if (blockedCollections.has(incoming.collection) || assetBlocked) {
        entrySkipped.push(entryKey)
        continue
      }

      const collectionDoc = await ctx.db
        .query('collections')
        .withIndex('by_slug', (q) => q.eq('slug', incoming.collection))
        .first()
      if (!collectionDoc) {
        blockedChanges.push({
          kind: 'collection_missing',
          collection: incoming.collection,
          stableId: incoming.stableId,
          locale: incoming.locale,
          safe: false,
          reason: 'Collection does not exist in the active code contract.',
        })
        entrySkipped.push(entryKey)
        continue
      }
      const collection = await getCollectionOrThrow(ctx, incoming.collection)
      const fieldBlockers = validateImportedEntryFields({
        entry: incoming as ImportedEntry,
        collection,
      })
      if (fieldBlockers.length > 0) {
        blockedChanges.push(...fieldBlockers)
        entrySkipped.push(entryKey)
        continue
      }
      const changes = await describeImportedEntryChanges(ctx, {
        entry: incoming as ImportedEntry,
        collection,
      })
      importChanges.push(
        ...changes.map((change) => ({
          ...(change as JsonMap),
          collection: incoming.collection,
          stableId: incoming.stableId,
          locale: incoming.locale,
        })),
      )
      plannedEntries.set(entryKey, {
        entry: incoming as ImportedEntry,
        collection,
        changes: changes as JsonMap[],
      })
    }

    const blockedEntryKeys = new Set(entrySkipped)
    let relationPlanChanged = true
    while (relationPlanChanged) {
      relationPlanChanged = false
      const validIncomingEntryKeys = new Set(
        Array.from(plannedEntries.values())
          .filter((planned) => {
            const key = `${planned.entry.collection}:${planned.entry.stableId}:${planned.entry.locale}`
            return !blockedEntryKeys.has(key)
          })
          .map((planned) => `${planned.entry.collection}:${planned.entry.stableId}`),
      )

      for (const [entryKey, planned] of plannedEntries) {
        if (blockedEntryKeys.has(entryKey)) continue
        const parentBlockers = await validateImportedEntryParent(ctx, {
          entry: planned.entry,
          collection: planned.collection,
          validIncomingEntryKeys,
        })
        const relationBlockers = await validateImportedEntryRelations(ctx, {
          entry: planned.entry,
          collection: planned.collection,
          incomingEntryKeys: validIncomingEntryKeys,
        })
        const blockers = [...parentBlockers, ...relationBlockers]
        if (blockers.length === 0) continue
        blockedChanges.push(...blockers)
        entrySkipped.push(entryKey)
        blockedEntryKeys.add(entryKey)
        relationPlanChanged = true
      }
    }

    if (blockedChanges.length === 0) {
      for (const [entryKey, planned] of plannedEntries) {
        if (planned.changes.length === 0) {
          noops.push(entryKey)
          if (args.publish === true) {
            const existing = await ctx.db
              .query('entries')
              .withIndex('by_collection_stableId', (q) =>
                q.eq('collectionId', planned.collection._id).eq('stableId', planned.entry.stableId),
              )
              .first()
            if (existing) {
              addPublishTarget(publishTargetsByEntryId, {
                entryId: existing._id,
                collectionSlug: planned.entry.collection,
                locale: planned.entry.locale,
              })
            }
          }
          continue
        }

        const result = await upsertImportedEntry(ctx, {
          entry: planned.entry,
          appIdentityId: appIdentity.userId,
          now,
        })
        const id = result.entryId ? toStringId(result.entryId) : planned.entry.stableId
        if (result.action === 'created') entryCreated.push(id)
        if (result.action === 'updated') entryUpdated.push(id)
        if (result.action === 'skipped') entrySkipped.push(id)
        if (result.entryId && args.publish === true) {
          addPublishTarget(publishTargetsByEntryId, {
            entryId: result.entryId,
            collectionSlug: planned.entry.collection,
            locale: planned.entry.locale,
          })
        }
      }
    }

    const publishResult =
      args.publish === true && blockedChanges.length === 0
        ? await publishImportedEntries(ctx, {
            targets: Array.from(publishTargetsByEntryId.values()),
            appIdentityId: appIdentity.userId,
            publishLocales: args.publishLocales ?? null,
          })
        : {
            published: [],
          }

    if (args.allowUnresolvedAssets === true && args.assets?.length) {
      warnings.push(
        ...(args.assets as Array<{ sourcePath: string; referencedBy: JsonValue }>).map((asset) => ({
          kind: 'asset_unresolved_allowed',
          sourcePath: asset.sourcePath,
          referencedBy: asset.referencedBy,
          reason:
            'Unresolved asset reference was allowed explicitly. Rendered content may contain broken media until this asset is uploaded and rewritten.',
        })),
      )
    }
    const status: ImportRunStatus =
      blockedChanges.length > 0
        ? 'blocked'
        : args.publish === true
          ? publishResult.published.length > 0
            ? 'published'
            : 'applied'
          : 'applied'
    const summary = importRunSummary({
      status,
      collectionCount: args.collections.length,
      entryCount: args.entries?.length ?? 0,
      assetCount: args.assets?.length ?? 0,
      blockerCount: blockedChanges.length,
      warningCount: warnings.length,
      publishedCount: publishResult.published.length,
    })
    const result: JsonMap = {
      status,
      created,
      updated,
      skipped: [],
      noops,
      blockedChanges,
      warnings,
      changes: importChanges,
      summary,
      entries: {
        created: entryCreated,
        updated: entryUpdated,
        skipped: entrySkipped,
        published: publishResult.published,
      },
      assets: {
        referenced: args.assets?.length ?? 0,
        uploaded: 0,
        skipped: args.assets?.length ?? 0,
        unresolvedAllowed: args.allowUnresolvedAssets === true,
      },
    }
    const importRunId = await recordImportRun(ctx, {
      kind: 'apply',
      status,
      appIdentityId: appIdentity.userId,
      now,
      request: summarizeImportArgs(args),
      result,
      summary,
    })

    return {
      importRunId,
      ...result,
    }
  },
})

export const listImportRuns = callerQuery.protected({
  id: 'imports:listImportRuns',
  args: listImportRunsArgs.args,
  guard: canManageCollections,
  returns: v.array(importRunValidator),
  handler: async (ctx, args) => {
    if (args.importRunId) {
      const importRunId = args.importRunId
      const row = await ctx.db
        .query('collectionImportRuns')
        .withIndex('by_import_run', (q) => q.eq('importRunId', importRunId))
        .first()
      return row ? [formatImportRun(row)] : []
    }

    const limit = Math.max(1, Math.min(args.limit ?? 20, 100))
    const rows = await ctx.db
      .query('collectionImportRuns')
      .withIndex('by_created_at')
      .order('desc')
      .take(limit)
    return rows.map(formatImportRun)
  },
})

function formatImportRun(row: {
  _id: Id<'collectionImportRuns'>
  importRunId: string
  kind: 'preview' | 'apply'
  status?: ImportRunStatus
  publish: boolean
  publishLocales: string[]
  source?: JsonMap
  request?: JsonMap
  summary?: JsonMap
  collectionSlugs: string[]
  collectionCount: number
  entryCount: number
  assetCount: number
  result: JsonMap
  createdBy: string
  createdAt: number
}) {
  return {
    _id: toStringId(row._id),
    importRunId: row.importRunId,
    kind: row.kind,
    status: row.status ?? (row.kind === 'preview' ? 'previewed' : 'applied'),
    publish: row.publish,
    publishLocales: row.publishLocales,
    source: row.source ?? {},
    request: row.request ?? {},
    summary: row.summary ?? {},
    collectionSlugs: row.collectionSlugs,
    collectionCount: row.collectionCount,
    entryCount: row.entryCount,
    assetCount: row.assetCount,
    result: row.result,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
  }
}
