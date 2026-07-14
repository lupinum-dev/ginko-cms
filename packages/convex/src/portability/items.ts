import type { CmsField, JsonMap } from '@lupinum/ginko-cms-contract/shared/types.js'
import {
  assertResolvedContentContract,
  type ResolvedContentContractV1,
  type ResolvedContentFieldV1,
} from '@lupinum/ginko-content/cms-contract'
import {
  hashCanonicalJson,
  collectPortableMdcAssetReferences,
  rewritePortableMdcAssetReferencesForStorage,
  rewriteStoredMdcAssetReferences,
  validatePortableDocument,
  type PortableAssetReferenceV1,
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
  runId: string,
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
      output[field.key] = await normalizePortableAsset(ctx, runId, candidate)
      continue
    }
    if (field.type === 'images') {
      if (!Array.isArray(candidate)) throw new Error(`Portable asset list ${field.key} is invalid.`)
      output[field.key] = await Promise.all(
        candidate.map(async (item) => await normalizePortableAsset(ctx, runId, item)),
      )
      continue
    }
    if (field.fields?.length && Array.isArray(candidate)) {
      output[field.key] = await Promise.all(
        candidate.map(async (item) =>
          item && typeof item === 'object' && !Array.isArray(item)
            ? await normalizePortableFields(ctx, field.fields!, item as JsonMap, runId)
            : item,
        ),
      )
      continue
    }
    if (field.fields?.length && candidate && typeof candidate === 'object') {
      output[field.key] = await normalizePortableFields(
        ctx,
        field.fields,
        candidate as JsonMap,
        runId,
      )
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

async function normalizePortableAsset(ctx: MutationCtx, runId: string, value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Portable asset reference is invalid.')
  }
  const reference = value as { kind?: unknown; url?: unknown; sha256?: unknown }
  if (reference.kind === 'external' && typeof reference.url === 'string') {
    if (!reference.url.startsWith('https://')) {
      throw new Error('Portable external asset URL must use HTTPS.')
    }
    return reference.url
  }
  if (reference.kind !== 'local' || typeof reference.sha256 !== 'string') {
    throw new Error('Portable asset reference is invalid.')
  }
  const stage = await ctx.db
    .query('portableAssetStages')
    .withIndex('by_run_sha256', (query) =>
      query.eq('runId', runId).eq('sha256', reference.sha256 as string),
    )
    .unique()
  if (!stage || stage.state !== 'attached' || !stage.assetId) {
    throw new Error('Portable local asset is not attached to the import run.')
  }
  return stage.assetId
}

async function rewritePortableBodyAssets(
  ctx: MutationCtx,
  runId: string,
  source: string,
  policy: ResolvedContentContractV1['collections'][string]['componentPolicy'],
) {
  const assetIdBySha256 = new Map<string, string>()
  for (const reference of await collectPortableMdcAssetReferences(source, policy)) {
    const stage = await ctx.db
      .query('portableAssetStages')
      .withIndex('by_run_sha256', (query) =>
        query.eq('runId', runId).eq('sha256', reference.sha256),
      )
      .unique()
    if (!stage || stage.state !== 'attached' || !stage.assetId) {
      throw new Error('Portable MDC asset is not attached to the import run.')
    }
    assetIdBySha256.set(reference.sha256, stage.assetId)
  }
  return await rewritePortableMdcAssetReferencesForStorage(source, policy, (reference) => {
    const assetId = assetIdBySha256.get(reference.sha256)
    if (!assetId) throw new Error('Portable MDC asset rewrite is incomplete.')
    return assetId
  })
}

async function portableFields(
  ctx: QueryOrMutationCtx,
  fields: ResolvedContentFieldV1[],
  value: JsonMap,
): Promise<JsonMap> {
  const output: JsonMap = {}
  for (const field of fields) {
    const candidate = value[field.key]
    if (candidate === undefined) continue
    if (candidate === null) {
      output[field.key] = null
      continue
    }
    if (field.type === 'relation') {
      if (typeof candidate !== 'string' || !field.relation?.collection) {
        throw new Error(`Stored relation ${field.key} cannot be made portable.`)
      }
      output[field.key] = {
        collection: field.relation.collection,
        canonicalKey: candidate,
      }
      continue
    }
    if (field.type === 'relations') {
      if (
        !Array.isArray(candidate) ||
        candidate.some((item) => typeof item !== 'string') ||
        !field.relation?.collection
      ) {
        throw new Error(`Stored relation list ${field.key} cannot be made portable.`)
      }
      output[field.key] = candidate.map((canonicalKey) => ({
        collection: field.relation!.collection,
        canonicalKey,
      }))
      continue
    }
    if (field.type === 'image' || field.type === 'file') {
      output[field.key] = await portableAsset(ctx, candidate)
      continue
    }
    if (field.type === 'images') {
      if (!Array.isArray(candidate)) {
        throw new TypeError(`Stored asset list ${field.key} cannot be made portable.`)
      }
      output[field.key] = await Promise.all(
        candidate.map(async (item) => await portableAsset(ctx, item)),
      )
      continue
    }
    if (field.fields?.length && Array.isArray(candidate)) {
      output[field.key] = await Promise.all(
        candidate.map(async (item) =>
          item && typeof item === 'object' && !Array.isArray(item)
            ? await portableFields(ctx, field.fields!, item as JsonMap)
            : item,
        ),
      )
      continue
    }
    if (field.fields?.length && candidate && typeof candidate === 'object') {
      output[field.key] = await portableFields(ctx, field.fields, candidate as JsonMap)
      continue
    }
    output[field.key] = candidate
  }
  return output
}

