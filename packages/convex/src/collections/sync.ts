import {
  collectionRoutingValidator,
  fieldValidator,
  jsonValueValidator,
  localeTextValidator,
} from '@lupinum/ginko-cms-contract/convex/validators.js'
import type { CmsField, JsonValue, LocaleText } from '@lupinum/ginko-cms-contract/shared/types.js'
import { v } from 'convex/values'

import type { Doc } from '../_generated/dataModel.js'
import { canManageCollections } from '../auth/checks.js'
import { refreshEntryReadModelsById } from '../entries/projections.js'
import { throwCmsError } from '../errors.js'
import { callerMutation } from '../functions.js'
import type { getCollectionOrThrow } from '../lib/collections.js'
import { collectionEntryCountSnapshot, collectionHasEntries } from '../lib/collections.js'
import { isEqualJsonValue } from '../lib/data.js'
import { normalizeFields } from '../lib/fields.js'
import { toStringId } from '../lib/ids.js'
import { resolveLocaleText } from '../lib/locale.js'
import type { MutationCtx, QueryOrMutationCtx } from '../lib/types.js'
import {
  assertFieldDefinitionsValid,
  assertValidLocaleCode,
  assertValidSlug,
} from '../lib/validation.js'
import {
  classifyCollectionContractDrift,
  classifyMissingCollectionContract,
  contractChangeCategories,
  type CollectionContractSnapshot,
} from './drift.js'
import { scheduleCollectionReindex } from './jobs.js'

type EntryDoc = Doc<'entries'>
type ContractSnapshotInput = {
  slug: string
  label: LocaleText
  icon: string | null
  type: 'flat' | 'tree'
  routing: ReturnType<typeof normalizeRouting>
  locales: string[]
  fields: CmsField[]
  settings: JsonValue
}
type SyncConfigCollectionsArgs = {
  collections: Array<{
    slug: string
    label?: LocaleText
    icon?: string
    type: 'flat' | 'tree'
    routing: {
      mode?: 'route' | 'none'
      pathPrefix: string
      slugMode?: 'shared' | 'localized' | 'stable' | 'localizedStable'
      rootSlug?: string | null
      singleton?: boolean
    }
    locales: string[]
    fields?: Array<Partial<CmsField>>
    settings?: JsonValue
  }>
}

export function deriveCollectionLabel(slug: string): string {
  return slug
    .split(/[-_]/g)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ')
}

