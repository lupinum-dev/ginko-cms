import type { CmsField, JsonMap } from '@lupinum/ginko-cms-contract/shared/types.js'
import {
  assertResolvedContentContract,
  type ResolvedContentContractV1,
} from '@lupinum/ginko-content/cms-contract'
import {
  hashCanonicalJson,
  validatePortableDocument,
  type PortableDocumentV1,
} from '@lupinum/ginko-content/portability'

import type { Id } from '../_generated/dataModel.js'
import { refreshDraftAssetRefsForSave } from '../entries/workflow/commands.js'
import { applyDraftPatch } from '../entries/workflow/drafts.js'
import { getCollectionOrThrow } from '../lib/collections.js'
import type { MutationCtx, QueryOrMutationCtx } from '../lib/types.js'
import { assertFieldDataValid } from '../lib/validation.js'
import type { PortableImportPlanItemPayload } from './model.js'

async function activeContract(ctx: QueryOrMutationCtx): Promise<ResolvedContentContractV1> {
  const policy = await ctx.db
    .query('cmsPolicies')
    .withIndex('by_key', (query) => query.eq('key', 'active'))
    .first()
  if (!policy) throw new Error('Portable import requires an installed Content contract.')
  return assertResolvedContentContract(policy.contract)
}

async function resolveParentEntryId(
  ctx: QueryOrMutationCtx,
  document: PortableDocumentV1,
  collectionId: Id<'collections'>,
): Promise<Id<'entries'> | null> {
  if (document.parentCanonicalKey === null) return null
  const parent = await ctx.db
    .query('entries')
    .withIndex('by_collection_stableId', (query) =>
      query.eq('collectionId', collectionId).eq('stableId', document.parentCanonicalKey),
    )
    .first()
  if (!parent) throw new Error(`Portable parent "${document.parentCanonicalKey}" is not applied.`)
  return parent._id
}

function localeValues(document: PortableDocumentV1, localized: JsonMap): JsonMap {
  return {
    ...localized,
    public: document.visibility,
  } as JsonMap
}

async function normalizePortableFields(
  ctx: MutationCtx,
  fields: CmsField[],
  value: JsonMap,
): Promise<JsonMap> {
  const output: JsonMap = {}
  for (const field of fields) {
    if (!(field.key in value)) continue
    const candidate = value[field.key]
    if (candidate === undefined) {
      throw new Error(`Portable field ${field.key} cannot be undefined.`)
    }
    if (candidate === null) {
      output[field.key] = null
      continue
    }
    if (field.type === 'relation') {
      output[field.key] = await normalizeRelation(ctx, field, candidate)
      continue
    }
    if (field.type === 'relations') {
      if (!Array.isArray(candidate))
        throw new Error(`Portable relation list ${field.key} is invalid.`)
      output[field.key] = await Promise.all(
        candidate.map(async (item) => await normalizeRelation(ctx, field, item)),
      )
      continue
    }
    if (field.type === 'image' || field.type === 'file') {
      output[field.key] = normalizeExternalAsset(candidate)
      continue
    }
    if (field.type === 'images') {
      if (!Array.isArray(candidate)) throw new Error(`Portable asset list ${field.key} is invalid.`)
      output[field.key] = candidate.map(normalizeExternalAsset)
      continue
    }
    if (field.fields?.length && Array.isArray(candidate)) {
      output[field.key] = await Promise.all(
        candidate.map(async (item) =>
          item && typeof item === 'object' && !Array.isArray(item)
            ? await normalizePortableFields(ctx, field.fields!, item as JsonMap)
            : item,
        ),
      )
      continue
    }
    if (field.fields?.length && candidate && typeof candidate === 'object') {
      output[field.key] = await normalizePortableFields(ctx, field.fields, candidate as JsonMap)
      continue
    }
    output[field.key] = candidate
  }
  return output
}

