import { jsonObjectValidator } from '@lupinum/ginko-cms-contract/convex/validators.js'
import {
  normalizeContentPath,
  uniqueContentTags,
} from '@lupinum/ginko-cms-contract/shared/contentTags.js'
import { materializeFieldData } from '@lupinum/ginko-cms-contract/shared/fields/materialize.js'
import type { JsonObject } from '@lupinum/ginko-cms-contract/shared/types.js'
import {
  assertResolvedContentContract,
  hashCanonicalJson,
  type ResolvedContentContractV1,
} from '@lupinum/ginko-content/cms-contract'
import { v } from 'convex/values'

import type { Doc, Id } from './_generated/dataModel.js'
import { recomputeEntryDerivedState } from './collections/sync.js'
import { refreshDraftAssetRefsForSave } from './entries/workflow/commands.js'
import { readDraftRows, applyDraftPatch, type SaveDraftPatch } from './entries/workflow/drafts.js'
import { deleteAllPublicProjections } from './entries/workflow/projection.js'
import { throwCmsError } from './errors.js'
import { directInternalMutation, directInternalQuery } from './functions.js'
import { getCollectionOrThrow } from './lib/collections.js'
import { toStringId } from './lib/ids.js'
import type { MutationCtx, QueryOrMutationCtx } from './lib/types.js'
import { assertFieldDataValid } from './lib/validation.js'
import { collectionProjection, installCmsPolicyHandler } from './policy.js'
import { scheduleRevalidationOutboxDelivery } from './revalidation.js'

const MIGRATION_PAGE_SIZE_DEFAULT = 100
const MIGRATION_PAGE_SIZE_MAX = 250
const MIGRATION_APP_IDENTITY = 'ginko-cms-cli:migration'
const MIGRATION_MAX_ENTRIES = 1_000
const MIGRATION_MAX_PUBLIC_ROWS = 5_000
const APPROVAL_TTL_MS = 60 * 60 * 1000

const contentMigrationLocaleValidator = v.union(
  v.object({
    values: jsonObjectValidator,
    bodyMdc: v.optional(v.union(v.string(), v.null())),
  }),
  v.null(),
)

const contentMigrationEntryValidator = v.object({
  collection: v.string(),
  entryId: v.string(),
  stableId: v.union(v.string(), v.null()),
  draftVersion: v.number(),
  shared: jsonObjectValidator,
  locales: v.record(v.string(), contentMigrationLocaleValidator),
})

const listContentMigrationEntriesArgs = {
  collection: v.string(),
  cursor: v.union(v.string(), v.null()),
  limit: v.optional(v.number()),
  runId: v.optional(v.id('contentMigrationRuns')),
}

const listContentMigrationEntriesReturns = v.object({
  page: v.array(contentMigrationEntryValidator),
  isDone: v.boolean(),
  continueCursor: v.union(v.string(), v.null()),
})

function pageSize(limit: number | undefined) {
  return Math.max(1, Math.min(limit ?? MIGRATION_PAGE_SIZE_DEFAULT, MIGRATION_PAGE_SIZE_MAX))
}

async function contentMigrationEntrySnapshot(
  ctx: QueryOrMutationCtx,
  collection: Doc<'collections'>,
  entry: Doc<'entries'>,
) {
  const drafts = await readDraftRows(ctx, entry._id)
  const locales: Record<string, { values: JsonObject; bodyMdc?: string | null } | null> = {}

  for (const locale of new Set([...collection.locales, ...Object.keys(drafts.byLocale)])) {
    const row = drafts.byLocale[locale] ?? null
    locales[locale] = row
      ? {
          values: (row.values ?? {}) as JsonObject,
          ...(row.bodyMdc !== undefined ? { bodyMdc: row.bodyMdc ?? null } : {}),
        }
      : null
  }

  return {
    collection: collection.slug,
    entryId: toStringId(entry._id),
    stableId: entry.stableId ?? null,
    draftVersion: entry.draftVersion,
    shared: (drafts.shared?.shared ?? {}) as JsonObject,
    locales,
  }
}

