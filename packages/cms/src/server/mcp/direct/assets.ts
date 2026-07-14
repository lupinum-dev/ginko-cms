import { defineMcpTool } from '@nuxtjs/mcp-toolkit/server'
import { z } from 'zod'

import { api } from '#convex/api'

import { fail, failFromError, loadAgentContext, ok } from '../_shared/agent-tools'

export const getAsset = defineMcpTool({
  name: 'get-asset',
  description: 'Load one CMS asset with ownership and usage metadata.',
  inputSchema: {
    assetId: z.string(),
  },
  group: 'assets',
  handler: async (args, ctx) => {
    try {
      const context = await loadAgentContext(ctx.event, 'readCms')
      const result = await context.convex.query(api.ginkoCms.assets.getAsset, args)
      if (!result) {
        return fail(
          `Asset "${args.assetId}" not found.`,
          { assetId: args.assetId },
          {
            category: 'not_found',
            code: 'ASSET_NOT_FOUND',
          },
        )
      }
      return ok(result, `Loaded asset "${args.assetId}".`)
    } catch (error) {
      return failFromError(error, 'Failed to load asset.')
    }
  },
})

export const resolveAssetUrls = defineMcpTool({
  name: 'resolve-asset-urls',
  description: 'Resolve CMS asset ids to storage URLs.',
  inputSchema: {
    assetIds: z.array(z.string()),
  },
  group: 'assets',
  handler: async (args, ctx) => {
    try {
      const context = await loadAgentContext(ctx.event, 'readCms')
      const result = await context.convex.query(api.ginkoCms.assets.resolveAssetUrls, args)
      const count = Object.keys(result).length
      return ok(result, `Resolved ${count} asset URL${count === 1 ? '' : 's'}.`)
    } catch (error) {
      return failFromError(error, 'Failed to resolve asset URLs.')
    }
  },
})