async function normalizeRelation(ctx: MutationCtx, field: CmsField, value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Portable relation ${field.key} is invalid.`)
  }
  const reference = value as { collection?: unknown; canonicalKey?: unknown }
  if (
    typeof reference.collection !== 'string' ||
    reference.collection !== field.relation?.collectionId ||
    typeof reference.canonicalKey !== 'string'
  ) {
    throw new Error(`Portable relation ${field.key} targets the wrong collection.`)
  }
  const targetCollection = await getCollectionOrThrow(ctx, reference.collection)
  const target = await ctx.db
    .query('entries')
    .withIndex('by_collection_stableId', (query) =>
      query
        .eq('collectionId', targetCollection._id)
        .eq('stableId', reference.canonicalKey as string),
    )
    .first()
  if (!target)
    throw new Error(`Portable relation target "${reference.canonicalKey}" is not applied.`)
  return reference.canonicalKey
}

function normalizeExternalAsset(value: unknown): string {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Portable asset reference is invalid.')
  }
  const reference = value as { kind?: unknown; url?: unknown }
  if (reference.kind !== 'external' || typeof reference.url !== 'string') {
    throw new Error('Portable local asset is not attached to the import run.')
  }
  return reference.url
}

function portableFields(fields: CmsField[], value: JsonMap): JsonMap {
  const output: JsonMap = {}
  for (const field of fields) {
    const candidate = value[field.key]
    if (candidate === undefined) continue
    if (candidate === null) {
      output[field.key] = null
      continue
    }
    if (field.type === 'relation') {
      if (typeof candidate !== 'string' || !field.relation?.collectionId) {
        throw new Error(`Stored relation ${field.key} cannot be made portable.`)
      }
      output[field.key] = {
        collection: field.relation.collectionId,
        canonicalKey: candidate,
      }
      continue
    }
    if (field.type === 'relations') {
      if (
        !Array.isArray(candidate) ||
        candidate.some((item) => typeof item !== 'string') ||
        !field.relation?.collectionId
      ) {
        throw new Error(`Stored relation list ${field.key} cannot be made portable.`)
      }
      output[field.key] = candidate.map((canonicalKey) => ({
        collection: field.relation!.collectionId,
        canonicalKey,
      }))
      continue
    }
    if (field.type === 'image' || field.type === 'file') {
      output[field.key] = portableExternalAsset(candidate)
      continue
    }
    if (field.type === 'images') {
      if (!Array.isArray(candidate)) {
        throw new TypeError(`Stored asset list ${field.key} cannot be made portable.`)
      }
      output[field.key] = candidate.map(portableExternalAsset)
      continue
    }
    if (field.fields?.length && Array.isArray(candidate)) {
      output[field.key] = candidate.map((item) =>
        item && typeof item === 'object' && !Array.isArray(item)
          ? portableFields(field.fields!, item as JsonMap)
          : item,
      )
      continue
    }
    if (field.fields?.length && candidate && typeof candidate === 'object') {
      output[field.key] = portableFields(field.fields, candidate as JsonMap)
      continue
    }
    output[field.key] = candidate
  }
  return output
}

function portableExternalAsset(value: unknown) {
  if (typeof value !== 'string' || !value.startsWith('https://')) {
    throw new Error('Stored managed asset requires portable asset staging.')
  }
  return { kind: 'external' as const, url: value }
}

async function currentPortableDocument(
  ctx: QueryOrMutationCtx,
  entryId: Id<'entries'>,
  locale: string,
  contract: ResolvedContentContractV1,
): Promise<PortableDocumentV1 | null> {
  const entry = await ctx.db.get(entryId)
  if (!entry) return null
  const collection = await ctx.db.get(entry.collectionId)
  if (!collection) return null
  const rows = await ctx.db
    .query('entryDrafts')
    .withIndex('by_entry', (query) => query.eq('entryId', entryId))
    .collect()
  const shared = rows.find((row) => row.locale === null)
  const localized = rows.find((row) => row.locale === locale)
  if (!shared || !localized) return null
  const values = { ...(localized.values ?? {}) } as JsonMap
  const publicValue = values.public
  delete values.public
  const visibility =
    publicValue && typeof publicValue === 'object' && !Array.isArray(publicValue)
      ? (publicValue as JsonMap)
      : {}
  const parent = shared.parentEntryId ? await ctx.db.get(shared.parentEntryId) : null
  return validatePortableDocument(
    {
      format: 'ginko-content-document',
      version: 1,
      collection: collection.slug,
      canonicalKey: entry.stableId ?? entry.baseSlug,
      locale,
      slug: localized.localeSlug ?? shared.slug ?? entry.baseSlug,
      parentCanonicalKey: parent?.stableId ?? null,
      order: shared.orderRank ?? entry.orderRank ?? null,
      shared: portableFields(collection.fields, shared.shared ?? {}),
      localized: portableFields(collection.fields, values),
      body: { kind: 'mdc', source: localized.bodyMdc ?? '' },
      visibility: {
        navigation: visibility.navigation === true,
        search: visibility.search === true,
        sitemap: visibility.sitemap === true,
      },
    },
    contract,
  )
}

export async function portableDraftSha256(
  ctx: QueryOrMutationCtx,
  identity: { collection: string; canonicalKey: string; locale: string },
): Promise<string | null> {
  const contract = await activeContract(ctx)
  const collection = await getCollectionOrThrow(ctx, identity.collection)
  const entry = await ctx.db
    .query('entries')
    .withIndex('by_collection_stableId', (query) =>
      query.eq('collectionId', collection._id).eq('stableId', identity.canonicalKey),
    )
    .first()
  if (!entry) return null
  const document = await currentPortableDocument(ctx, entry._id, identity.locale, contract)
  return document ? await hashCanonicalJson(document as unknown as JsonMap) : null
}

export async function applyPortableDraft(
  ctx: MutationCtx,
  args: {
    documentValue: JsonMap
    planItem: PortableImportPlanItemPayload
    appIdentityId: string
    now: number
  },
): Promise<{ effect: 'created-draft' | 'updated-draft' | 'skipped'; resultId: string }> {
  const contract = await activeContract(ctx)
  const document = validatePortableDocument(args.documentValue, contract)
  if ((await hashCanonicalJson(document as unknown as JsonMap)) !== args.planItem.documentSha256) {
    throw new Error('Portable document hash mismatch.')
  }
  if (
    document.collection !== args.planItem.identity.collection ||
    document.canonicalKey !== args.planItem.identity.canonicalKey ||
    document.locale !== args.planItem.identity.locale
  ) {
    throw new Error('Portable document identity does not match its plan item.')
  }

  const collection = await getCollectionOrThrow(ctx, document.collection)
  const normalizedShared = await normalizePortableFields(ctx, collection.fields, document.shared)
  const normalizedLocalized = await normalizePortableFields(
    ctx,
    collection.fields,
    document.localized,
  )
  assertFieldDataValid(collection.fields, { ...normalizedShared, ...normalizedLocalized })
  const existing = await ctx.db
    .query('entries')
    .withIndex('by_collection_stableId', (query) =>
      query.eq('collectionId', collection._id).eq('stableId', document.canonicalKey),
    )
    .first()
  const currentSha256 = existing ? await portableDraftSha256(ctx, args.planItem.identity) : null
  if (currentSha256 !== args.planItem.expectedDraftSha256) {
    throw new Error('Portable guarded update rejected: current draft hash mismatch.')
  }
  if (args.planItem.effect === 'conflict') {
    throw new Error('Portable conflict items cannot be applied.')
  }
  if (args.planItem.effect === 'create' && existing) {
    throw new Error('Portable create item already exists.')
  }
  if ((args.planItem.effect === 'update' || args.planItem.effect === 'skip') && !existing) {
    throw new Error(`Portable ${args.planItem.effect} item no longer exists.`)
  }
  if (args.planItem.effect === 'skip') {
    return { effect: 'skipped', resultId: String(existing!._id) }
  }

  const parentEntryId = await resolveParentEntryId(ctx, document, collection._id)
  const values = localeValues(document, normalizedLocalized)
  if (!existing) {
    const entryId = await ctx.db.insert('entries', {
      collectionId: collection._id,
      baseSlug: document.slug,
      stableId: document.canonicalKey,
      status: 'draft',
      dirtyLocales: [document.locale],
      parentEntryId,
      orderRank: document.order,
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
      orderRank: document.order,
      slug: document.slug,
      shared: normalizedShared,
      updatedBy: args.appIdentityId,
      updatedAt: args.now,
    })
    await ctx.db.insert('entryDrafts', {
      entryId,
      locale: document.locale,
      baseRevisionId: null,
      values,
      bodyMdc: document.body?.source ?? '',
      updatedBy: args.appIdentityId,
      updatedAt: args.now,
    })
    await refreshDraftAssetRefsForSave(ctx, {
      entryId,
      collectionId: collection._id,
      sharedUpdated: true,
      affectedLocales: [document.locale],
      now: args.now,
    })
    return { effect: 'created-draft', resultId: String(entryId) }
  }

  const result = await applyDraftPatch(ctx, {
    entryId: existing._id,
    expectedDraftVersion: existing.draftVersion,
    patch: {
      shared: {
        parentEntryId,
        orderRank: document.order,
        slug: document.slug,
        shared: normalizedShared,
      },
      locales: {
        [document.locale]: {
          values,
          bodyMdc: document.body?.source ?? '',
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
  return { effect: 'updated-draft', resultId: String(existing._id) }
}
