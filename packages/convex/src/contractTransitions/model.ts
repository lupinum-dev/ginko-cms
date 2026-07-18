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

import type { Doc, Id } from '../_generated/dataModel.js'
import { assertCmsPresentation } from '../contract.js'
import { readDraftRows } from '../entries/workflow/drafts.js'
import { assertMdcBodyWithinLimit } from '../lib/contentLimits.js'
import { projectContentField, readInstalledCmsContract } from '../lib/installedContract.js'
import type { QueryOrMutationCtx } from '../lib/types.js'
import { assertFieldDataValid, assertValidSlug } from '../lib/validation.js'

const TRANSITION_PAGE_SIZE_DEFAULT = 10
const TRANSITION_PAGE_SIZE_MAX = 10
export const TRANSITION_APPLY_PAGE_SIZE_MAX = 5
export const TRANSITION_MAX_ENTRIES = 1_500
export const EMPTY_TRANSITION_HASH = '0'.repeat(64)

export const transitionNodeKindValidator = v.union(
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

export const transitionDraftOutputValidator = v.object({
  slug: v.string(),
  parentEntryId: v.union(v.string(), v.null()),
  orderRank: v.string(),
  nodeKind: transitionNodeKindValidator,
  shared: jsonObjectValidator,
  locales: v.record(v.string(), transitionLocaleOutputValidator),
})

export const transitionDraftInputValidator = v.object({
  entryId: v.string(),
  collection: v.string(),
  stableId: v.string(),
  lifecycle: v.union(v.literal('active'), v.literal('archived')),
  draftVersion: v.number(),
  sharedVersion: v.number(),
  slug: v.string(),
  parentEntryId: v.union(v.string(), v.null()),
  orderRank: v.string(),
  nodeKind: transitionNodeKindValidator,
  shared: jsonObjectValidator,
  locales: v.record(v.string(), transitionLocaleInputValidator),
})

export const stagedTransitionItemValidator = v.object({
  entryId: v.string(),
  inputDraftVersion: v.number(),
  inputHash: v.string(),
  outputHash: v.string(),
  output: transitionDraftOutputValidator,
})

export type TransitionOutput = (typeof transitionDraftOutputValidator)['type']
export type TransitionInput = (typeof transitionDraftInputValidator)['type']
export type TransitionRun = Doc<'contractTransitionRuns'>

type TransitionHashValue =
  | JsonValue
  | JsonObject
  | ResolvedContentCollectionV1
  | TransitionInput
  | TransitionOutput

export type TransitionRouteClaim = {
  collection: string
  locale: string
  parentEntryId: string | null
  segment: string
}

/**
 * Convex validator output and resolved contract objects are JSON by construction.
 * Keep the library's narrower JsonValue assertion at this single boundary.
 */
export async function hashTransitionValue(value: TransitionHashValue): Promise<string> {
  return await hashCanonicalJson(value as unknown as JsonValue)
}

export async function rollTransitionHash(
  previous: string,
  items: Array<{
    entryId: string
    inputHash: string
    outputHash: string
    routeClaimsHash: string
  }>,
): Promise<string> {
  return await hashTransitionValue({ previous, items } as unknown as JsonValue)
}

export function boundedTransitionPageSize(
  limit: number | undefined,
  maximum = TRANSITION_PAGE_SIZE_MAX,
): number {
  return Math.max(1, Math.min(Math.floor(limit ?? TRANSITION_PAGE_SIZE_DEFAULT), maximum))
}

export function asTransitionEntryId(ctx: QueryOrMutationCtx, value: string): Id<'entries'> {
  const entryId = ctx.db.normalizeId('entries', value)
  if (!entryId) throw new Error(`CONTRACT_TRANSITION_ENTRY_INVALID: "${value}".`)
  return entryId
}

async function canonicalEqual(
  left: JsonObject | ResolvedContentCollectionV1,
  right: JsonObject | ResolvedContentCollectionV1,
): Promise<boolean> {
  return (await hashTransitionValue(left)) === (await hashTransitionValue(right))
}

export async function changedCollectionSlugs(
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
    if (globalChanged || !before || !after || !(await canonicalEqual(before, after))) {
      changed.push(slug)
    }
  }
  return changed.sort((left, right) => left.localeCompare(right))
}

