import {
  getAsset as getAssetSchema,
  moveAsset as moveAssetSchema,
  resolveAssetUrls as resolveAssetUrlsSchema,
} from '@lupinum/ginko-cms-contract/convex/schemas/assets.js'

import { components } from '#convex/api'

import { projectTool, type ProjectToolDefinition } from '../_shared/project-tool-runtime'

export const getAsset: ProjectToolDefinition = projectTool({
  schema: getAssetSchema,
  call: components.ginkoCms.assets.getAsset,
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
  operation: {
    execute: components.ginkoCms.assets.moveAsset,
  },
  group: 'assets',
  respond: ({ args, result, ok }) => {
    void result
    return ok({ moved: true, assetId: args.assetId, scope: args.scope }, 'Moved asset.')
  },
})

export const resolveAssetUrls: ProjectToolDefinition = projectTool({
  schema: resolveAssetUrlsSchema,
  call: components.ginkoCms.assets.resolveAssetUrls,
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
