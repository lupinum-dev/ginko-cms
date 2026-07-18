import { paginationOptsValidator } from 'convex/server'
import { v } from 'convex/values'

import { defineArgs } from '../args.js'
import { assetScopeValidator, localeTextValidator } from '../validators.js'

export const getAsset = defineArgs({
  description: 'Load one CMS asset with ownership and reference status.',
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

export const listAssetsByOwner = defineArgs({
  description: 'Page through active CMS assets owned by one exact scope.',
  args: {
    paginationOpts: v.optional(paginationOptsValidator),
    scope: assetScopeValidator,
    collection: v.optional(v.string()),
    entryId: v.optional(v.string()),
  },
})

export const listAssetUsages = defineArgs({
  description: 'Page through canonical content references for one CMS asset.',
  args: {
    assetId: v.string(),
    paginationOpts: v.optional(paginationOptsValidator),
  },
})

export const getAssetManagerData = defineArgs({
  description: 'Search and page CMS assets through the exact Studio discovery contract.',
  args: {
    paginationOpts: v.optional(paginationOptsValidator),
    search: v.optional(v.string()),
    kind: v.optional(v.union(v.literal('all'), v.literal('image'), v.literal('document'))),
    deleted: v.optional(v.union(v.literal('active'), v.literal('trashed'), v.literal('all'))),
    usage: v.optional(
      v.union(
        v.literal('all'),
        v.literal('used'),
        v.literal('unused-verified'),
        v.literal('unknown-stale'),
      ),
    ),
    time: v.optional(
      v.union(
        v.literal('any'),
        v.literal('24h'),
        v.literal('7d'),
        v.literal('30d'),
        v.literal('90d'),
      ),
    ),
    size: v.optional(
      v.union(v.literal('any'), v.literal('small'), v.literal('medium'), v.literal('large')),
    ),
    tag: v.optional(v.string()),
    sort: v.optional(
      v.union(v.literal('name'), v.literal('date'), v.literal('size'), v.literal('kind')),
    ),
    location: v.optional(
      v.union(
        v.literal('all'),
        v.literal('global'),
        v.literal('collection'),
        v.literal('entry'),
        v.literal('accessible'),
      ),
    ),
    collection: v.optional(v.string()),
    entryId: v.optional(v.string()),
  },
})

export const createAssetUploadSession = defineArgs({
  description: 'Create one expiring, owner-bound asset upload session.',
  args: {},
})

export const claimAssetUploadSession = defineArgs({
  description: 'Bind uploaded storage bytes to their expiring upload session.',
  args: {
    sessionId: v.string(),
    token: v.string(),
    storageId: v.id('_storage'),
  },
})

export const finalizeAssetUploadSession = defineArgs({
  description: 'Verify uploaded bytes and atomically create the CMS asset.',
  args: {
    sessionId: v.string(),
    token: v.string(),
    filename: v.string(),
    alt: v.optional(localeTextValidator),
    caption: v.optional(localeTextValidator),
    scope: assetScopeValidator,
    entryId: v.optional(v.string()),
    collection: v.optional(v.string()),
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

export const verifyAssetReplacementUpload = defineArgs({
  description:
    'Verify one claimed upload as a compatible replacement candidate for an existing asset.',
  args: {
    assetId: v.string(),
    sessionId: v.string(),
    token: v.string(),
    filename: v.string(),
  },
})

export const previewReplaceAssetOperation = defineArgs({
  description:
    'Preview the stable-reference, public freshness, metadata, and recovery impact of replacing asset bytes.',
  args: {
    assetId: v.string(),
    sessionId: v.string(),
  },
})

export const replaceAsset = defineArgs({
  description:
    'Execute one confirmed asset replacement after re-verifying both candidate and recovery bytes.',
  args: {
    assetId: v.string(),
    sessionId: v.string(),
    _confirmationToken: v.optional(v.string()),
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
    collection: v.optional(v.string()),
  },
})

export const deleteAsset = defineArgs({
  description: 'Move an asset to trash.',
  args: {
    assetId: v.string(),
    force: v.optional(v.boolean()),
  },
})
