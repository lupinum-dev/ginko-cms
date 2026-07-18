import { jsonValueValidator } from '@lupinum/ginko-cms-contract/convex/validators.js'
import type { JsonValue } from '@lupinum/ginko-cms-contract/shared/types.js'
import {
  assertResolvedContentContract,
  hashCanonicalJson,
  type ResolvedContentContractV1,
  type ResolvedContentFieldV1,
} from '@lupinum/ginko-content/cms-contract'
import { v } from 'convex/values'

import { canRead } from './auth/checks.js'
import { callerQuery, directInternalQuery, mutation, query } from './functions.js'
import {
  assertCmsContractWritable,
  cmsContractWriteToken,
  cmsContractWriteTokenValidator,
  readInstalledCmsContract,
} from './lib/installedContract.js'
import type { MutationCtx, QueryOrMutationCtx } from './lib/types.js'

export const installCmsContractArgs = {
  content: jsonValueValidator,
  contentHash: v.string(),
  presentation: jsonValueValidator,
  presentationHash: v.string(),
}

const driftItemValidator = v.object({
  path: v.string(),
  installed: v.optional(jsonValueValidator),
  expected: v.optional(jsonValueValidator),
})

export const installCmsContractReturns = v.object({
  contentHash: v.string(),
  presentationHash: v.string(),
  transitionState: v.literal('ready'),
  collectionCount: v.number(),
  localeCount: v.number(),
  created: v.number(),
  updated: v.number(),
  skipped: v.number(),
  missingFromConfig: v.array(v.string()),
})

export const checkCmsContractReturns = v.object({
  matches: v.boolean(),
  contentMatches: v.boolean(),
  presentationMatches: v.boolean(),
  installedContentHash: v.union(v.string(), v.null()),
  installedPresentationHash: v.union(v.string(), v.null()),
  expectedContentHash: v.string(),
  expectedPresentationHash: v.string(),
  transitionState: v.union(v.literal('ready'), v.literal('locked'), v.null()),
  transitionRunId: v.union(v.string(), v.null()),
  drift: v.array(driftItemValidator),
  presentationDrift: v.array(driftItemValidator),
})

export const installedCmsContractStatusReturns = v.object({
  installedContentHash: v.union(v.string(), v.null()),
  installedPresentationHash: v.union(v.string(), v.null()),
  transitionState: v.union(v.literal('ready'), v.literal('locked'), v.null()),
  transitionRunId: v.union(v.string(), v.null()),
})

export const assertExpectedCmsContract = directInternalQuery({
  args: {
    expectedContentHash: v.string(),
    expectedPresentationHash: v.string(),
  },
  returns: cmsContractWriteTokenValidator,
  handler: async (ctx, args) => {
    const installed = await assertCmsContractWritable(ctx, {
      contentHash: args.expectedContentHash,
      presentationHash: args.expectedPresentationHash,
    })
    return cmsContractWriteToken(installed)
  },
})

type InstallCmsContractArgs = {
  content: JsonValue
  contentHash: string
  presentation: JsonValue
  presentationHash: string
}

type JsonRecord = Record<string, JsonValue>

function isJsonRecord(value: JsonValue | undefined): value is JsonRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function assertLocaleText(value: JsonValue | undefined, path: string): void {
  if (value === undefined || typeof value === 'string') return
  if (
    !isJsonRecord(value) ||
    Object.values(value).some((candidate) => typeof candidate !== 'string')
  ) {
    throw new Error(`CMS_PRESENTATION_INVALID: ${path} must be a string or locale map.`)
  }
}

function assertOnlyKeys(value: JsonRecord, allowed: string[], path: string): void {
  const allowedSet = new Set(allowed)
  const unknown = Object.keys(value).find((key) => !allowedSet.has(key))
  if (unknown) throw new Error(`CMS_PRESENTATION_INVALID: ${path}.${unknown} is unsupported.`)
}

