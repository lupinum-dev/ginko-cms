import {
  getAsset as getAssetSchema,
  moveAsset as moveAssetSchema,
  resolveAssetUrls as resolveAssetUrlsSchema,
} from '@lupinum/ginko-cms-contract/convex/schemas/assets.js'
import { operations } from '@lupinum/ginko-cms-convex/operation-handles/mcp'

import { internal } from '#trellis/api'

import { projectTool, type ProjectToolDefinition } from '../_shared/project-tool-runtime'

export const getAsset: ProjectToolDefinition = projectTool({
  schema: getAssetSchema,
  call: internal.ginkoCmsMcp.getAsset,
  capability: 'readCms',
  meta: {
    name: 'get-asset',
  },
  group: 'assets',
  operation: 'query',
  respond: ({ args, result, ok, error }) => {
    if (!result) {
      return error('not_found', `Asset "${args.assetId}" not found.`)
    }
    return ok(result, `Loaded asset "${args.assetId}".`)
  },
})

export const moveAsset: ProjectToolDefinition = projectTool({
  schema: moveAssetSchema,
  capability: 'manageAssets',
  meta: {
    name: 'move-asset',
  },
  operation: operations.ginkoCms.moveAsset,
  group: 'assets',
  respond: ({ args, result, ok }) => {
    void result
    return ok({ moved: true, assetId: args.assetId, scope: args.scope }, 'Moved asset.')
  },
})

export const resolveAssetUrls: ProjectToolDefinition = projectTool({
  schema: resolveAssetUrlsSchema,
  call: internal.ginkoCmsMcp.resolveAssetUrls,
  capability: 'readCms',
  meta: {
    name: 'resolve-asset-urls',
  },
  group: 'assets',
  operation: 'query',
  respond: ({ result, ok }) => {
    const count = Object.keys(result).length
    return ok(result, `Resolved ${count} asset URL${count === 1 ? '' : 's'}.`)
  },
})
