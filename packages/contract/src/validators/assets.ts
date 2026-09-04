import { v } from 'convex/values'

import { assetScopeValidator, localeTextValidator } from './foundation.js'

export const assetValidator = v.object({
  _id: v.string(),
  filename: v.string(),
  mimeType: v.string(),
  size: v.number(),
  width: v.union(v.number(), v.null()),
  height: v.union(v.number(), v.null()),
  alt: v.union(localeTextValidator, v.null()),
  caption: v.union(localeTextValidator, v.null()),
  scope: assetScopeValidator,
  entryId: v.union(v.string(), v.null()),
  collection: v.union(v.string(), v.null()),
  ownerPath: v.array(v.string()),
  url: v.union(v.string(), v.null()),
  tags: v.array(v.string()),
  createdAt: v.number(),
  updatedAt: v.union(v.number(), v.null()),
})

export const assetRefUsageValidator = v.object({
  sourceKind: v.union(v.literal('draft'), v.literal('revision'), v.literal('public')),
  sourceId: v.string(),
  entryId: v.string(),
  entryTitle: v.string(),
  fieldPath: v.string(),
  locale: v.string(),
  collection: v.string(),
  collectionLabel: v.string(),
})

const assetPaginationFields = { isDone: v.boolean(), continueCursor: v.string() }

export const assetManagerAssetValidator = v.object({
  id: v.string(),
  filename: v.string(),
  mimeType: v.string(),
  size: v.number(),
  width: v.union(v.number(), v.null()),
  height: v.union(v.number(), v.null()),
  scope: assetScopeValidator,
  entryId: v.union(v.string(), v.null()),
  collection: v.union(v.string(), v.null()),
  collectionLabel: v.union(v.string(), v.null()),
  entryTitle: v.union(v.string(), v.null()),
  ownerPath: v.array(v.string()),
  url: v.union(v.string(), v.null()),
  thumbnailUrl: v.union(v.string(), v.null()),
  createdAt: v.number(),
  updatedAt: v.union(v.number(), v.null()),
  deletedAt: v.union(v.number(), v.null()),
  alt: v.union(localeTextValidator, v.null()),
  caption: v.union(localeTextValidator, v.null()),
  tags: v.array(v.string()),
  referenceCertainty: v.object({
    state: v.union(v.literal('used'), v.literal('unused-verified'), v.literal('unknown-stale')),
    proofCurrent: v.boolean(),
    canonicalGeneration: v.number(),
    verifiedRunId: v.union(v.string(), v.null()),
    verifiedAt: v.union(v.number(), v.null()),
  }),
})

export const assetManagerFacetsValidator = v.object({
  activeCount: v.number(),
  trashedCount: v.number(),
  globalActiveCount: v.number(),
  collections: v.array(v.object({ key: v.string(), label: v.string(), count: v.number() })),
  tags: v.array(v.object({ key: v.string(), count: v.number() })),
})

export const assetManagerPageValidator = v.object({
  page: v.array(assetManagerAssetValidator),
  ...assetPaginationFields,
  facets: assetManagerFacetsValidator,
})

export const assetPageValidator = v.object({
  page: v.array(assetManagerAssetValidator),
  ...assetPaginationFields,
})

export const assetUsagePageValidator = v.object({
  page: v.array(assetRefUsageValidator),
  ...assetPaginationFields,
})
