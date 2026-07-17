import { jsonObjectValidator } from '@lupinum/ginko-cms-contract/convex/validators.js'
import { materializeFieldData } from '@lupinum/ginko-cms-contract/shared/fields/materialize.js'
import type { JsonObject, JsonValue } from '@lupinum/ginko-cms-contract/shared/types.js'
import {
  assertResolvedContentContract,
  hashCanonicalJson,
  parseMdcBody,
  type ResolvedContentCollectionV1,
  type ResolvedContentContractV1,
} from '@lupinum/ginko-content/cms-contract'
import { v } from 'convex/values'

import type { Doc, Id } from './_generated/dataModel.js'
import { refreshDraftAssetRefsForSave } from './entries/workflow/commands.js'
import { readDraftRows } from './entries/workflow/drafts.js'
import { directInternalMutation, directInternalQuery } from './functions.js'
import { isEqualJsonValue } from './lib/data.js'
import { projectContentField, readInstalledCmsContract } from './lib/installedContract.js'
import type { MutationCtx, QueryOrMutationCtx } from './lib/types.js'
import { assertFieldDataValid, assertValidSlug } from './lib/validation.js'

const TRANSITION_PAGE_SIZE_DEFAULT = 25
const TRANSITION_PAGE_SIZE_MAX = 50
const TRANSITION_APPLY_PAGE_SIZE_MAX = 25
const TRANSITION_MAX_ENTRIES = 1_500

const nodeKindValidator = v.union(
  v.literal('page'),
  v.literal('folder'),
  v.literal('group'),
  v.literal('section'),
  v.null(),
)

const transitionLocaleOutputValidator = v.object({
  slug: v.union(v.string(), v.null()),
  values: jsonObjectValidator,
  bodyMdc: v.string(),
})

const transitionLocaleInputValidator = v.object({
  slug: v.union(v.string(), v.null()),
  values: jsonObjectValidator,
  bodyMdc: v.string(),
  version: v.number(),
})

const transitionDraftOutputValidator = v.object({
  slug: v.string(),
  parentEntryId: v.union(v.string(), v.null()),
  orderRank: v.string(),
  nodeKind: nodeKindValidator,
  shared: jsonObjectValidator,
  locales: v.record(v.string(), transitionLocaleOutputValidator),
})

const transitionDraftInputValidator = v.object({
  entryId: v.string(),
  collection: v.string(),
  stableId: v.string(),
  lifecycle: v.union(v.literal('active'), v.literal('archived')),
  draftVersion: v.number(),
  sharedVersion: v.number(),
  slug: v.string(),
  parentEntryId: v.union(v.string(), v.null()),
  orderRank: v.string(),
  nodeKind: nodeKindValidator,
  shared: jsonObjectValidator,
  locales: v.record(v.string(), transitionLocaleInputValidator),
})

const stagedTransitionItemValidator = v.object({
  entryId: v.string(),
  inputDraftVersion: v.number(),
  inputHash: v.string(),
  outputHash: v.string(),
  output: transitionDraftOutputValidator,
})

type TransitionOutput = (typeof transitionDraftOutputValidator)['type']
type TransitionInput = (typeof transitionDraftInputValidator)['type']
type TransitionRun = Doc<'contractTransitionRuns'>

function boundedPageSize(limit: number | undefined, maximum = TRANSITION_PAGE_SIZE_MAX): number {
  return Math.max(1, Math.min(Math.floor(limit ?? TRANSITION_PAGE_SIZE_DEFAULT), maximum))
}

function asEntryId(ctx: QueryOrMutationCtx, value: string): Id<'entries'> {
  const entryId = ctx.db.normalizeId('entries', value)
  if (!entryId) throw new Error(`CONTRACT_TRANSITION_ENTRY_INVALID: "${value}".`)
  return entryId
}

async function canonicalEqual(left: JsonValue, right: JsonValue): Promise<boolean> {
  return (await hashCanonicalJson(left)) === (await hashCanonicalJson(right))
}