async function portableAsset(
  ctx: QueryOrMutationCtx,
  value: unknown,
): Promise<PortableAssetReferenceV1> {
  if (typeof value === 'string' && value.startsWith('https://')) {
    return { kind: 'external', url: value as `https://${string}` }
  }
  const assetId = typeof value === 'string' ? ctx.db.normalizeId('assets', value) : null
  const asset = assetId ? await ctx.db.get(assetId) : null
  if (!asset || asset.deletedAt !== null) {
    throw new Error('Stored managed asset is unavailable for portability.')
  }
  const extension =
    asset.mimeType === 'image/jpeg'
      ? 'jpg'
      : asset.mimeType === 'image/png' ||
          asset.mimeType === 'image/gif' ||
          asset.mimeType === 'image/webp'
        ? asset.mimeType.slice('image/'.length)
        : null
  if (!extension) throw new Error('Stored managed asset type is not portable.')
  return {
    kind: 'local' as const,
    path: `/ginko-assets/${asset.sha256}.${extension}` as `/ginko-assets/${string}`,
    sha256: asset.sha256,
    bytes: asset.size,
    mediaType: asset.mimeType as 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp',
    originalFilename: asset.filename,
  }
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
      shared: await portableFields(
        ctx,
        contract.collections[collection.slug]!.fields,
        shared.shared ?? {},
      ),
      localized: await portableFields(ctx, contract.collections[collection.slug]!.fields, values),
      body: {
        kind: 'mdc',
        source: await rewriteStoredMdcAssetReferences(
          localized.bodyMdc ?? '',
          contract.collections[collection.slug]!.componentPolicy,
          async (identity) => {
            const reference = await portableAsset(ctx, identity)
            if (reference.kind !== 'local') {
              throw new Error('Stored MDC asset identity is not managed.')
            }
            return reference.path
          },
        ),
      },
      visibility: {
        navigation: visibility.navigation === true,
        search: visibility.search === true,
        sitemap: visibility.sitemap === true,
      },
    },
    contract,
  )
}

export async function portablePublishedDocument(
  ctx: QueryOrMutationCtx,
  input: {
    revisionId: Id<'entryRevisions'>
    collection: string
    canonicalKey: string
    locale: string
    contract: ResolvedContentContractV1
  },
): Promise<PortableDocumentV1> {
  const revision = await ctx.db.get(input.revisionId)
  if (!revision) throw new Error('Portable export revision is missing.')
  const collectionContract = input.contract.collections[input.collection]
  if (!collectionContract)
    throw new Error('Portable export collection is absent from its contract.')
  const localized = revision.snapshot.locales[input.locale]
  if (!localized) throw new Error('Portable export revision does not contain its rostered locale.')
  const values = { ...localized.values } as JsonMap
  const publicValue = values.public
  delete values.public
  const visibility =
    publicValue && typeof publicValue === 'object' && !Array.isArray(publicValue)
      ? (publicValue as JsonMap)
      : {}
  const parent = revision.snapshot.parentEntryId
    ? await ctx.db.get(revision.snapshot.parentEntryId)
    : null
  return validatePortableDocument(
    {
      format: 'ginko-content-document',
      version: 1,
      collection: input.collection,
      canonicalKey: input.canonicalKey,
      locale: input.locale,
      slug: localized.slug ?? revision.snapshot.slug ?? input.canonicalKey,
      parentCanonicalKey: parent?.stableId ?? null,
      order: revision.snapshot.orderRank ?? null,
      shared: await portableFields(ctx, collectionContract.fields, revision.snapshot.shared),
      localized: await portableFields(ctx, collectionContract.fields, values),
      body: {
        kind: 'mdc',
        source: await rewriteStoredMdcAssetReferences(
          localized.bodyMdc ?? '',
          collectionContract.componentPolicy,
          async (identity) => {
            const reference = await portableAsset(ctx, identity)
            if (reference.kind !== 'local') {
              throw new Error('Stored MDC asset identity is not managed.')
            }
            return reference.path
          },
        ),
      },
      visibility: {
        navigation: visibility.navigation === true,
        search: visibility.search === true,
        sitemap: visibility.sitemap === true,
      },
    },
    input.contract,
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
    runId: string
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
  const normalizedShared = await normalizePortableFields(
    ctx,
    collection.fields,
    document.shared,
    args.runId,
  )
  const normalizedLocalized = await normalizePortableFields(
    ctx,
    collection.fields,
    document.localized,
    args.runId,
  )
  const bodyMdc = document.body
    ? await rewritePortableBodyAssets(
        ctx,
        args.runId,
        document.body.source,
        contract.collections[document.collection]!.componentPolicy,
      )
    : ''
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
      bodyMdc,
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
          bodyMdc,
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