export function normalizeRouting(routing: {
  mode?: 'route' | 'none'
  pathPrefix: string
  slugMode?: 'shared' | 'localized' | 'stable' | 'localizedStable'
  rootSlug?: string | null
  singleton?: boolean
}) {
  return {
    mode: routing.mode ?? 'route',
    pathPrefix: routing.pathPrefix,
    slugMode: routing.slugMode ?? 'shared',
    rootSlug: routing.rootSlug ?? null,
    singleton: routing.singleton ?? false,
  }
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entryValue]) => `${JSON.stringify(key)}:${stableJson(entryValue)}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

function contractVersion(input: ContractSnapshotInput): string {
  const source = stableJson(input)
  let hash = 2166136261
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return `v1-${(hash >>> 0).toString(16).padStart(8, '0')}`
}

function contractSnapshot(input: ContractSnapshotInput) {
  return {
    source: 'code' as const,
    version: contractVersion(input),
  }
}

export async function recomputeEntryDerivedState(
  ctx: MutationCtx,
  collection: Awaited<ReturnType<typeof getCollectionOrThrow>>,
  entry: EntryDoc,
) {
  await refreshEntryReadModelsById(ctx, {
    collection,
    entryId: entry._id,
    now: entry.updatedAt,
    appIdentityId: entry.updatedBy,
  })
}

export async function recomputeCollectionDerivedState(
  ctx: MutationCtx,
  collection: Awaited<ReturnType<typeof getCollectionOrThrow>>,
) {
  const entries = await ctx.db
    .query('entries')
    .withIndex('by_collection_status', (q) => q.eq('collectionId', collection._id))
    .collect()

  for (const entry of entries) {
    await recomputeEntryDerivedState(ctx, collection, entry)
  }
}

export const rebuildAllReadModels = callerMutation.protected({
  id: 'sync:rebuildAllReadModels',
  args: {},
  guard: canManageCollections,
  returns: v.null(),
  handler: async (ctx) => {
    const appIdentity = await ctx.appIdentity()
    const collections = await ctx.db.query('collections').collect()
    for (const collection of collections) {
      await scheduleCollectionReindex(ctx, collection._id, appIdentity.userId)
    }
    return null
  },
})

export function mapCollectionListItem(
  collection: Awaited<ReturnType<typeof getCollectionOrThrow>>,
  defaultLocale: string,
  entryCount: number,
) {
  return {
    _id: toStringId(collection._id),
    slug: collection.slug,
    label: resolveLocaleText(collection.label, defaultLocale),
    labelMap: collection.label,
    type: collection.type,
    icon: collection.icon ?? null,
    routing: collection.routing,
    pathPrefix: collection.routing.pathPrefix,
    mode: collection.routing.mode ?? 'route',
    slugMode: collection.routing.slugMode ?? 'shared',
    rootSlug: collection.routing.rootSlug ?? null,
    singleton: collection.routing.singleton ?? false,
    locales: collection.locales,
    fieldCount: collection.fields.length,
    entryCount,
    createdAt: collection.createdAt,
    updatedAt: collection.updatedAt,
    updatedBy: collection.updatedBy,
  }
}

// Collection contract sync writes through internal component functions
// only. The CLI reaches this path with Convex deploy-key admin auth. The
// old public snapshot-install mutation was deleted because it allowed any
// authenticated client that knew the deployment URL to mutate collection
// contracts — directly contradicting the ADR that schema is code-owned and
// must not be edited from Studio/MCP.
export const installCollectionContractsArgs = {
  collections: v.array(
    v.object({
      slug: v.string(),
      label: v.optional(localeTextValidator),
      icon: v.optional(v.string()),
      type: v.union(v.literal('flat'), v.literal('tree')),
      routing: collectionRoutingValidator,
      locales: v.array(v.string()),
      fields: v.optional(v.array(fieldValidator)),
      settings: v.optional(jsonValueValidator),
    }),
  ),
}

export const installCollectionContractsReturns = v.object({
  created: v.number(),
  updated: v.number(),
  skipped: v.number(),
  missingFromConfig: v.array(v.string()),
})

const collectionContractDriftValidator = v.object({
  slug: v.string(),
  reason: v.union(v.literal('missing'), v.literal('different')),
  entryCount: v.number(),
  entryCountExact: v.boolean(),
  migrationRequired: v.boolean(),
  safeToPush: v.boolean(),
  changes: v.array(jsonValueValidator),
})

export const checkCollectionContractsReturns = v.object({
  drift: v.array(collectionContractDriftValidator),
  missingFromConfigDetails: v.array(
    v.object({
      slug: v.string(),
      entryCount: v.number(),
      entryCountExact: v.boolean(),
      migrationRequired: v.boolean(),
      safeToPush: v.boolean(),
    }),
  ),
  missingFromConfig: v.array(v.string()),
})

function normalizedIncomingContract(
  incoming: SyncConfigCollectionsArgs['collections'][number],
): CollectionContractSnapshot {
  const fields = normalizeFields(incoming.fields ?? [])
  const routing = normalizeRouting(incoming.routing)
  const label = incoming.label ?? deriveCollectionLabel(incoming.slug)
  const icon = incoming.icon ?? null
  const settings = incoming.settings ?? {}
  return {
    slug: incoming.slug,
    label,
    icon,
    type: incoming.type,
    routing,
    locales: incoming.locales,
    fields,
    settings,
    contract: contractSnapshot({
      slug: incoming.slug,
      label,
      icon,
      type: incoming.type,
      routing,
      locales: incoming.locales,
      fields,
      settings,
    }),
  }
}

function normalizedExistingContract(collection: Doc<'collections'>): CollectionContractSnapshot {
  const fields = normalizeFields((collection.fields ?? []) as Array<Partial<CmsField>>)
  const routing = normalizeRouting(collection.routing)
  const settings = collection.settings ?? {}
  return {
    slug: collection.slug,
    label: collection.label,
    icon: collection.icon ?? null,
    type: collection.type,
    routing,
    locales: collection.locales,
    fields,
    settings,
    ...(collection.contract ? { contract: collection.contract } : {}),
  }
}

async function syncCodeDefinedCollectionContracts(
  ctx: MutationCtx,
  args: SyncConfigCollectionsArgs,
  appIdentityId: string,
) {
  let created = 0
  let updated = 0
  let skipped = 0
  const incomingSlugs = new Set(args.collections.map((collection) => collection.slug))
  const existingCollections = await ctx.db.query('collections').collect()
  const missingFromConfig: string[] = []
  for (const collection of existingCollections) {
    if (incomingSlugs.has(collection.slug)) continue
    if (await collectionHasEntries(ctx, collection._id)) {
      missingFromConfig.push(collection.slug)
      continue
    }
    await ctx.db.delete(collection._id)
  }
  missingFromConfig.sort((left, right) => left.localeCompare(right))

  for (const incoming of args.collections) {
    const now = Date.now()
    const fields = normalizeFields(incoming.fields ?? [])
    const normalizedRouting = normalizeRouting(incoming.routing)
    const label = incoming.label ?? deriveCollectionLabel(incoming.slug)
    const icon = incoming.icon ?? null
    const settings = incoming.settings ?? {}

    assertValidSlug(incoming.slug, 'COLLECTION_INVALID_SLUG')
    assertFieldDefinitionsValid(fields)
    incoming.locales.forEach((locale) => assertValidLocaleCode(locale, 'COLLECTION_LOCALE_INVALID'))

    const existing = await ctx.db
      .query('collections')
      .withIndex('by_slug', (q) => q.eq('slug', incoming.slug))
      .first()

    if (existing) {
      const hasEntries = await collectionHasEntries(ctx, existing._id)
      const existingFields = normalizeFields((existing.fields ?? []) as Array<Partial<CmsField>>)
      const existingRouting = normalizeRouting(existing.routing)
      if (hasEntries) {
        const drift = classifyCollectionContractDrift({
          existing: normalizedExistingContract(existing),
          incoming: normalizedIncomingContract(incoming),
          entryCount: 1,
        })
        const incompatibleChanges = contractChangeCategories(drift.changes)
        if (incompatibleChanges.length > 0) {
          throwCmsError(
            'COLLECTION_CONTRACT_CHANGE_REQUIRES_MIGRATION',
            `Collection "${incoming.slug}" has entries and cannot accept code-defined contract changes to ${incompatibleChanges.join(', ')} while drift is migration-required. Run \`pnpm exec ginko-cms push --check\` to inspect drift, then follow docs/guides/changing-collections.md#when-a-migration-is-required. Development-only table resets are not a production migration path.`,
            {
              slug: incoming.slug,
              changes: incompatibleChanges,
              reason:
                'Existing entries may no longer validate or project correctly under the new collection contract.',
              safeNextStep:
                'Run pnpm exec ginko-cms push --check, plan the content change, and push only after the check reports safe drift.',
              docs: 'docs/guides/changing-collections.md#when-a-migration-is-required',
              devResetWarning:
                'Clearing CMS tables is only acceptable for disposable development deployments.',
            },
          )
        }
      }

      const patch: Record<string, unknown> = {}
      let changed = false

      if (!isEqualJsonValue(existing.label, label)) {
        patch.label = label
        changed = true
      }
      if (existing.icon !== icon) {
        patch.icon = icon
        changed = true
      }
      if (!isEqualJsonValue(existingFields, fields)) {
        patch.fields = fields
        changed = true
      }
      if (!isEqualJsonValue(existing.locales, incoming.locales)) {
        patch.locales = incoming.locales
        changed = true
      }
      if (!isEqualJsonValue(existing.settings ?? {}, settings)) {
        patch.settings = settings
        changed = true
      }

      const nextContract = contractSnapshot({
        slug: incoming.slug,
        label,
        icon,
        type: incoming.type,
        routing: normalizedRouting,
        locales: incoming.locales,
        fields,
        settings,
      })
      if (!isEqualJsonValue(existingRouting, normalizedRouting)) {
        patch.routing = normalizedRouting
        changed = true
      }

      if (existing.type !== incoming.type) {
        patch.type = incoming.type
        changed = true
      }

      if (!isEqualJsonValue(existing.contract ?? null, nextContract)) {
        patch.contract = nextContract
        changed = true
      }

      if (!changed) {
        skipped += 1
        continue
      }

      patch.updatedAt = now
      patch.updatedBy = appIdentityId
      await ctx.db.patch(existing._id, patch)

      const needsReindex =
        patch.routing !== undefined || patch.locales !== undefined || patch.fields !== undefined
      if (needsReindex) {
        await scheduleCollectionReindex(ctx, existing._id, appIdentityId)
      }

      updated += 1
      continue
    }

    await ctx.db.insert('collections', {
      slug: incoming.slug,
      label,
      icon,
      type: incoming.type,
      routing: normalizedRouting,
      locales: incoming.locales,
      fields,
      settings,
      contract: contractSnapshot({
        slug: incoming.slug,
        label,
        icon,
        type: incoming.type,
        routing: normalizedRouting,
        locales: incoming.locales,
        fields,
        settings,
      }),
      createdAt: now,
      updatedAt: now,
      updatedBy: appIdentityId,
    })
    created += 1
  }

  return { created, updated, skipped, missingFromConfig }
}