async function changedCollectionSlugs(
  current: ResolvedContentContractV1,
  target: ResolvedContentContractV1,
): Promise<string[]> {
  const currentGlobal: JsonObject = {
    format: current.format,
    version: current.version,
    defaultLocale: current.defaultLocale,
    locales: current.locales,
    localeFallbacks: current.localeFallbacks,
  }
  const targetGlobal: JsonObject = {
    format: target.format,
    version: target.version,
    defaultLocale: target.defaultLocale,
    locales: target.locales,
    localeFallbacks: target.localeFallbacks,
  }
  const globalChanged = !(await canonicalEqual(currentGlobal, targetGlobal))
  const slugs = new Set([...Object.keys(current.collections), ...Object.keys(target.collections)])
  const changed: string[] = []
  for (const slug of slugs) {
    const before = current.collections[slug]
    const after = target.collections[slug]
    if (
      globalChanged ||
      !before ||
      !after ||
      !(await canonicalEqual(before as unknown as JsonValue, after as unknown as JsonValue))
    ) {
      changed.push(slug)
    }
  }
  return changed.sort((left, right) => left.localeCompare(right))
}

async function requireRun(
  ctx: QueryOrMutationCtx,
  runId: Id<'contractTransitionRuns'>,
): Promise<TransitionRun> {
  const run = await ctx.db.get(runId)
  if (!run) throw new Error('CONTRACT_TRANSITION_NOT_FOUND')
  return run
}

async function requireLockedContractForRun(ctx: QueryOrMutationCtx, run: TransitionRun) {
  const installed = await readInstalledCmsContract(ctx)
  if (!installed) throw new Error('CMS_CONTRACT_MISSING')
  if (
    installed.record.transitionState !== 'locked' ||
    installed.record.transitionRunId !== String(run._id)
  ) {
    throw new Error('CONTRACT_TRANSITION_LOCK_LOST')
  }
  if (installed.record.contentHash !== run.fromContentHash) {
    throw new Error('CONTRACT_TRANSITION_SOURCE_CHANGED')
  }
  return installed
}

async function transitionCollections(
  ctx: QueryOrMutationCtx,
  run: TransitionRun,
): Promise<{
  current: ResolvedContentContractV1
  target: ResolvedContentContractV1
  affected: Set<string>
}> {
  const installed = await requireLockedContractForRun(ctx, run)
  const target = assertResolvedContentContract(run.targetContent)
  const affected = new Set(await changedCollectionSlugs(installed.content, target))
  return { current: installed.content, target, affected }
}

async function readTransitionInput(
  ctx: QueryOrMutationCtx,
  entry: Doc<'entries'>,
): Promise<TransitionInput> {
  const drafts = await readDraftRows(ctx, entry._id)
  const locales = Object.fromEntries(
    Object.entries(drafts.byLocale)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([locale, row]) => [
        locale,
        {
          slug: row.slug,
          values: row.values,
          bodyMdc: row.bodyMdc,
          version: row.version,
        },
      ]),
  )
  return {
    entryId: String(entry._id),
    collection: entry.collection,
    stableId: entry.stableId,
    lifecycle: entry.lifecycle,
    draftVersion: entry.draftVersion,
    sharedVersion: entry.sharedVersion,
    slug: entry.slug,
    parentEntryId: entry.parentEntryId ? String(entry.parentEntryId) : null,
    orderRank: entry.orderRank,
    nodeKind: entry.nodeKind,
    shared: entry.shared,
    locales,
  }
}

function outputFromStored(value: JsonObject): TransitionOutput {
  const slug = value.slug
  const parentEntryId = value.parentEntryId
  const orderRank = value.orderRank
  const nodeKind = value.nodeKind
  const shared = value.shared
  const localeValues = value.locales
  if (typeof slug !== 'string') throw new Error('Stored transition output has an invalid slug.')
  if (parentEntryId !== null && typeof parentEntryId !== 'string') {
    throw new Error('Stored transition output has an invalid parent entry id.')
  }
  if (typeof orderRank !== 'string') {
    throw new TypeError('Stored transition output has an invalid order rank.')
  }
  if (
    nodeKind !== null &&
    nodeKind !== 'page' &&
    nodeKind !== 'folder' &&
    nodeKind !== 'group' &&
    nodeKind !== 'section'
  ) {
    throw new Error('Stored transition output has an invalid node kind.')
  }
  if (!shared || typeof shared !== 'object' || Array.isArray(shared)) {
    throw new Error('Stored transition output has invalid shared values.')
  }
  if (!localeValues || typeof localeValues !== 'object' || Array.isArray(localeValues)) {
    throw new Error('Stored transition output has invalid locale values.')
  }
  const locales: TransitionOutput['locales'] = {}
  for (const [locale, candidate] of Object.entries(localeValues)) {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
      throw new Error(`Stored transition output has invalid locale "${locale}".`)
    }
    const localeSlug = candidate.slug
    const values = candidate.values
    const bodyMdc = candidate.bodyMdc
    if (localeSlug !== null && typeof localeSlug !== 'string') {
      throw new Error(`Stored transition output has an invalid slug for "${locale}".`)
    }
    if (!values || typeof values !== 'object' || Array.isArray(values)) {
      throw new Error(`Stored transition output has invalid values for "${locale}".`)
    }
    if (typeof bodyMdc !== 'string') {
      throw new TypeError(`Stored transition output has an invalid body for "${locale}".`)
    }
    locales[locale] = { slug: localeSlug, values, bodyMdc }
  }
  return { slug, parentEntryId, orderRank, nodeKind, shared, locales }
}