function asEntryId(ctx: MutationCtx, value: string): Id<'entries'> {
  const entryId = ctx.db.normalizeId('entries', value)
  if (!entryId) {
    throwCmsError('CONTENT_MIGRATION_ENTRY_INVALID', `Invalid entry id "${value}".`, {
      entryId: value,
    })
  }
  return entryId
}

function migrationPatch(input: {
  shared: JsonObject
  locales: Record<string, { values: JsonObject; bodyMdc?: string | null } | null>
}): SaveDraftPatch {
  const locales: SaveDraftPatch['locales'] = {}
  for (const [locale, value] of Object.entries(input.locales)) {
    if (!value) continue
    locales[locale] = {
      values: value.values,
      ...(value.bodyMdc !== undefined ? { bodyMdc: value.bodyMdc } : {}),
    }
  }

  return {
    shared: { shared: input.shared },
    locales,
  }
}

export async function listContentMigrationEntriesHandler(
  ctx: QueryOrMutationCtx,
  args: {
    collection: string
    cursor: string | null
    limit?: number
    runId?: Id<'contentMigrationRuns'>
  },
) {
  const collection = await getCollectionOrThrow(ctx, args.collection)
  const entries = await ctx.db
    .query('entries')
    .withIndex('by_collection_status', (q) => q.eq('collectionId', collection._id))
    .collect()
  const limit = pageSize(args.limit)
  const cursorIndex =
    args.cursor === null
      ? null
      : entries.findIndex((entry) => toStringId(entry._id) === args.cursor)
  const startIndex = cursorIndex === null ? 0 : cursorIndex + 1

  if (cursorIndex !== null && cursorIndex < 0) {
    throwCmsError('CONTENT_MIGRATION_CURSOR_INVALID', 'Migration cursor is no longer valid.', {
      collection: collection.slug,
      cursor: args.cursor,
    })
  }

  const page = []
  let scanIndex = startIndex
  while (scanIndex < entries.length && page.length < limit) {
    const entry = entries[scanIndex]!
    scanIndex += 1
    if (args.runId) {
      const receipt = await ctx.db
        .query('contentMigrationEntryReceipts')
        .withIndex('by_run_entry', (query) =>
          query.eq('runId', args.runId!).eq('entryId', entry._id),
        )
        .first()
      if (receipt) {
        const current = await contentMigrationEntrySnapshot(ctx, collection, entry)
        const comparable = { ...current, draftVersion: receipt.appliedDraftVersion - 1 }
        if (
          current.draftVersion !== receipt.appliedDraftVersion ||
          (await hashCanonicalJson(comparable)) !== receipt.outputHash
        ) {
          throw new Error(
            `Entry "${toStringId(entry._id)}" changed after migration; resolve the conflict before retrying.`,
          )
        }
        continue
      }
    }
    page.push(entry)
  }
  const isDone = scanIndex >= entries.length

  return {
    page: await Promise.all(
      page.map((entry) => contentMigrationEntrySnapshot(ctx, collection, entry)),
    ),
    isDone,
    continueCursor: isDone ? null : toStringId(entries[scanIndex - 1]!._id),
  }
}

export const listContentMigrationEntries = directInternalQuery({
  id: 'migrations:listContentMigrationEntries',
  args: listContentMigrationEntriesArgs,
  returns: listContentMigrationEntriesReturns,
  handler: async (ctx, args) => await listContentMigrationEntriesHandler(ctx, args),
})