export function assertCmsPresentation(
  presentation: JsonValue,
  contract: ResolvedContentContractV1,
): void {
  if (!isJsonRecord(presentation)) {
    throw new Error('CMS_PRESENTATION_INVALID: presentation must be an object.')
  }
  assertOnlyKeys(presentation, ['collections'], '$.presentation')
  const collections = presentation.collections
  if (collections === undefined) return
  if (!isJsonRecord(collections)) {
    throw new Error('CMS_PRESENTATION_INVALID: presentation.collections must be an object.')
  }

  for (const [slug, candidate] of Object.entries(collections)) {
    const collection = contract.collections[slug]
    if (!collection) {
      throw new Error(
        `CMS_PRESENTATION_INVALID: presentation references unknown collection "${slug}".`,
      )
    }
    if (!isJsonRecord(candidate)) {
      throw new Error(`CMS_PRESENTATION_INVALID: collection "${slug}" must be an object.`)
    }
    assertOnlyKeys(candidate, ['label', 'icon', 'fields'], `$.presentation.collections.${slug}`)
    assertLocaleText(candidate.label, `$.presentation.collections.${slug}.label`)
    if (
      candidate.icon !== undefined &&
      candidate.icon !== null &&
      typeof candidate.icon !== 'string'
    ) {
      throw new Error(
        `CMS_PRESENTATION_INVALID: $.presentation.collections.${slug}.icon must be a string or null.`,
      )
    }
    if (candidate.fields === undefined) continue
    if (!isJsonRecord(candidate.fields)) {
      throw new Error(
        `CMS_PRESENTATION_INVALID: $.presentation.collections.${slug}.fields must be an object.`,
      )
    }
    const fieldKeys = new Set(collection.fields.map((field) => field.key))
    for (const [fieldKey, fieldCandidate] of Object.entries(candidate.fields)) {
      if (!fieldKeys.has(fieldKey)) {
        throw new Error(
          `CMS_PRESENTATION_INVALID: presentation references unknown field "${slug}.${fieldKey}".`,
        )
      }
      if (!isJsonRecord(fieldCandidate)) {
        throw new Error(`CMS_PRESENTATION_INVALID: field "${slug}.${fieldKey}" must be an object.`)
      }
      assertOnlyKeys(
        fieldCandidate,
        ['label', 'description', 'hidden', 'width'],
        `$.presentation.collections.${slug}.fields.${fieldKey}`,
      )
      assertLocaleText(
        fieldCandidate.label,
        `$.presentation.collections.${slug}.fields.${fieldKey}.label`,
      )
      if (
        fieldCandidate.description !== undefined &&
        fieldCandidate.description !== null &&
        typeof fieldCandidate.description !== 'string'
      ) {
        throw new Error(
          `CMS_PRESENTATION_INVALID: field "${slug}.${fieldKey}" description must be a string or null.`,
        )
      }
      if (fieldCandidate.hidden !== undefined && typeof fieldCandidate.hidden !== 'boolean') {
        throw new Error(
          `CMS_PRESENTATION_INVALID: field "${slug}.${fieldKey}" hidden must be boolean.`,
        )
      }
      if (
        fieldCandidate.width !== undefined &&
        fieldCandidate.width !== 'full' &&
        fieldCandidate.width !== 'half'
      ) {
        throw new Error(
          `CMS_PRESENTATION_INVALID: field "${slug}.${fieldKey}" width must be "full" or "half".`,
        )
      }
    }
  }
}

function isSameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

function fieldChangeIsCompatible(
  current: ResolvedContentFieldV1[],
  next: ResolvedContentFieldV1[],
): boolean {
  const nextByKey = new Map(next.map((field) => [field.key, field]))
  for (const field of current) {
    const replacement = nextByKey.get(field.key)
    if (!replacement || !isSameJson(field, replacement)) return false
  }
  const currentKeys = new Set(current.map((field) => field.key))
  return next.every((field) => currentKeys.has(field.key) || field.required === false)
}

/**
 * Direct installation is intentionally conservative. Only changes that do
 * not reinterpret an existing draft or publication may bypass a transition.
 */