export async function checkCollectionContractsHandler(
  ctx: QueryOrMutationCtx,
  args: SyncConfigCollectionsArgs,
) {
  const incomingSlugs = new Set(args.collections.map((collection) => collection.slug))
  const existingCollections = await ctx.db.query('collections').collect()
  const missingFromConfigDetails = await Promise.all(
    existingCollections
      .filter((collection) => !incomingSlugs.has(collection.slug))
      .map(async (collection) => {
        const entryCount = await collectionEntryCountSnapshot(ctx, collection._id)
        return {
          slug: collection.slug,
          entryCount: entryCount.count,
          entryCountExact: entryCount.exact,
          migrationRequired: entryCount.count > 0,
          safeToPush: entryCount.count === 0,
        }
      }),
  )
  missingFromConfigDetails.sort((left, right) => left.slug.localeCompare(right.slug))
  const missingFromConfig = missingFromConfigDetails.map((collection) => collection.slug)
  const drift: Array<{
    slug: string
    reason: 'missing' | 'different'
    entryCount: number
    entryCountExact: boolean
    migrationRequired: boolean
    safeToPush: boolean
    changes: JsonValue[]
  }> = []

  for (const incoming of args.collections) {
    const normalized = normalizedIncomingContract(incoming)
    const existing = await ctx.db
      .query('collections')
      .withIndex('by_slug', (q) => q.eq('slug', incoming.slug))
      .first()

    if (!existing) {
      const missing = classifyMissingCollectionContract(incoming.slug)
      drift.push({ ...missing, reason: 'missing', entryCountExact: true })
      continue
    }

    const entryCount = await collectionEntryCountSnapshot(ctx, existing._id)
    const contractDrift = classifyCollectionContractDrift({
      existing: normalizedExistingContract(existing),
      incoming: normalized,
      entryCount: entryCount.count,
    })
    if (contractDrift.changes.length > 0) {
      drift.push({ ...contractDrift, reason: 'different', entryCountExact: entryCount.exact })
    }
  }

  return { drift, missingFromConfig, missingFromConfigDetails }
}

export async function installCollectionContractsHandler(
  ctx: MutationCtx,
  args: SyncConfigCollectionsArgs,
) {
  return await syncCodeDefinedCollectionContracts(ctx, args, 'bootstrap')
}