export const beginContentMigration = directInternalMutation({
  id: 'migrations:beginContentMigration',
  args: {
    migrationId: v.string(),
    sourceHash: v.string(),
    toContractHash: v.string(),
  },
  returns: v.object({
    runId: v.id('contentMigrationRuns'),
    status: v.string(),
    fromContractHash: v.string(),
    toContractHash: v.string(),
  }),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('contentMigrationRuns')
      .withIndex('by_migration_id', (query) => query.eq('migrationId', args.migrationId))
      .first()
    if (existing) {
      if (existing.sourceHash !== args.sourceHash) {
        throw new Error(`Migration "${args.migrationId}" source hash does not match its run.`)
      }
      if (existing.toContractHash !== args.toContractHash) {
        throw new Error(`Migration "${args.migrationId}" target contract does not match its run.`)
      }
      return {
        runId: existing._id,
        status: existing.status,
        fromContractHash: existing.fromContractHash,
        toContractHash: existing.toContractHash,
      }
    }

    const activePolicy = await ctx.db
      .query('cmsPolicies')
      .withIndex('by_key', (query) => query.eq('key', 'active'))
      .first()
    if (!activePolicy) throw new Error('Cannot begin a migration without an installed CMS policy.')
    const runId = await ctx.db.insert('contentMigrationRuns', {
      migrationId: args.migrationId,
      sourceHash: args.sourceHash,
      fromContractHash: activePolicy.contractSha256,
      toContractHash: args.toContractHash,
      status: 'planned',
      cursor: null,
      startedAt: Date.now(),
      completedAt: null,
    })
    return {
      runId,
      status: 'planned',
      fromContractHash: activePolicy.contractSha256,
      toContractHash: args.toContractHash,
    }
  },
})

export const applyContentMigrationBatch = directInternalMutation({
  id: 'migrations:applyContentMigrationBatch',
  args: {
    runId: v.id('contentMigrationRuns'),
    cursor: v.string(),
    entries: v.array(
      v.object({
        inputHash: v.string(),
        outputHash: v.string(),
        entry: contentMigrationEntryValidator,
      }),
    ),
  },
  returns: v.object({ changed: v.number(), skipped: v.number() }),
  handler: async (ctx, args) => {
    if (args.entries.length > 50) {
      throw new Error('Content migration batches are limited to 50 entries.')
    }
    const run = await ctx.db.get(args.runId)
    if (!run) throw new Error('Content migration run does not exist.')
    if (!['planned', 'applying'].includes(run.status)) {
      throw new Error(`Content migration run cannot apply batches from status "${run.status}".`)
    }

    let changed = 0
    let skipped = 0
    const now = Date.now()
    for (const item of args.entries) {
      if ((await hashCanonicalJson(item.entry)) !== item.outputHash) {
        throw new Error(`Migration output hash mismatch for entry "${item.entry.entryId}".`)
      }
      const entryId = asEntryId(ctx, item.entry.entryId)
      const entry = await ctx.db.get(entryId)
      if (!entry) throw new Error(`Migration entry "${item.entry.entryId}" no longer exists.`)
      const collection = await ctx.db.get(entry.collectionId)
      if (!collection || collection.slug !== item.entry.collection) {
        throw new Error(`Migration entry "${item.entry.entryId}" changed collection.`)
      }
      const receipt = await ctx.db
        .query('contentMigrationEntryReceipts')
        .withIndex('by_run_entry', (query) => query.eq('runId', args.runId).eq('entryId', entryId))
        .first()
      const current = await contentMigrationEntrySnapshot(ctx, collection, entry)
      if (receipt) {
        const comparable = { ...current, draftVersion: receipt.appliedDraftVersion - 1 }
        if (
          current.draftVersion !== receipt.appliedDraftVersion ||
          (await hashCanonicalJson(comparable)) !== receipt.outputHash
        ) {
          throw new Error(
            `Entry "${item.entry.entryId}" changed after migration; resolve the conflict before retrying.`,
          )
        }
        skipped += 1
        continue
      }
      if ((await hashCanonicalJson(current)) !== item.inputHash) {
        throw new Error(
          `Entry "${item.entry.entryId}" changed after planning; re-plan before applying.`,
        )
      }
      const result = await applyDraftPatch(ctx, {
        entryId,
        expectedDraftVersion: item.entry.draftVersion,
        patch: migrationPatch(item.entry),
        appIdentity: MIGRATION_APP_IDENTITY,
        now,
      })
      const drafts = await readDraftRows(ctx, entryId)
      for (const [locale, value] of Object.entries(item.entry.locales)) {
        if (value !== null) continue
        const row = drafts.byLocale[locale]
        if (row) await ctx.db.delete(row._id)
      }
      await refreshDraftAssetRefsForSave(ctx, {
        entryId,
        collectionId: result.entry.collectionId,
        sharedUpdated: result.sharedUpdated,
        affectedLocales: result.affectedLocales,
        now,
      })
      await ctx.db.insert('contentMigrationEntryReceipts', {
        runId: args.runId,
        entryId,
        inputHash: item.inputHash,
        outputHash: item.outputHash,
        appliedDraftVersion: result.entry.draftVersion,
        appliedAt: now,
      })
      changed += 1
    }
    await ctx.db.patch(args.runId, { status: 'applying', cursor: args.cursor })
    return { changed, skipped }
  },
})

