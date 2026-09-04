import { portableSharedDraftState } from '@lupinum/ginko-cms-contract/shared/placementGraph.js'
import type { CmsField, JsonMap } from '@lupinum/ginko-cms-contract/shared/types.js'
import type {
  ResolvedContentCollectionV1,
  ResolvedContentContractV1,
  ResolvedContentFieldV1,
} from '@lupinum/ginko-content/cms-contract'
import {
  collectPortableMdcAssetReferences,
  hashCanonicalJson,
  rewritePortableMdcAssetReferencesForStorage,
  rewriteStoredMdcAssetReferences,
  validatePortableDocument,
  type PortableAssetReferenceV1,
  type PortableDocumentV1,
} from '@lupinum/ginko-content/portability'

import type { Doc, Id } from '../_generated/dataModel.js'
import { refreshDraftAssetRefsForSave } from '../entries/workflow/commands.js'
import { applyDraftPatch } from '../entries/workflow/drafts.js'
import { getCollectionOrThrow } from '../lib/collections.js'
import { assertMdcBodyWithinLimit } from '../lib/contentLimits.js'
import { readInstalledCmsContract } from '../lib/installedContract.js'
import type { MutationCtx, QueryOrMutationCtx } from '../lib/types.js'
import { assertFieldDataValid } from '../lib/validation.js'
import type { PortableImportPlanItemPayload } from './model.js'
import { hashPortableDocument } from './portableJson.js'

async function activeContract(
  ctx: QueryOrMutationCtx,
  options: { requireWritable?: boolean; expectedContentHash?: string } = {},
): Promise<ResolvedContentContractV1> {
  const installed = await readInstalledCmsContract(ctx)
  if (!installed) throw new Error('Portable import requires an installed CMS contract.')
  if (options.requireWritable && installed.record.transitionState !== 'ready') {
    throw new Error('Portable import writes are blocked while a contract transition is active.')
  }
  if (
    options.expectedContentHash !== undefined &&
    installed.record.contentHash !== options.expectedContentHash
  ) {
    throw new Error('Portable plan target content hash no longer matches the installed contract.')
  }
  return installed.content
}