function knownFieldKeys(collection: ResolvedContentCollectionV1) {
  return {
    shared: new Set(
      collection.fields.filter((field) => !field.localized).map((field) => field.key),
    ),
    localized: new Set(
      collection.fields.filter((field) => field.localized).map((field) => field.key),
    ),
  }
}

async function validateTransitionOutput(
  ctx: QueryOrMutationCtx,
  entry: Doc<'entries'>,
  output: TransitionOutput,
  target: ResolvedContentContractV1,
): Promise<void> {
  const collection = target.collections[entry.collection]
  if (!collection) {
    throw new Error(
      `CONTRACT_TRANSITION_COLLECTION_REMOVED: "${entry.collection}" still contains entries.`,
    )
  }
  assertValidSlug(output.slug)
  if (collection.structure === 'flat' && output.parentEntryId !== null) {
    throw new Error(`Flat collection "${entry.collection}" cannot retain parent placements.`)
  }
  if (output.parentEntryId === String(entry._id)) {
    throw new Error(`Entry "${entry._id}" cannot be its own parent.`)
  }
  if (output.parentEntryId !== null) asEntryId(ctx, output.parentEntryId)

  const keys = knownFieldKeys(collection)
  for (const key of Object.keys(output.shared)) {
    if (!keys.shared.has(key)) {
      throw new Error(`Entry "${entry._id}" has unknown shared field "${key}".`)
    }
  }
  const fields = collection.fields.map((field) => projectContentField(field))
  for (const [locale, value] of Object.entries(output.locales)) {
    if (!collection.locales.includes(locale)) {
      throw new Error(`Entry "${entry._id}" retains removed locale "${locale}".`)
    }
    if (value.slug !== null) assertValidSlug(value.slug)
    for (const key of Object.keys(value.values)) {
      if (!keys.localized.has(key)) {
        throw new Error(`Entry "${entry._id}" has unknown localized field "${key}" in "${locale}".`)
      }
    }
    assertFieldDataValid(fields, materializeFieldData(fields, output.shared, value.values), {
      publish: false,
    })
    await parseMdcBody(value.bodyMdc)
  }
}

async function assertTransitionSize(ctx: QueryOrMutationCtx): Promise<Doc<'entries'>[]> {
  const entries = await ctx.db.query('entries').take(TRANSITION_MAX_ENTRIES + 1)
  if (entries.length > TRANSITION_MAX_ENTRIES) {
    throw new Error(`Contract transitions support at most ${TRANSITION_MAX_ENTRIES} entries.`)
  }
  return entries
}

async function assertNoAffectedPublications(
  entries: Doc<'entries'>[],
  affected: Set<string>,
): Promise<void> {
  const blocked = entries.filter(
    (entry) => affected.has(entry.collection) && entry.activePublications.length > 0,
  )
  if (blocked.length > 0) {
    throw new Error(
      `CONTRACT_TRANSITION_REQUIRES_UNPUBLISH: ${blocked.length} affected entries still have active publications.`,
    )
  }
}