export async function requireTransitionRun(
  ctx: QueryOrMutationCtx,
  runId: Id<'contractTransitionRuns'>,
): Promise<TransitionRun> {
  const run = await ctx.db.get(runId)
  if (!run) throw new Error('CONTRACT_TRANSITION_NOT_FOUND')
  return run
}

export async function requireLockedContractForRun(ctx: QueryOrMutationCtx, run: TransitionRun) {
  const installed = await readInstalledCmsContract(ctx)
  if (!installed) throw new Error('CMS_CONTRACT_MISSING')
  if (
    installed.record.transitionState !== 'locked' ||
    installed.record.transitionRunId !== String(run._id)
  ) {
    throw new Error('CONTRACT_TRANSITION_LOCK_LOST')
  }
  if (
    installed.record.contentHash !== run.fromContentHash ||
    installed.record.presentationHash !== run.fromPresentationHash
  ) {
    throw new Error('CONTRACT_TRANSITION_SOURCE_CHANGED')
  }
  return installed
}

export async function targetContractForRun(run: TransitionRun): Promise<ResolvedContentContractV1> {
  const target = assertResolvedContentContract(run.targetContent)
  if ((await hashCanonicalJson(run.targetContent)) !== run.toContentHash) {
    throw new Error('CONTRACT_TRANSITION_TARGET_HASH_MISMATCH')
  }
  assertCmsPresentation(run.targetPresentation, target)
  if ((await hashCanonicalJson(run.targetPresentation)) !== run.toPresentationHash) {
    throw new Error('CONTRACT_TRANSITION_TARGET_PRESENTATION_HASH_MISMATCH')
  }
  return target
}

export async function transitionCollections(ctx: QueryOrMutationCtx, run: TransitionRun) {
  const installed = await requireLockedContractForRun(ctx, run)
  const target = await targetContractForRun(run)
  const affected = new Set(run.affectedCollections)
  return { installed, target, affected }
}

export async function transitionRouteClaims(
  entry: Doc<'entries'>,
  output: TransitionOutput,
  target: ResolvedContentContractV1,
): Promise<TransitionRouteClaim[]> {
  const collection = target.collections[entry.collection]
  if (!collection || collection.routing.mode !== 'route') return []
  const localized =
    collection.routing.slugMode === 'localized' || collection.routing.slugMode === 'localizedStable'
  const stable =
    collection.routing.slugMode === 'stable' || collection.routing.slugMode === 'localizedStable'
  return Object.entries(output.locales)
    .map(([locale, localeOutput]) => {
      const slug = localized ? (localeOutput.slug ?? output.slug) : output.slug
      return {
        collection: entry.collection,
        locale,
        parentEntryId: output.parentEntryId,
        segment: stable ? `${slug}-${entry.stableId}` : slug,
      }
    })
    .sort((left, right) =>
      `${left.collection}\u0000${left.locale}\u0000${left.parentEntryId ?? ''}\u0000${left.segment}`.localeCompare(
        `${right.collection}\u0000${right.locale}\u0000${right.parentEntryId ?? ''}\u0000${right.segment}`,
      ),
    )
}

export async function readTransitionInput(
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

export function transitionOutputFromStored(value: JsonObject): TransitionOutput {
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

export async function validateTransitionOutput(
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
  if (output.parentEntryId !== null) asTransitionEntryId(ctx, output.parentEntryId)

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
    assertMdcBodyWithinLimit(value.bodyMdc, { locale, field: 'bodyMdc' })
    await parseMdcBody(value.bodyMdc)
  }
}
