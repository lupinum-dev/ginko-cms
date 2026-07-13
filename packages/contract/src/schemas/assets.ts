import { paginationOptsValidator } from 'convex/server'
import { v } from 'convex/values'

import { defineArgs } from '../args.js'
import { assetScopeValidator, localeTextValidator } from '../validators.js'

export const getAssetUrl = defineArgs({
  description: 'Resolve one asset id to a storage URL.',
  args: {
    assetId: v.string(),
  },
})

export const getAsset = defineArgs({
  description: 'Load one CMS asset with ownership and usage metadata.',
  args: {
    assetId: v.string(),
  },
})

export const resolveAssetUrls = defineArgs({
  description: 'Resolve CMS asset ids to storage URLs.',
  args: {
    assetIds: v.array(v.string()),
  },
})

export const listColocatedAssets = defineArgs({
  description:
    'List assets grouped by current entry, current collection, global, and other collections.',
  args: {
    collectionSlug: v.string(),
    entryId: v.optional(v.string()),
  },
})

export const getAssetManagerData = defineArgs({
  description: 'List CMS assets for the Studio asset manager.',
  args: {
    paginationOpts: v.optional(paginationOptsValidator),
    search: v.optional(v.string()),
    kind: v.optional(v.union(v.literal('all'), v.literal('image'), v.literal('document'))),
    deleted: v.optional(v.union(v.literal('active'), v.literal('trashed'), v.literal('all'))),
    usage: v.optional(v.union(v.literal('all'), v.literal('used'), v.literal('unused'))),
  },
})

export const registerAsset = defineArgs({
  description: 'Register a freshly uploaded asset in the CMS.',
  args: {
    storageId: v.string(),
    filename: v.string(),
    mimeType: v.string(),
    size: v.number(),
    width: v.optional(v.number()),
    height: v.optional(v.number()),
    alt: v.optional(localeTextValidator),
    caption: v.optional(localeTextValidator),
    scope: assetScopeValidator,
    entryId: v.optional(v.string()),
    collectionId: v.optional(v.string()),
    collectionSlug: v.optional(v.string()),
  },
  meta: {
    filename: {
      label: 'Filename',
      description: 'Original filename to store for the asset.',
      examples: ['hero.png', 'logo.svg'],
    },
    scope: {
      label: 'Scope',
      description: 'Whether the asset is global, collection-scoped, or entry-scoped.',
      enum: ['global', 'collection', 'entry'],
    },
  },
})

export const attachAssetsToEntry = defineArgs({
  description: 'Attach existing assets to an entry.',
  args: {
    entryId: v.string(),
    assetIds: v.array(v.string()),
  },
})

export const updateAsset = defineArgs({
  description: 'Update asset metadata.',
  args: {
    assetId: v.string(),
    alt: v.optional(localeTextValidator),
    caption: v.optional(localeTextValidator),
    filename: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
  },
})

export const moveAsset = defineArgs({
  description: 'Move an asset to a different CMS scope.',
  args: {
    assetId: v.string(),
    scope: assetScopeValidator,
    entryId: v.optional(v.string()),
    collectionId: v.optional(v.string()),
    collectionSlug: v.optional(v.string()),
  },
})

export const deleteAsset = defineArgs({
  description: 'Move an asset to trash.',
  args: {
    assetId: v.string(),
  },
})
