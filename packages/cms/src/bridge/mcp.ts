import {
  deleteAsset as deleteAssetArgs,
  getAsset as getAssetArgs,
  moveAsset as moveAssetArgs,
  resolveAssetUrls as resolveAssetUrlsArgs,
} from '@lupinum/ginko-cms-contract/convex/schemas/assets.js'
import { getCollection as getCollectionArgs } from '@lupinum/ginko-cms-contract/convex/schemas/collections.js'
import { explainPublicVisibility as explainPublicVisibilityArgs } from '@lupinum/ginko-cms-contract/convex/schemas/diagnostics.js'
import {
  archiveEntry as archiveEntryArgs,
  createEntry as createEntryArgs,
  deleteEntry as deleteEntryArgs,
  getEntry as getEntryArgs,
  listEntries as listEntriesArgs,
  publishEntry as publishEntryArgs,
  saveEntryDraft as saveEntryDraftArgs,
  unarchiveEntry as unarchiveEntryArgs,
  unpublishEntry as unpublishEntryArgs,
} from '@lupinum/ginko-cms-contract/convex/schemas/editor.js'
import {
  list as listArgs,
  nav as navArgs,
  page as pageArgs,
  search as searchArgs,
  sitemap as sitemapArgs,
} from '@lupinum/ginko-cms-contract/convex/schemas/public.js'
import {
  assetManagerAssetValidator,
  accessContextValidator,
  collectionDocValidator,
  collectionListItemValidator,
  draftSaveResultValidator,
  entryListItemValidator,
  ginkoListResultValidator,
  ginkoNavResultValidator,
  ginkoPageResultValidator,
  ginkoPublicVisibilityExplanationValidator,
  ginkoSearchResultValidator,
  ginkoSitemapResultValidator,
  publishResultValidator,
  studioEntryValidator,
} from '@lupinum/ginko-cms-contract/convex/validators.js'
import { operationPreviewValidator } from '@lupinum/trellis/backend'
import type { AnyDataModel, MutationBuilder, RegisteredMutation } from 'convex/server'
import { v } from 'convex/values'

import {
  createBridgeModule,
  readBridgeMutationComponent,
  type BridgeEntry,
  type BridgeModuleResult,
} from './create.js'

function componentArgs(args: unknown): never {
  return args as never
}

function confirmedArgs<TArgs extends Record<string, unknown>>(args: TArgs) {
  return {
    ...args,
    _confirmationToken: v.string(),
  }
}

const backupCountsValidator = v.object({
  entries: v.number(),
  revisions: v.number(),
  assets: v.number(),
  members: v.number(),
})