async function readStagingPage(
  ctx: QueryOrMutationCtx,
  args: { cursor: string | null; limit: number; affected: Set<string> },
) {
  let after: { creationTime: number; entryId: Id<'entries'> } | null = null
  if (args.cursor !== null) {
    try {
      const parsed = JSON.parse(args.cursor) as { creationTime?: unknown; entryId?: unknown }
      const entryId =
        typeof parsed.entryId === 'string' ? ctx.db.normalizeId('entries', parsed.entryId) : null
      if (
        typeof parsed.creationTime !== 'number' ||
        !Number.isFinite(parsed.creationTime) ||
        !entryId
      ) {
        throw new Error('invalid cursor payload')
      }
      after = { creationTime: parsed.creationTime, entryId }
    } catch {
      throw new Error('CONTRACT_TRANSITION_INVALID_CURSOR')
    }
  }

  const ordered = ctx.db.query('entries').order('asc')
  const rows = await (after
    ? ordered
        .filter((query) =>
          query.or(
            query.gt(query.field('_creationTime'), after.creationTime),
            query.and(
              query.eq(query.field('_creationTime'), after.creationTime),
              query.gt(query.field('_id'), after.entryId),
            ),
          ),
        )
        .take(args.limit + 1)
    : ordered.take(args.limit + 1))
  const page = rows.slice(0, args.limit)
  const isDone = rows.length <= args.limit
  const last = page.at(-1)
  const continueCursor = last
    ? JSON.stringify({ creationTime: last._creationTime, entryId: String(last._id) })
    : (args.cursor ?? '')
  const affectedEntries = page.filter((entry) => args.affected.has(entry.collection))
  const snapshots = await Promise.all(
    affectedEntries.map(async (entry) => {
      const current = await readTransitionInput(ctx, entry)
      return {
        entry,
        current,
        inputHash: await hashCanonicalJson(current as unknown as JsonValue),
      }
    }),
  )
  return { page, isDone, continueCursor, snapshots }
}

async function assertStagedGraph(
  ctx: QueryOrMutationCtx,
  run: TransitionRun,
  target: ResolvedContentContractV1,
  affected: Set<string>,
): Promise<void> {
  const entries = await assertTransitionSize(ctx)
  await assertNoAffectedPublications(entries, affected)
  const affectedEntries = entries.filter((entry) => affected.has(entry.collection))
  const items = await ctx.db
    .query('contractTransitionItems')
    .withIndex('by_run_state', (query) => query.eq('runId', run._id).eq('state', 'staged'))
    .collect()
  if (items.length !== affectedEntries.length) {
    throw new Error('CONTRACT_TRANSITION_STAGING_INCOMPLETE')
  }

  const entriesById = new Map(entries.map((entry) => [String(entry._id), entry]))
  const outputs = new Map<string, TransitionOutput>()
  for (const item of items) {
    const entry = entriesById.get(String(item.entryId))
    if (!entry || !affected.has(entry.collection)) {
      throw new Error('CONTRACT_TRANSITION_STAGED_ENTRY_SET_CHANGED')
    }
    const current = await readTransitionInput(ctx, entry)
    if (
      current.draftVersion !== item.inputDraftVersion ||
      (await hashCanonicalJson(current as unknown as JsonValue)) !== item.inputHash
    ) {
      throw new Error(`Entry "${entry._id}" changed after it was staged.`)
    }
    const output = outputFromStored(item.output)
    if ((await hashCanonicalJson(output as unknown as JsonValue)) !== item.outputHash) {
      throw new Error(`Entry "${entry._id}" has a corrupt staged output.`)
    }
    await validateTransitionOutput(ctx, entry, output, target)
    outputs.set(String(entry._id), output)
  }

  const parentOf = (entryId: string): string | null => {
    const output = outputs.get(entryId)
    if (output) return output.parentEntryId
    return entriesById.get(entryId)?.parentEntryId
      ? String(entriesById.get(entryId)!.parentEntryId)
      : null
  }
  for (const entry of affectedEntries) {
    const output = outputs.get(String(entry._id))!
    if (output.parentEntryId !== null) {
      const parent = entriesById.get(output.parentEntryId)
      if (!parent || parent.collection !== entry.collection) {
        throw new Error(`Entry "${entry._id}" has an invalid staged parent.`)
      }
    }
    const seen = new Set([String(entry._id)])
    let parentId = output.parentEntryId
    while (parentId !== null) {
      if (seen.has(parentId)) {
        throw new Error(`Entry "${entry._id}" would create a placement cycle.`)
      }
      seen.add(parentId)
      parentId = parentOf(parentId)
    }
  }

  const routeKeys = new Map<string, string>()
  for (const entry of affectedEntries) {
    const output = outputs.get(String(entry._id))!
    const collection = target.collections[entry.collection]!
    if (collection.routing.mode !== 'route') continue
    const localized =
      collection.routing.slugMode === 'localized' ||
      collection.routing.slugMode === 'localizedStable'
    const stable =
      collection.routing.slugMode === 'stable' || collection.routing.slugMode === 'localizedStable'
    for (const [locale, localeOutput] of Object.entries(output.locales)) {
      const slug = localized ? (localeOutput.slug ?? output.slug) : output.slug
      const segment = stable ? `${slug}-${entry.stableId}` : slug
      const key = `${entry.collection}:${locale}:${output.parentEntryId ?? 'root'}:${segment}`
      const conflict = routeKeys.get(key)
      if (conflict) {
        throw new Error(`Entries "${conflict}" and "${entry._id}" have a staged route collision.`)
      }
      routeKeys.set(key, String(entry._id))
    }
  }
}

