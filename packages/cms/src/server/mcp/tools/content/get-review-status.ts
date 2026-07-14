import { defineMcpTool } from '@nuxtjs/mcp-toolkit/server'
import { z } from 'zod'

import { api } from '#convex/api'

import { failFromError, loadAgentContext, ok } from '../../_shared/agent-tools'

export default defineMcpTool({
  name: 'get-review-status',
  description: 'Inspect a publish review request owned by the current MCP credential.',
  inputSchema: { reviewRequestId: z.string() },
  group: 'content',
  handler: async (args, ctx) => {
    try {
      const context = await loadAgentContext(ctx.event, 'readCms')
      const review = await context.convex.query(
        api.ginkoCms.reviewRequests.getOwnReviewRequest,
        args,
      )
      return ok(review, `Loaded review request "${args.reviewRequestId}".`)
    } catch (error) {
      return failFromError(error, 'Failed to load review request.')
    }
  },
})