function validateEntryAgainstContract(
  contract: ResolvedContentContractV1,
  snapshot: Awaited<ReturnType<typeof contentMigrationEntrySnapshot>>,
) {
  const resolved = contract.collections[snapshot.collection]
  if (!resolved)
    throw new Error(`Collection "${snapshot.collection}" is absent from target policy.`)
  const projection = collectionProjection(resolved)
  const sharedKeys = new Set(
    projection.fields.filter((field) => !field.localized).map((field) => field.key),
  )
  const localizedKeys = new Set(
    projection.fields.filter((field) => field.localized).map((field) => field.key),
  )
  for (const key of Object.keys(snapshot.shared)) {
    if (!sharedKeys.has(key)) {
      throw new Error(`Entry "${snapshot.entryId}" has unknown shared field "${key}".`)
    }
  }
  for (const [locale, value] of Object.entries(snapshot.locales)) {
    if (!value) continue
    if (!resolved.locales.includes(locale)) {
      throw new Error(`Entry "${snapshot.entryId}" retains removed locale "${locale}".`)
    }
    for (const key of Object.keys(value.values)) {
      if (!localizedKeys.has(key)) {
        throw new Error(
          `Entry "${snapshot.entryId}" has unknown localized field "${key}" in "${locale}".`,
        )
      }
    }
    const merged = materializeFieldData(projection.fields, snapshot.shared, value.values)
    assertFieldDataValid(projection.fields, merged, { publish: false })
  }
}