export const beginContractTransition = directInternalMutation({
  id: 'migrations:beginContractTransition',
  args: {
    runKey: v.string(),
    targetContent: jsonObjectValidator,
    targetContentHash: v.string(),
    actor: v.string(),
  },
  returns: v.object({
    runId: v.id('contractTransitionRuns'),
    state: v.string(),
    fromContentHash: v.string(),
    toContentHash: v.string(),
    affectedCollections: v.array(v.string()),
  }),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('contractTransitionRuns')
      .withIndex('by_run_key', (query) => query.eq('runKey', args.runKey))
      .first()
    if (existing) {
      if (existing.toContentHash !== args.targetContentHash) {
        throw new Error(`Transition run key "${args.runKey}" already targets another contract.`)
      }
      const installed = await readInstalledCmsContract(ctx)
      const target = assertResolvedContentContract(existing.targetContent)
      const affected = installed ? await changedCollectionSlugs(installed.content, target) : []
      return {
        runId: existing._id,
        state: existing.state,
        fromContentHash: existing.fromContentHash,
        toContentHash: existing.toContentHash,
        affectedCollections: affected,
      }
    }

    const installed = await readInstalledCmsContract(ctx)
    if (!installed) throw new Error('CMS_CONTRACT_MISSING')
    if (installed.record.transitionState !== 'ready') throw new Error('CMS_CONTRACT_LOCKED')
    const target = assertResolvedContentContract(args.targetContent)
    const computedHash = await hashCanonicalJson(args.targetContent)
    if (computedHash !== args.targetContentHash) {
      throw new Error('CONTRACT_TRANSITION_TARGET_HASH_MISMATCH')
    }
    if (installed.record.contentHash === args.targetContentHash) {
      throw new Error('CONTRACT_TRANSITION_NOT_REQUIRED')
    }
    const affectedCollections = await changedCollectionSlugs(installed.content, target)
    const affected = new Set(affectedCollections)
    const entries = await assertTransitionSize(ctx)
    await assertNoAffectedPublications(entries, affected)
    for (const entry of entries) {
      if (affected.has(entry.collection) && !target.collections[entry.collection]) {
        throw new Error(
          `CONTRACT_TRANSITION_COLLECTION_REMOVED: "${entry.collection}" still contains entries.`,
        )
      }
    }

    const now = Date.now()
    const runId = await ctx.db.insert('contractTransitionRuns', {
      runKey: args.runKey,
      fromContentHash: installed.record.contentHash,
      toContentHash: args.targetContentHash,
      targetContent: args.targetContent,
      state: 'staging',
      cursor: null,
      stagedCount: 0,
      appliedCount: 0,
      createdBy: args.actor,
      createdAt: now,
      updatedAt: now,
    })
    await ctx.db.patch(installed.record._id, {
      transitionState: 'locked',
      transitionRunId: String(runId),
    })
    return {
      runId,
      state: 'staging',
      fromContentHash: installed.record.contentHash,
      toContentHash: args.targetContentHash,
      affectedCollections,
    }
  },
})

