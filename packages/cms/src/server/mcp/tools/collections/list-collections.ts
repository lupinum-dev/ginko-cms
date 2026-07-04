import { defineMcpTool } from '@nuxtjs/mcp-toolkit/server'

import { components } from '#convex/api'

import { failFromError, loadAgentContext, ok } from '../../_shared/agent-tools'

const tool = defineMcpTool({
  name: 'list-collections',
  description: 'List CMS collections.',
  inputSchema: {},
  group: 'collections',
  handler: async (_args, ctx) => {
    try {
      const context = await loadAgentContext(ctx.event, 'readCms')
      const collections = await context.convex.query(
        components.ginkoCms.collections.listCollections,
        {},
      )
      const count = Array.isArray(collections) ? collections.length : 0
      return ok({ collections }, `Found ${count} collection${count === 1 ? '' : 's'}.`)
    } catch (error) {
      return failFromError(error, 'Failed to list collections.')
    }
  },
})

export default tool