export const finalizeContentMigration = directInternalMutation({
  id: 'migrations:finalizeContentMigration',
  args: {
    runId: v.id('contentMigrationRuns'),
    contract: jsonObjectValidator,
    contractSha256: v.string(),
    publicStrategy: v.union(v.literal('preserve'), v.literal('rebuild'), v.literal('unpublish')),
  },
  returns: v.object({
    validatedEntryCount: v.number(),
    fromContractHash: v.string(),
    toContractHash: v.string(),
    expiresAt: v.number(),
  }),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId)
    if (!run) throw new Error('Content migration run does not exist.')
    if (!['planned', 'applying', 'validating', 'ready'].includes(run.status)) {
      throw new Error(`Content migration cannot finalize from status "${run.status}".`)
    }
    const contract = assertResolvedContentContract(args.contract)
    if (
      args.contractSha256 !== run.toContractHash ||
      (await hashCanonicalJson(args.contract)) !== args.contractSha256
    ) {
      throw new Error('Content migration target contract hash does not match its run.')
    }
    const active = await ctx.db
      .query('cmsPolicies')
      .withIndex('by_key', (query) => query.eq('key', 'active'))
      .first()
    if (active?.contractSha256 !== run.fromContractHash) {
      throw new Error('Installed policy changed after the migration began.')
    }
    const entries = await ctx.db.query('entries').take(MIGRATION_MAX_ENTRIES + 1)
    if (entries.length > MIGRATION_MAX_ENTRIES) {
      throw new Error(`Content migration validation exceeds ${MIGRATION_MAX_ENTRIES} entries.`)
    }
    const previousReceipts = await ctx.db
      .query('contentMigrationValidationReceipts')
      .withIndex('by_run', (query) => query.eq('runId', args.runId))
      .collect()
    for (const receipt of previousReceipts) await ctx.db.delete(receipt._id)
    const now = Date.now()
    for (const entry of entries) {
      const collection = await ctx.db.get(entry.collectionId)
      if (!collection) throw new Error(`Entry "${toStringId(entry._id)}" has no collection.`)
      const snapshot = await contentMigrationEntrySnapshot(ctx, collection, entry)
      validateEntryAgainstContract(contract, snapshot)
      await ctx.db.insert('contentMigrationValidationReceipts', {
        runId: args.runId,
        entryId: entry._id,
        entryHash: await hashCanonicalJson(snapshot),
        draftVersion: entry.draftVersion,
        validatedAt: now,
      })
    }
    const publicRows = await ctx.db.query('publicEntries').take(1)
    if (
      args.publicStrategy === 'preserve' &&
      publicRows.length > 0 &&
      run.fromContractHash !== run.toContractHash
    ) {
      throw new Error('Preserve requires proof that public projections are unaffected.')
    }
    const existingApproval = await ctx.db
      .query('contractTransitionApprovals')
      .withIndex('by_run', (query) => query.eq('runId', args.runId))
      .first()
    if (existingApproval) await ctx.db.delete(existingApproval._id)
    const expiresAt = now + APPROVAL_TTL_MS
    await ctx.db.insert('contractTransitionApprovals', {
      runId: args.runId,
      migrationId: run.migrationId,
      sourceHash: run.sourceHash,
      fromContractHash: run.fromContractHash,
      toContractHash: run.toContractHash,
      publicStrategy: args.publicStrategy,
      validatedEntryCount: entries.length,
      expiresAt,
      consumedAt: null,
    })
    await ctx.db.patch(args.runId, {
      status: 'ready',
      cursor: null,
      completedAt: now,
    })
    return {
      validatedEntryCount: entries.length,
      fromContractHash: run.fromContractHash,
      toContractHash: run.toContractHash,
      expiresAt,
    }
  },
})