export const entries = [
  {
    exportName: 'getAccessContext',
    operation: 'internalQuery',
    component: 'members.getAccessContext',
    args: {},
    returns: accessContextValidator,
  },
  {
    exportName: 'exportBackup',
    operation: 'internalAction',
    component: 'backup.exportBackup',
    args: {
      scope: v.literal('entry'),
      entryId: v.string(),
    },
    returns: v.object({
      artifactId: v.string(),
      checksum: v.string(),
      storageRef: v.string(),
      counts: backupCountsValidator,
    }),
  },
  {
    exportName: 'getAsset',
    operation: 'internalQuery',
    component: 'assets.getAsset',
    args: getAssetArgs.args,
    returns: v.union(assetManagerAssetValidator, v.null()),
  },
  {
    exportName: 'resolveAssetUrls',
    operation: 'internalQuery',
    component: 'assets.resolveAssetUrls',
    args: resolveAssetUrlsArgs.args,
    returns: v.record(v.string(), v.union(v.string(), v.null())),
  },
  {
    exportName: 'moveAsset',
    operation: 'internalMutation',
    component: 'assets.moveAsset',
    args: moveAssetArgs.args,
    returns: v.null(),
  },
  {
    exportName: 'deleteAsset',
    operation: 'internalMutation',
    component: 'assets.deleteAssetOperationExecute',
    args: confirmedArgs(deleteAssetArgs.args),
    returns: v.null(),
  },
  {
    exportName: 'previewDeleteAssetOperation',
    operation: 'internalMutation',
    component: 'assets.previewDeleteAssetOperation',
    args: deleteAssetArgs.args,
    returns: operationPreviewValidator(),
  },
  {
    exportName: 'listCollections',
    operation: 'internalQuery',
    component: 'collections.listCollections',
    args: {},
    returns: v.array(collectionListItemValidator),
  },
  {
    exportName: 'getCollection',
    operation: 'internalQuery',
    component: 'collections.getCollection',
    args: getCollectionArgs.args,
    returns: v.union(v.null(), collectionDocValidator),
  },
  {
    exportName: 'page',
    operation: 'internalQuery',
    component: 'public.page',
    args: pageArgs.args,
    returns: ginkoPageResultValidator,
  },
  {
    exportName: 'list',
    operation: 'internalQuery',
    component: 'public.list',
    args: listArgs.args,
    returns: ginkoListResultValidator,
  },
  {
    exportName: 'search',
    operation: 'internalQuery',
    component: 'public.search',
    args: searchArgs.args,
    returns: ginkoSearchResultValidator,
  },
  {
    exportName: 'nav',
    operation: 'internalQuery',
    component: 'public.nav',
    args: navArgs.args,
    returns: ginkoNavResultValidator,
  },
  {
    exportName: 'sitemap',
    operation: 'internalQuery',
    component: 'public.sitemap',
    args: sitemapArgs.args,
    returns: ginkoSitemapResultValidator,
  },
  {
    exportName: 'explainPublicVisibility',
    operation: 'internalQuery',
    component: 'diagnostics.explainPublicVisibility',
    args: explainPublicVisibilityArgs.args,
    returns: ginkoPublicVisibilityExplanationValidator,
  },
  {
    exportName: 'listEntries',
    operation: 'internalQuery',
    component: 'editor.listEntries',
    args: listEntriesArgs.args,
    returns: v.array(entryListItemValidator),
  },
  {
    exportName: 'getEntry',
    operation: 'internalQuery',
    component: 'editor.getEntry',
    args: getEntryArgs.args,
    returns: v.union(v.null(), studioEntryValidator),
  },
  {
    exportName: 'previewArchiveEntryOperation',
    operation: 'internalMutation',
    component: 'editor.previewArchiveEntryOperation',
    args: archiveEntryArgs.args,
    returns: operationPreviewValidator(),
  },
  {
    exportName: 'previewDeleteEntryOperation',
    operation: 'internalMutation',
    component: 'editor.previewDeleteEntryOperation',
    args: deleteEntryArgs.args,
    returns: operationPreviewValidator(),
  },
  {
    exportName: 'previewUnpublishEntryOperation',
    operation: 'internalMutation',
    component: 'editor.previewUnpublishEntryOperation',
    args: unpublishEntryArgs.args,
    returns: operationPreviewValidator(),
  },
  {
    exportName: 'createEntry',
    operation: 'internalMutation',
    component: 'editor.createEntry',
    args: createEntryArgs.args,
    returns: v.string(),
  },
  {
    exportName: 'saveEntryDraft',
    operation: 'internalMutation',
    component: 'editor.saveEntryDraft',
    args: saveEntryDraftArgs.args,
    returns: draftSaveResultValidator,
  },
  {
    exportName: 'publishEntry',
    operation: 'internalMutation',
    component: 'editor.publishEntryOperationExecute',
    args: confirmedArgs(publishEntryArgs.args),
    returns: publishResultValidator,
  },
  {
    exportName: 'previewPublishEntryOperation',
    operation: 'internalMutation',
    component: 'editor.previewPublishEntryOperation',
    args: publishEntryArgs.args,
    returns: operationPreviewValidator(),
  },
  {
    exportName: 'unpublishEntry',
    operation: 'internalMutation',
    component: 'editor.unpublishEntryOperationExecute',
    args: confirmedArgs(unpublishEntryArgs.args),
    returns: v.null(),
  },
  {
    exportName: 'archiveEntry',
    operation: 'internalMutation',
    component: 'editor.archiveEntryOperationExecute',
    args: confirmedArgs(archiveEntryArgs.args),
    returns: v.null(),
  },
  {
    exportName: 'unarchiveEntry',
    operation: 'internalMutation',
    component: 'editor.unarchiveEntry',
    args: unarchiveEntryArgs.args,
    returns: v.null(),
  },
  {
    exportName: 'deleteEntry',
    operation: 'internalMutation',
    component: 'editor.deleteEntryOperationExecute',
    args: confirmedArgs(deleteEntryArgs.args),
    returns: v.null(),
  },
] as const satisfies readonly BridgeEntry[]

export const bridgeExportNames = [
  'consumeToken',
  ...entries.map((entry) => entry.exportName),
] as const

export function createMcpBridge(options: {
  component: Parameters<typeof createBridgeModule>[0]
  components: Record<string, Record<string, unknown>> & { mcpKeys: Record<string, unknown> }
  internalMutation: MutationBuilder<AnyDataModel, 'internal'>
}): BridgeModuleResult<typeof entries> & {
  consumeToken: RegisteredMutation<'internal', Record<string, unknown>, Promise<unknown>>
} {
  return {
    consumeToken: options.internalMutation({
      args: {
        hash: v.string(),
        seenAt: v.number(),
        clientIp: v.optional(v.union(v.string(), v.null())),
      },
      returns: v.union(
        v.null(),
        v.object({
          mcpKeyId: v.string(),
        }),
      ),
      handler: async (ctx, args) =>
        await ctx.runMutation(
          readBridgeMutationComponent(options.components, 'mcpKeys.consumeToken'),
          componentArgs(args) as never,
        ),
    }),
    ...createBridgeModule(options.component, options.components, entries),
  }
}