async function resolveParentEntryId(
  ctx: QueryOrMutationCtx,
  document: PortableDocumentV1,
  collection: string,
): Promise<Id<'entries'> | null> {
  if (document.parentCanonicalKey === null) return null
  const parentCanonicalKey = document.parentCanonicalKey
  const parent = await ctx.db
    .query('entries')
    .withIndex('by_collection_stableId', (query) =>
      query.eq('collection', collection).eq('stableId', parentCanonicalKey),
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
    if (field.type === 'image') {
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
    reference.collection !== field.relation?.collection ||
    typeof reference.canonicalKey !== 'string'
  ) {
    throw new Error(`Portable relation ${field.key} targets the wrong collection.`)
  }
  const targetCollection = await getCollectionOrThrow(ctx, reference.collection)
  const target = await ctx.db
    .query('entries')
    .withIndex('by_collection_stableId', (query) =>
      query
        .eq('collection', targetCollection.slug)
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
    .query('portableAssets')
    .withIndex('by_run_sha256', (query) =>
      query.eq('runId', runId).eq('sha256', reference.sha256 as string),
    )
    .unique()
  if (!stage || stage.mode !== 'import' || stage.state !== 'attached' || !stage.assetId) {
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
      .query('portableAssets')
      .withIndex('by_run_sha256', (query) =>
        query.eq('runId', runId).eq('sha256', reference.sha256),
      )
      .unique()
    if (!stage || stage.mode !== 'import' || stage.state !== 'attached' || !stage.assetId) {
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
    if (field.type === 'image') {
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

async function portableBody(
  ctx: QueryOrMutationCtx,
  collection: ResolvedContentCollectionV1,
  source: string,
): Promise<PortableDocumentV1['body']> {
  if (collection.portable.format !== 'mdc') return null
  return {
    kind: 'mdc',
    source: await rewriteStoredMdcAssetReferences(
      source,
      collection.componentPolicy,
      async (identity) => {
        const reference = await portableAsset(ctx, identity)
        if (reference.kind !== 'local') {
          throw new Error('Stored MDC asset identity is not managed.')
        }
        return reference.path
      },
    ),
  }
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
  const collection = await getCollectionOrThrow(ctx, entry.collection)
  const localized = await ctx.db
    .query('entryLocaleDrafts')
    .withIndex('by_entry_locale', (query) => query.eq('entryId', entryId).eq('locale', locale))
    .unique()
  if (!localized) return null
  const values = { ...localized.values } as JsonMap
  const publicValue = values.public
  delete values.public
  const visibility =
    publicValue && typeof publicValue === 'object' && !Array.isArray(publicValue)
      ? (publicValue as JsonMap)
      : {}
  const parent = entry.parentEntryId ? await ctx.db.get(entry.parentEntryId) : null
  const collectionContract = contract.collections[collection.slug]!
  return validatePortableDocument(
    {
      format: 'ginko-content-document',
      version: 1,
      collection: collection.slug,
      canonicalKey: entry.stableId,
      locale,
      slug: localized.slug ?? entry.slug,
      parentCanonicalKey: parent?.stableId ?? null,
      order: collectionContract.structure === 'tree' ? entry.orderRank || null : null,
      shared: await portableFields(
        ctx,
        collectionContract.fields.filter((field) => !field.localized),
        entry.shared,
      ),
      localized: await portableFields(
        ctx,
        collectionContract.fields.filter((field) => field.localized),
        values,
      ),
      body: await portableBody(ctx, collectionContract, localized.bodyMdc),
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
  const localized = revision.snapshots[input.locale]
  if (!localized) throw new Error('Portable export revision does not contain its rostered locale.')
  const values = { ...localized.values } as JsonMap
  const publicValue = values.public
  delete values.public
  const visibility =
    publicValue && typeof publicValue === 'object' && !Array.isArray(publicValue)
      ? (publicValue as JsonMap)
      : {}
  const parent = localized.parentEntryId ? await ctx.db.get(localized.parentEntryId) : null
  return validatePortableDocument(
    {
      format: 'ginko-content-document',
      version: 1,
      collection: input.collection,
      canonicalKey: input.canonicalKey,
      locale: input.locale,
      slug: collectionContract.routing.mode === 'none' ? '' : localized.slug,
      parentCanonicalKey: parent?.stableId ?? null,
      order: collectionContract.structure === 'tree' ? localized.orderRank || null : null,
      shared: await portableFields(
        ctx,
        collectionContract.fields.filter((field) => !field.localized),
        localized.shared,
      ),
      localized: await portableFields(
        ctx,
        collectionContract.fields.filter((field) => field.localized),
        values,
      ),
      body: await portableBody(ctx, collectionContract, localized.bodyMdc ?? ''),
      visibility: {
        navigation: visibility.navigation === true,
        search: visibility.search === true,
        sitemap: visibility.sitemap === true,
      },
    },
    input.contract,
  )
}

async function currentPortableSharedSha256(
  ctx: QueryOrMutationCtx,
  entry: Doc<'entries'>,
  contract: ResolvedContentContractV1,
): Promise<string> {
  const collection = contract.collections[entry.collection]
  if (!collection) throw new Error(`Portable collection "${entry.collection}" is not installed.`)
  const parent = entry.parentEntryId ? await ctx.db.get(entry.parentEntryId) : null
  return await hashCanonicalJson(
    portableSharedDraftState({
      collection: entry.collection,
      canonicalKey: entry.stableId,
      parentCanonicalKey: parent?.stableId ?? null,
      order: collection.structure === 'tree' ? entry.orderRank || null : null,
      shared: await portableFields(
        ctx,
        collection.fields.filter((field) => !field.localized),
        entry.shared,
      ),
    }),
  )
}

export async function inspectPortableDraft(
  ctx: QueryOrMutationCtx,
  identity: { collection: string; canonicalKey: string; locale: string },
): Promise<{ currentDraftSha256: string | null; currentSharedSha256: string | null }> {
  const contract = await activeContract(ctx)
  const collection = await getCollectionOrThrow(ctx, identity.collection)
  const entry = await ctx.db
    .query('entries')
    .withIndex('by_collection_stableId', (query) =>
      query.eq('collection', collection.slug).eq('stableId', identity.canonicalKey),
    )
    .first()
  if (!entry) return { currentDraftSha256: null, currentSharedSha256: null }
  const document = await currentPortableDocument(ctx, entry._id, identity.locale, contract)
  return {
    currentDraftSha256: document ? await hashPortableDocument(document) : null,
    currentSharedSha256: await currentPortableSharedSha256(ctx, entry, contract),
  }
}

export async function portableDraftSha256(
  ctx: QueryOrMutationCtx,
  identity: { collection: string; canonicalKey: string; locale: string },
): Promise<string | null> {
  return (await inspectPortableDraft(ctx, identity)).currentDraftSha256
}

type PortableDraftGroupItem = {
  documentValue: JsonMap
  planItem: PortableImportPlanItemPayload
}

type PortableDraftApplyResult = {
  effect: 'created-draft' | 'updated-draft' | 'skipped'
  resultId: string
}

export async function applyPortableDraftGroup(
  ctx: MutationCtx,
  args: {
    items: PortableDraftGroupItem[]
    runId: string
    targetContentHash: string
    appIdentityId: string
    now: number
  },
): Promise<PortableDraftApplyResult[]> {
  if (args.items.length === 0) throw new Error('Portable draft group is empty.')
  const contract = await activeContract(ctx, {
    requireWritable: true,
    expectedContentHash: args.targetContentHash,
  })
  const documents = args.items.map(({ documentValue }) =>
    validatePortableDocument(documentValue, contract),
  )
  const first = documents[0]!
  const collection = await getCollectionOrThrow(ctx, first.collection)

  for (let index = 0; index < args.items.length; index += 1) {
    const { planItem } = args.items[index]!
    const document = documents[index]!
    assertMdcBodyWithinLimit(document.body?.source ?? '', {
      locale: document.locale,
      field: 'bodyMdc',
    })
    if ((await hashPortableDocument(document)) !== planItem.documentSha256) {
      throw new Error('Portable document hash mismatch.')
    }
    if (
      document.collection !== planItem.identity.collection ||
      document.canonicalKey !== planItem.identity.canonicalKey ||
      document.locale !== planItem.identity.locale
    ) {
      throw new Error('Portable document identity does not match its plan item.')
    }
    if (document.collection !== first.collection || document.canonicalKey !== first.canonicalKey) {
      throw new Error('Portable draft group contains multiple canonical entries.')
    }
    if ((await hashCanonicalJson(portableSharedDraftState(document))) !== planItem.sharedSha256) {
      throw new Error('Portable shared draft hash mismatch.')
    }
    if (
      planItem.sharedSha256 !== args.items[0]!.planItem.sharedSha256 ||
      planItem.expectedSharedSha256 !== args.items[0]!.planItem.expectedSharedSha256
    ) {
      throw new Error('Portable draft group has inconsistent shared-state fences.')
    }
  }

  const existing = await ctx.db
    .query('entries')
    .withIndex('by_collection_stableId', (query) =>
      query.eq('collection', collection.slug).eq('stableId', first.canonicalKey),
    )
    .first()
  const expectedSharedSha256 = args.items[0]!.planItem.expectedSharedSha256
  const currentSharedSha256 = existing
    ? await currentPortableSharedSha256(ctx, existing, contract)
    : null
  if (currentSharedSha256 !== expectedSharedSha256) {
    throw new Error('Portable guarded update rejected: current shared draft hash mismatch.')
  }

  for (let index = 0; index < args.items.length; index += 1) {
    const { planItem } = args.items[index]!
    const currentSha256 = existing ? await portableDraftSha256(ctx, planItem.identity) : null
    if (currentSha256 !== planItem.expectedDraftSha256) {
      throw new Error('Portable guarded update rejected: current locale draft hash mismatch.')
    }
    const expectedEffect =
      currentSha256 === null
        ? 'create'
        : currentSha256 === planItem.documentSha256
          ? 'skip'
          : 'update'
    if (planItem.effect === 'conflict') {
      throw new Error('Portable conflict items cannot be applied.')
    }
    if (planItem.effect !== expectedEffect) {
      throw new Error(`Portable plan item effect mismatch: expected ${expectedEffect}.`)
    }
  }

  const normalized = await Promise.all(
    documents.map(async (document) => {
      const shared = await normalizePortableFields(
        ctx,
        collection.fields,
        document.shared,
        args.runId,
      )
      const localized = await normalizePortableFields(
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
      assertMdcBodyWithinLimit(bodyMdc, { locale: document.locale, field: 'bodyMdc' })
      assertFieldDataValid(collection.fields, { ...shared, ...localized })
      return { shared, localized, bodyMdc }
    }),
  )
  const parentEntryId = await resolveParentEntryId(ctx, first, collection.slug)

  if (!existing) {
    const defaultLocale = contract.collections[first.collection]!.defaultLocale
    const defaultIndex = documents.findIndex((document) => document.locale === defaultLocale)
    const slug = documents[defaultIndex < 0 ? 0 : defaultIndex]!.slug
    const entryId = await ctx.db.insert('entries', {
      collection: collection.slug,
      stableId: first.canonicalKey,
      lifecycle: 'active',
      slug,
      parentEntryId,
      orderRank: first.order ?? '',
      nodeKind: 'page',
      shared: normalized[0]!.shared,
      draftVersion: 1,
      sharedVersion: 1,
      activePublications: [],
      latestEditorialRevisionId: null,
      createdBy: args.appIdentityId,
      updatedBy: args.appIdentityId,
      createdAt: args.now,
      updatedAt: args.now,
    })
    for (let index = 0; index < documents.length; index += 1) {
      const document = documents[index]!
      const values = localeValues(document, normalized[index]!.localized)
      await ctx.db.insert('entryLocaleDrafts', {
        entryId,
        locale: document.locale,
        slug: document.slug,
        values,
        bodyMdc: normalized[index]!.bodyMdc,
        version: 1,
        updatedBy: args.appIdentityId,
        updatedAt: args.now,
      })
    }
    await refreshDraftAssetRefsForSave(ctx, {
      entryId,
      collection: collection.slug,
      sharedUpdated: true,
      affectedLocales: documents.map((document) => document.locale),
    })
    return args.items.map(() => ({ effect: 'created-draft', resultId: String(entryId) }))
  }

  const locales: Record<string, { slug: string; values: JsonMap; bodyMdc: string }> = {}
  for (let index = 0; index < documents.length; index += 1) {
    if (args.items[index]!.planItem.effect === 'skip') continue
    const document = documents[index]!
    locales[document.locale] = {
      slug: document.slug,
      values: localeValues(document, normalized[index]!.localized),
      bodyMdc: normalized[index]!.bodyMdc,
    }
  }
  const result = await applyDraftPatch(ctx, {
    entryId: existing._id,
    expectedDraftVersion: existing.draftVersion,
    patch: {
      shared: {
        parentEntryId,
        orderRank: first.order,
        shared: normalized[0]!.shared,
      },
      locales,
    },
    appIdentity: args.appIdentityId,
    now: args.now,
  })
  await refreshDraftAssetRefsForSave(ctx, {
    entryId: existing._id,
    collection: collection.slug,
    sharedUpdated: result.sharedUpdated,
    affectedLocales: result.affectedLocales,
  })
  return args.items.map(({ planItem }) => ({
    effect:
      planItem.effect === 'create'
        ? 'created-draft'
        : planItem.effect === 'skip'
          ? 'skipped'
          : 'updated-draft',
    resultId: String(existing._id),
  }))
}