export const activateContentMigration = directInternalMutation({
  id: 'migrations:activateContentMigration',
  args: {
    runId: v.id('contentMigrationRuns'),
    contract: jsonObjectValidator,
    contractSha256: v.string(),
  },
  returns: v.object({ status: v.literal('activated'), contractSha256: v.string() }),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId)
    if (!run || run.status !== 'ready') {
      throw new Error('Content migration approval is consumed or its run is not ready.')
    }
    const approval = await ctx.db
      .query('contractTransitionApprovals')
      .withIndex('by_run', (query) => query.eq('runId', args.runId))
      .first()
    const now = Date.now()
    if (!approval || approval.consumedAt !== null) throw new Error('Approval is already consumed.')
    if (approval.expiresAt <= now) throw new Error('Contract transition approval expired.')
    assertResolvedContentContract(args.contract)
    if (
      args.contractSha256 !== approval.toContractHash ||
      args.contractSha256 !== run.toContractHash ||
      (await hashCanonicalJson(args.contract)) !== args.contractSha256
    ) {
      throw new Error('Activation target contract hash does not match its approval.')
    }
    const active = await ctx.db
      .query('cmsPolicies')
      .withIndex('by_key', (query) => query.eq('key', 'active'))
      .first()
    if (active?.contractSha256 !== approval.fromContractHash) {
      throw new Error('Installed policy changed after transition approval.')
    }
    const entries = await ctx.db.query('entries').take(MIGRATION_MAX_ENTRIES + 1)
    if (entries.length !== approval.validatedEntryCount) {
      throw new Error('Entry set changed after validation; finalize the migration again.')
    }
    for (const entry of entries) {
      const receipt = await ctx.db
        .query('contentMigrationValidationReceipts')
        .withIndex('by_run_entry', (query) =>
          query.eq('runId', args.runId).eq('entryId', entry._id),
        )
        .first()
      const collection = await ctx.db.get(entry.collectionId)
      if (!receipt || !collection) throw new Error('Entry set changed after validation.')
      const snapshot = await contentMigrationEntrySnapshot(ctx, collection, entry)
      if (
        entry.draftVersion !== receipt.draftVersion ||
        (await hashCanonicalJson(snapshot)) !== receipt.entryHash
      ) {
        throw new Error(`Entry "${toStringId(entry._id)}" changed after validation.`)
      }
    }

    const oldPublicEntries = await ctx.db.query('publicEntries').take(MIGRATION_MAX_PUBLIC_ROWS + 1)
    const oldPublicRoutes = await ctx.db.query('publicRoutes').take(MIGRATION_MAX_PUBLIC_ROWS + 1)
    if (
      oldPublicEntries.length > MIGRATION_MAX_PUBLIC_ROWS ||
      oldPublicRoutes.length > MIGRATION_MAX_PUBLIC_ROWS
    ) {
      throw new Error(`Contract transition exceeds ${MIGRATION_MAX_PUBLIC_ROWS} public rows.`)
    }
    await installCmsPolicyHandler(
      ctx,
      { contract: args.contract, contractSha256: args.contractSha256 },
      { allowIncompatible: true, scheduleReindex: false },
    )
    if (approval.publicStrategy === 'unpublish') {
      for (const entry of entries) await deleteAllPublicProjections(ctx, entry._id)
    } else if (approval.publicStrategy === 'rebuild') {
      for (const entry of entries) {
        const collectionRow = await ctx.db.get(entry.collectionId)
        if (!collectionRow) continue
        const collection = await getCollectionOrThrow(ctx, collectionRow.slug)
        await recomputeEntryDerivedState(ctx, collection, entry)
      }
    }
    const newPublicEntries = await ctx.db.query('publicEntries').take(MIGRATION_MAX_PUBLIC_ROWS + 1)
    const newPublicRoutes = await ctx.db.query('publicRoutes').take(MIGRATION_MAX_PUBLIC_ROWS + 1)
    if (oldPublicEntries.length > 0 || newPublicEntries.length > 0) {
      await ctx.db.insert('outboxEvents', {
        type: 'content.revalidate',
        status: 'pending',
        idempotencyKey: `content.revalidate:transition:${String(args.runId)}`,
        versionId: null,
        tags: uniqueContentTags([
          ...oldPublicEntries.flatMap((row) => row.cacheTags),
          ...newPublicEntries.flatMap((row) => row.cacheTags),
        ]),
        paths: uniqueContentTags([
          ...oldPublicRoutes.map((row) => row.href),
          ...newPublicRoutes.map((row) => row.href),
        ]).map(normalizeContentPath),
        payload: {
          reason: 'contract_transition',
          migrationId: run.migrationId,
          fromContractHash: run.fromContractHash,
          toContractHash: run.toContractHash,
          publicStrategy: approval.publicStrategy,
        },
        attempts: 0,
        nextAttemptAt: now,
        lastError: null,
        createdAt: now,
        updatedAt: now,
      })
      await scheduleRevalidationOutboxDelivery(ctx)
    }
    await ctx.db.patch(approval._id, { consumedAt: now })
    await ctx.db.patch(args.runId, { status: 'activated', completedAt: now })
    return { status: 'activated', contractSha256: args.contractSha256 }
  },
})