export const listContractTransitionPage = directInternalQuery({
  id: 'migrations:listContractTransitionPage',
  args: {
    runId: v.id('contractTransitionRuns'),
    cursor: v.union(v.string(), v.null()),
    limit: v.optional(v.number()),
  },
  returns: v.object({
    page: v.array(
      v.object({
        entryId: v.string(),
        inputDraftVersion: v.number(),
        inputHash: v.string(),
        current: transitionDraftInputValidator,
      }),
    ),
    isDone: v.boolean(),
    continueCursor: v.string(),
  }),
  handler: async (ctx, args) => {
    const run = await requireRun(ctx, args.runId)
    if (run.state !== 'staging') throw new Error('CONTRACT_TRANSITION_NOT_STAGING')
    if (run.cursor !== args.cursor) throw new Error('CONTRACT_TRANSITION_STALE_CURSOR')
    const { affected } = await transitionCollections(ctx, run)
    const result = await readStagingPage(ctx, {
      cursor: args.cursor,
      limit: boundedPageSize(args.limit),
      affected,
    })
    return {
      page: result.snapshots.map(({ entry, current, inputHash }) => ({
        entryId: String(entry._id),
        inputDraftVersion: entry.draftVersion,
        inputHash,
        current,
      })),
      isDone: result.isDone,
      continueCursor: result.continueCursor,
    }
  },
})

