import {
  normalizeContentPath,
  uniqueContentTags,
} from '@lupinum/ginko-cms-contract/shared/contentTags.js'
import type { CmsField, JsonValue, LocaleText } from '@lupinum/ginko-cms-contract/shared/types.js'
import { v } from 'convex/values'

import type { Doc } from '../_generated/dataModel.js'
import { canManageCollections } from '../auth/checks.js'
import { rebuildContentAssetRefsForEntry } from '../entries/projections.js'
import { pathPrefixForLocale } from '../entries/workflow/path.js'
import { upsertPublicProjection } from '../entries/workflow/projection.js'
import { buildPublicProjectionFromRevisionSnapshot } from '../entries/workflow/projectionBuild.js'
import { throwCmsError } from '../errors.js'
import { callerMutation } from '../functions.js'
import type { getCollectionOrThrow } from '../lib/collections.js'
import { collectionHasEntries } from '../lib/collections.js'
import { isEqualJsonValue } from '../lib/data.js'
import { normalizeFields } from '../lib/fields.js'
import { toStringId } from '../lib/ids.js'
import { resolveLocaleText } from '../lib/locale.js'
import type { MutationCtx } from '../lib/types.js'
import {
  assertFieldDefinitionsValid,
  assertValidLocaleCode,
  assertValidSlug,
} from '../lib/validation.js'
import {
  classifyCollectionContractDrift,
  contractChangeCategories,
  type CollectionContractSnapshot,
} from './drift.js'
import { scheduleCollectionReindex } from './jobs.js'

type EntryDoc = Doc<'entries'>
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

export async function recomputeEntryDerivedState(
  ctx: MutationCtx,
  collection: Awaited<ReturnType<typeof getCollectionOrThrow>>,
  entry: EntryDoc,
  generation?: string,
) {
  const publicRows = await ctx.db
    .query('publicEntries')
    .withIndex('by_entry_locale', (q) => q.eq('entryId', entry._id))
    .collect()
  const oldPaths = publicRows.map((row) => row.href)
  const newPaths: string[] = []
  const tags: string[] = []

  for (const row of publicRows) {
    const revision = await ctx.db.get(row.revisionId)
    const localeSnapshot = revision?.snapshot.locales[row.locale] ?? null
    if (!revision || !localeSnapshot) continue
    const projection = await buildPublicProjectionFromRevisionSnapshot(ctx, {
      entry,
      collection,
      revisionId: revision._id,
      snapshot: {
        parentEntryId: revision.snapshot.parentEntryId ?? null,
        orderRank: revision.snapshot.orderRank ?? null,
      },
      locale: row.locale,
      localeSnapshot,
      now: row.lastPublishedAt,
    })
    await upsertPublicProjection(ctx, projection.input)
    newPaths.push(projection.input.href)
    tags.push(...(projection.input.cacheTags ?? []))
  }

  await rebuildContentAssetRefsForEntry(ctx, entry._id, collection)

  if (!generation || publicRows.length === 0) return false
  const idempotencyKey = `content.revalidate:policy:${generation}:${String(entry._id)}`
  const existing = await ctx.db
    .query('outboxEvents')
    .withIndex('by_idempotency_key', (q) => q.eq('idempotencyKey', idempotencyKey))
    .first()
  if (existing) return false
  const now = Date.now()
  await ctx.db.insert('outboxEvents', {
    type: 'content.revalidate',
    status: 'pending',
    idempotencyKey,
    versionId: null,
    siteId: null,
    tags: uniqueContentTags(tags),
    paths: uniqueContentTags([
      ...oldPaths,
      ...newPaths,
      ...collection.locales.map((locale) => pathPrefixForLocale(collection, locale) || '/'),
    ]).map(normalizeContentPath),
    payload: {
      reason: 'policy_sync',
      collection: collection.slug,
      entryId: String(entry._id),
      generation,
    },
    attempts: 0,
    nextAttemptAt: now,
    lastError: null,
    createdAt: now,
    updatedAt: now,
  })
  return true
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

function normalizedIncomingContract(
  incoming: SyncConfigCollectionsArgs['collections'][number],
  requestedGeneration: string,
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
    contract: { source: 'code', version: requestedGeneration },
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

export async function syncCodeDefinedCollectionContracts(
  ctx: MutationCtx,
  args: SyncConfigCollectionsArgs,
  appIdentityId: string,
  requestedGeneration: string,
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
          incoming: normalizedIncomingContract(incoming, requestedGeneration),
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

      const nextContract = { source: 'code' as const, version: requestedGeneration }
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
        await scheduleCollectionReindex(ctx, existing._id, appIdentityId, nextContract.version)
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
      contract: { source: 'code', version: requestedGeneration },
      createdAt: now,
      updatedAt: now,
      updatedBy: appIdentityId,
    })
    created += 1
  }

  return { created, updated, skipped, missingFromConfig }
}