export function isCompatibleContentContractChange(
  current: ResolvedContentContractV1,
  next: ResolvedContentContractV1,
): boolean {
  if (current.defaultLocale !== next.defaultLocale) return false
  if (current.locales.some((locale) => !next.locales.includes(locale))) return false
  for (const locale of current.locales) {
    if (!isSameJson(current.localeFallbacks[locale] ?? [], next.localeFallbacks[locale] ?? [])) {
      return false
    }
  }

  for (const [slug, collection] of Object.entries(current.collections)) {
    const replacement = next.collections[slug]
    if (!replacement) return false
    if (collection.kind !== replacement.kind || collection.structure !== replacement.structure) {
      return false
    }
    if (collection.defaultLocale !== replacement.defaultLocale) return false
    if (collection.locales.some((locale) => !replacement.locales.includes(locale))) return false
    if (!isSameJson(collection.routing, replacement.routing)) return false
    if (!isSameJson(collection.portable, replacement.portable)) return false
    if (!isSameJson(collection.componentPolicy, replacement.componentPolicy)) return false
    if (!fieldChangeIsCompatible(collection.fields, replacement.fields)) return false
  }
  return true
}

function presentationCollection(presentation: JsonValue, slug: string): JsonValue | undefined {
  if (!isJsonRecord(presentation) || !isJsonRecord(presentation.collections)) return undefined
  return presentation.collections[slug]
}

function collectionSummary(
  current: { content: ResolvedContentContractV1; presentation: JsonValue } | null,
  next: { content: ResolvedContentContractV1; presentation: JsonValue },
) {
  const currentSlugs = new Set(Object.keys(current?.content.collections ?? {}))
  const nextSlugs = Object.keys(next.content.collections)
  let created = 0
  let updated = 0
  let skipped = 0
  for (const slug of nextSlugs) {
    const previous = current?.content.collections[slug]
    if (!previous) {
      created += 1
      continue
    }
    const changed =
      !isSameJson(previous, next.content.collections[slug]) ||
      !isSameJson(
        presentationCollection(current!.presentation, slug),
        presentationCollection(next.presentation, slug),
      )
    if (changed) updated += 1
    else skipped += 1
  }
  return {
    created,
    updated,
    skipped,
    missingFromConfig: [...currentSlugs].filter((slug) => !next.content.collections[slug]).sort(),
  }
}

export async function installCmsContractHandler(ctx: MutationCtx, args: InstallCmsContractArgs) {
  const contract = assertResolvedContentContract(args.content)
  const computedContentHash = await hashCanonicalJson(args.content)
  if (computedContentHash !== args.contentHash) throw new Error('CMS_CONTENT_HASH_MISMATCH')

  const existing = await readInstalledCmsContract(ctx)
  if (existing?.record.transitionState === 'locked') throw new Error('CMS_CONTRACT_LOCKED')

  const presentation = args.presentation
  assertCmsPresentation(presentation, contract)
  const computedPresentationHash = await hashCanonicalJson(presentation)
  if (computedPresentationHash !== args.presentationHash) {
    throw new Error('CMS_PRESENTATION_HASH_MISMATCH')
  }

  if (
    existing &&
    existing.record.contentHash !== computedContentHash &&
    !isCompatibleContentContractChange(existing.content, contract)
  ) {
    throw new Error('CMS_CONTRACT_TRANSITION_REQUIRED')
  }

  const summary = collectionSummary(
    existing ? { content: existing.content, presentation: existing.record.presentation } : null,
    { content: contract, presentation },
  )
  const noChange =
    existing?.record.contentHash === computedContentHash &&
    existing.record.presentationHash === computedPresentationHash

  if (!noChange) {
    const now = Date.now()
    if (existing) {
      await ctx.db.patch(existing.record._id, {
        content: args.content,
        presentation,
        contentHash: computedContentHash,
        presentationHash: computedPresentationHash,
        writeGeneration: existing.record.writeGeneration + 1,
        transitionState: 'ready',
        transitionRunId: null,
        installedAt: now,
        installedBy: 'deployment',
      })
    } else {
      await ctx.db.insert('cmsContract', {
        key: 'active',
        content: args.content,
        presentation,
        contentHash: computedContentHash,
        presentationHash: computedPresentationHash,
        writeGeneration: 1,
        transitionState: 'ready',
        transitionRunId: null,
        installedAt: now,
        installedBy: 'deployment',
      })
    }
  }

  return {
    contentHash: computedContentHash,
    presentationHash: computedPresentationHash,
    transitionState: 'ready' as const,
    collectionCount: Object.keys(contract.collections).length,
    localeCount: contract.locales.length,
    ...summary,
  }
}

