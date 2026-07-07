import { defineMcpTool } from '@nuxtjs/mcp-toolkit/server'
import { z } from 'zod'

import { api } from '#convex/api'

import { failFromError, loadAgentContext, ok } from '../../_shared/agent-tools'

export default defineMcpTool({
  name: 'get-readiness-detail',
  description: 'Load exact backend readiness detail for one CMS entry.',
  inputSchema: {
    entryId: z.string().describe('Entry id to inspect.'),
  },
  group: 'content',
  handler: async (args, ctx) => {
    try {
      const context = await loadAgentContext(ctx.event, 'readCms')
      const readiness = await context.convex.query(api.ginkoCms.editor.getEntryReadinessDetail, {
        entryId: args.entryId,
      })
      return ok({ readiness }, `Loaded readiness detail for "${args.entryId}".`)
    } catch (error) {
      return failFromError(error, 'Failed to load readiness detail.')
    }
  },
})