export const stageContractTransitionPage = directInternalMutation({
  id: 'migrations:stageContractTransitionPage',
  args: {
    runId: v.id('contractTransitionRuns'),
    cursor: v.union(v.string(), v.null()),
    limit: v.optional(v.number()),
    items: v.array(stagedTransitionItemValidator),
  },
  returns: v.object({
    state: v.union(v.literal('staging'), v.literal('ready')),
    staged: v.number(),
    stagedCount: v.number(),
    continueCursor: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, args) => {
    const run = await requireRun(ctx, args.runId)
    if (run.state !== 'staging') throw new Error('CONTRACT_TRANSITION_NOT_STAGING')
    if (run.cursor !== args.cursor) throw new Error('CONTRACT_TRANSITION_STALE_CURSOR')
    const { target, affected } = await transitionCollections(ctx, run)
    const result = await readStagingPage(ctx, {
      cursor: args.cursor,
      limit: boundedPageSize(args.limit),
      affected,
    })
    if (result.snapshots.length !== args.items.length) {
      throw new Error('CONTRACT_TRANSITION_PAGE_DOES_NOT_MATCH')
    }

    for (let index = 0; index < result.snapshots.length; index += 1) {
      const expected = result.snapshots[index]!
      const item = args.items[index]!
      if (
        item.entryId !== String(expected.entry._id) ||
        item.inputDraftVersion !== expected.entry.draftVersion ||
        item.inputHash !== expected.inputHash
      ) {
        throw new Error(`Transition input for entry "${item.entryId}" is stale.`)
      }
      if ((await hashCanonicalJson(item.output as unknown as JsonValue)) !== item.outputHash) {
        throw new Error(`Transition output hash mismatch for entry "${item.entryId}".`)
      }
      await validateTransitionOutput(ctx, expected.entry, item.output, target)
      const duplicate = await ctx.db
        .query('contractTransitionItems')
        .withIndex('by_run_entry', (query) =>
          query.eq('runId', run._id).eq('entryId', expected.entry._id),
        )
        .first()
      if (duplicate) throw new Error(`Entry "${item.entryId}" is already staged.`)
      await ctx.db.insert('contractTransitionItems', {
        runId: run._id,
        entryId: expected.entry._id,
        inputDraftVersion: item.inputDraftVersion,
        inputHash: item.inputHash,
        outputHash: item.outputHash,
        output: item.output,
        state: 'staged',
        appliedAt: null,
      })
    }

    const state = result.isDone ? ('ready' as const) : ('staging' as const)
    if (result.isDone) await assertStagedGraph(ctx, run, target, affected)
    const stagedCount = run.stagedCount + args.items.length
    await ctx.db.patch(run._id, {
      state,
      cursor: result.isDone ? null : result.continueCursor,
      stagedCount,
      updatedAt: Date.now(),
    })
    return {
      state,
      staged: args.items.length,
      stagedCount,
      continueCursor: result.isDone ? null : result.continueCursor,
    }
  },
})

async function applyTransitionOutput(
  ctx: MutationCtx,
  args: {
    entry: Doc<'entries'>
    output: TransitionOutput
    actor: string
    now: number
  },
): Promise<void> {
  const drafts = await readDraftRows(ctx, args.entry._id)
  const parentEntryId =
    args.output.parentEntryId === null ? null : asEntryId(ctx, args.output.parentEntryId)
  const sharedUpdated =
    args.entry.slug !== args.output.slug ||
    args.entry.parentEntryId !== parentEntryId ||
    args.entry.orderRank !== args.output.orderRank ||
    args.entry.nodeKind !== args.output.nodeKind ||
    !isEqualJsonValue(args.entry.shared, args.output.shared)
  const affectedLocales = new Set<string>()
  const allLocales = new Set([...Object.keys(drafts.byLocale), ...Object.keys(args.output.locales)])

  for (const locale of allLocales) {
    const existing = drafts.byLocale[locale]
    const desired = args.output.locales[locale]
    if (!desired) {
      if (existing) {
        await ctx.db.delete(existing._id)
        affectedLocales.add(locale)
      }
      continue
    }
    const changed =
      !existing ||
      existing.slug !== desired.slug ||
      existing.bodyMdc !== desired.bodyMdc ||
      !isEqualJsonValue(existing.values, desired.values)
    if (!changed) continue
    const payload = {
      entryId: args.entry._id,
      locale,
      slug: desired.slug,
      values: desired.values,
      bodyMdc: desired.bodyMdc,
      version: (existing?.version ?? 0) + 1,
      updatedBy: args.actor,
      updatedAt: args.now,
    }
    if (existing) await ctx.db.replace(existing._id, payload)
    else await ctx.db.insert('entryLocaleDrafts', payload)
    affectedLocales.add(locale)
  }

  if (!sharedUpdated && affectedLocales.size === 0) return
  await ctx.db.patch(args.entry._id, {
    ...(sharedUpdated
      ? {
          slug: args.output.slug,
          parentEntryId,
          orderRank: args.output.orderRank,
          nodeKind: args.output.nodeKind,
          shared: args.output.shared,
          sharedVersion: args.entry.sharedVersion + 1,
        }
      : {}),
    draftVersion: args.entry.draftVersion + 1,
    updatedBy: args.actor,
    updatedAt: args.now,
  })
  await refreshDraftAssetRefsForSave(ctx, {
    entryId: args.entry._id,
    collection: args.entry.collection,
    sharedUpdated,
    affectedLocales: [...affectedLocales],
    now: args.now,
  })
}

export const applyContractTransitionPage = directInternalMutation({
  id: 'migrations:applyContractTransitionPage',
  args: {
    runId: v.id('contractTransitionRuns'),
    limit: v.optional(v.number()),
    actor: v.string(),
  },
  returns: v.object({
    applied: v.number(),
    appliedCount: v.number(),
    readyToActivate: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const run = await requireRun(ctx, args.runId)
    if (run.state !== 'ready' && run.state !== 'applying') {
      throw new Error(`Contract transition cannot apply from state "${run.state}".`)
    }
    const { target, affected } = await transitionCollections(ctx, run)
    const entries = await assertTransitionSize(ctx)
    await assertNoAffectedPublications(entries, affected)
    const limit = boundedPageSize(args.limit, TRANSITION_APPLY_PAGE_SIZE_MAX)
    const pending = await ctx.db
      .query('contractTransitionItems')
      .withIndex('by_run_state', (query) => query.eq('runId', run._id).eq('state', 'staged'))
      .take(limit + 1)
    const page = pending.slice(0, limit)
    const now = Date.now()
    for (const item of page) {
      const entry = await ctx.db.get(item.entryId)
      if (!entry || !affected.has(entry.collection)) {
        throw new Error(`Transition entry "${item.entryId}" no longer exists in its scope.`)
      }
      if (entry.activePublications.length > 0) {
        throw new Error(`Entry "${entry._id}" was published after the transition was staged.`)
      }
      const current = await readTransitionInput(ctx, entry)
      if (
        current.draftVersion !== item.inputDraftVersion ||
        (await hashCanonicalJson(current as unknown as JsonValue)) !== item.inputHash
      ) {
        throw new Error(`Entry "${entry._id}" changed after transition staging.`)
      }
      const output = outputFromStored(item.output)
      if ((await hashCanonicalJson(output as unknown as JsonValue)) !== item.outputHash) {
        throw new Error(`Entry "${entry._id}" has a corrupt staged output.`)
      }
      await validateTransitionOutput(ctx, entry, output, target)
      await applyTransitionOutput(ctx, { entry, output, actor: args.actor, now })
      await ctx.db.patch(item._id, { state: 'applied', appliedAt: now })
    }
    const appliedCount = run.appliedCount + page.length
    await ctx.db.patch(run._id, {
      state: 'applying',
      cursor: page.length > 0 ? String(page[page.length - 1]!._id) : run.cursor,
      appliedCount,
      updatedAt: now,
    })
    return {
      applied: page.length,
      appliedCount,
      readyToActivate: pending.length <= limit,
    }
  },
})

export const activateContractTransition = directInternalMutation({
  id: 'migrations:activateContractTransition',
  args: {
    runId: v.id('contractTransitionRuns'),
    actor: v.string(),
  },
  returns: v.object({
    state: v.literal('complete'),
    contentHash: v.string(),
    appliedCount: v.number(),
  }),
  handler: async (ctx, args) => {
    const run = await requireRun(ctx, args.runId)
    if (run.state !== 'applying') throw new Error('CONTRACT_TRANSITION_NOT_APPLIED')
    const installed = await requireLockedContractForRun(ctx, run)
    if ((await hashCanonicalJson(run.targetContent)) !== run.toContentHash) {
      throw new Error('CONTRACT_TRANSITION_TARGET_HASH_MISMATCH')
    }
    const { target, affected } = await transitionCollections(ctx, run)
    const entries = await assertTransitionSize(ctx)
    await assertNoAffectedPublications(entries, affected)
    const pending = await ctx.db
      .query('contractTransitionItems')
      .withIndex('by_run_state', (query) => query.eq('runId', run._id).eq('state', 'staged'))
      .first()
    if (pending) throw new Error('CONTRACT_TRANSITION_APPLY_INCOMPLETE')
    for (const entry of entries.filter((candidate) => affected.has(candidate.collection))) {
      if (!target.collections[entry.collection]) {
        throw new Error(`Collection "${entry.collection}" still contains entries.`)
      }
      const item = await ctx.db
        .query('contractTransitionItems')
        .withIndex('by_run_entry', (query) => query.eq('runId', run._id).eq('entryId', entry._id))
        .first()
      if (!item || item.state !== 'applied') {
        throw new Error(`Entry "${entry._id}" was not applied by this transition.`)
      }
    }

    const now = Date.now()
    await ctx.db.patch(installed.record._id, {
      content: run.targetContent,
      contentHash: run.toContentHash,
      transitionState: 'ready',
      transitionRunId: null,
      installedAt: now,
      installedBy: args.actor,
    })
    await ctx.db.patch(run._id, {
      state: 'complete',
      cursor: null,
      updatedAt: now,
    })
    return { state: 'complete', contentHash: run.toContentHash, appliedCount: run.appliedCount }
  },
})

export const cancelContractTransition = directInternalMutation({
  id: 'migrations:cancelContractTransition',
  args: {
    runId: v.id('contractTransitionRuns'),
  },
  returns: v.object({ state: v.literal('cancelled') }),
  handler: async (ctx, args) => {
    const run = await requireRun(ctx, args.runId)
    if (run.state !== 'staging' && run.state !== 'ready') {
      throw new Error('A contract transition can only be cancelled before apply begins.')
    }
    const installed = await requireLockedContractForRun(ctx, run)
    const now = Date.now()
    await ctx.db.patch(installed.record._id, {
      transitionState: 'ready',
      transitionRunId: null,
    })
    await ctx.db.patch(run._id, { state: 'cancelled', cursor: null, updatedAt: now })
    return { state: 'cancelled' }
  },
})

export const getContractTransitionStatus = directInternalQuery({
  id: 'migrations:getContractTransitionStatus',
  args: { runId: v.id('contractTransitionRuns') },
  returns: v.object({
    runKey: v.string(),
    state: v.string(),
    fromContentHash: v.string(),
    toContentHash: v.string(),
    stagedCount: v.number(),
    appliedCount: v.number(),
    pendingCount: v.number(),
    lockActive: v.boolean(),
    cursor: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, args) => {
    const run = await requireRun(ctx, args.runId)
    const [installed, pending] = await Promise.all([
      readInstalledCmsContract(ctx),
      ctx.db
        .query('contractTransitionItems')
        .withIndex('by_run_state', (query) => query.eq('runId', run._id).eq('state', 'staged'))
        .collect(),
    ])
    return {
      runKey: run.runKey,
      state: run.state,
      fromContentHash: run.fromContentHash,
      toContentHash: run.toContentHash,
      stagedCount: run.stagedCount,
      appliedCount: run.appliedCount,
      pendingCount: pending.length,
      lockActive:
        installed?.record.transitionState === 'locked' &&
        installed.record.transitionRunId === String(run._id),
      cursor: run.cursor,
    }
  },
})