function contractDrift(
  installed: JsonValue | undefined,
  expected: JsonValue,
  path = '$',
): Array<{ path: string; installed?: JsonValue; expected?: JsonValue }> {
  if (isSameJson(installed, expected)) return []
  if (Array.isArray(installed) && Array.isArray(expected)) {
    const drift: ReturnType<typeof contractDrift> = []
    const length = Math.max(installed.length, expected.length)
    for (let index = 0; index < length; index += 1) {
      if (index >= expected.length) {
        drift.push({ path: `${path}[${index}]`, installed: installed[index] })
      } else if (index >= installed.length) {
        drift.push({ path: `${path}[${index}]`, expected: expected[index]! })
      } else {
        drift.push(...contractDrift(installed[index], expected[index]!, `${path}[${index}]`))
      }
    }
    return drift
  }
  if (isJsonRecord(installed) && isJsonRecord(expected)) {
    const drift: ReturnType<typeof contractDrift> = []
    const keys = new Set([...Object.keys(installed), ...Object.keys(expected)])
    for (const key of [...keys].sort((left, right) => left.localeCompare(right))) {
      const installedValue = installed[key]
      const expectedValue = expected[key]
      if (expectedValue === undefined) {
        drift.push({ path: `${path}.${key}`, installed: installedValue })
      } else if (installedValue === undefined) {
        drift.push({ path: `${path}.${key}`, expected: expectedValue })
      } else {
        drift.push(...contractDrift(installedValue, expectedValue, `${path}.${key}`))
      }
    }
    return drift
  }
  return [{ path, ...(installed !== undefined ? { installed } : {}), expected }]
}

export async function checkCmsContractHandler(
  ctx: QueryOrMutationCtx,
  args: InstallCmsContractArgs,
) {
  const contract = assertResolvedContentContract(args.content)
  const computedContentHash = await hashCanonicalJson(args.content)
  if (computedContentHash !== args.contentHash) throw new Error('CMS_CONTENT_HASH_MISMATCH')

  assertCmsPresentation(args.presentation, contract)
  const expectedPresentationHash = await hashCanonicalJson(args.presentation)
  if (args.presentationHash !== expectedPresentationHash) {
    throw new Error('CMS_PRESENTATION_HASH_MISMATCH')
  }

  const installed = await readInstalledCmsContract(ctx)
  const contentMatches = installed?.record.contentHash === computedContentHash
  const presentationMatches = installed?.record.presentationHash === expectedPresentationHash
  return {
    matches: contentMatches && presentationMatches,
    contentMatches,
    presentationMatches,
    installedContentHash: installed?.record.contentHash ?? null,
    installedPresentationHash: installed?.record.presentationHash ?? null,
    expectedContentHash: computedContentHash,
    expectedPresentationHash,
    transitionState: installed?.record.transitionState ?? null,
    transitionRunId: installed?.record.transitionRunId ?? null,
    drift: contractDrift(installed?.record.content as JsonValue | undefined, args.content),
    presentationDrift: contractDrift(
      installed?.record.presentation as JsonValue | undefined,
      args.presentation,
      '$.presentation',
    ),
  }
}

export const installCmsContract = mutation({
  args: installCmsContractArgs,
  returns: installCmsContractReturns,
  handler: async (ctx, args) => await installCmsContractHandler(ctx, args),
})

export const checkCmsContract = query({
  args: installCmsContractArgs,
  returns: checkCmsContractReturns,
  handler: async (ctx, args) => await checkCmsContractHandler(ctx, args),
})

/**
 * Read-only Studio/MCP inspection surface. Expected hashes remain host-owned;
 * this query reveals only the currently installed canonical contract state.
 */
export const getInstalledContractStatus = callerQuery.protected({
  id: 'contract:getInstalledContractStatus',
  args: {},
  guard: canRead,
  returns: installedCmsContractStatusReturns,
  handler: async (ctx) => {
    const installed = await readInstalledCmsContract(ctx)
    return {
      installedContentHash: installed?.record.contentHash ?? null,
      installedPresentationHash: installed?.record.presentationHash ?? null,
      transitionState: installed?.record.transitionState ?? null,
      transitionRunId: installed?.record.transitionRunId ?? null,
    }
  },
})
