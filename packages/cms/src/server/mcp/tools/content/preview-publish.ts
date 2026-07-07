import { defineMcpTool } from '@nuxtjs/mcp-toolkit/server'
import { z } from 'zod'

import { api } from '#convex/api'

import { failFromError, loadAgentContext, ok } from '../../_shared/agent-tools'

export default defineMcpTool({
  name: 'preview-publish',
  description:
    'Preview publish blockers, confirmation data, and public-impact changes without publishing content.',
  inputSchema: {
    agentRunId: z.string().describe('Active agent run id for this publish preview.'),
    entryId: z.string().describe('Entry id to preview.'),
    locales: z.array(z.string()).min(1).describe('Locales proposed for publish.'),
    expectedVersion: z.number().describe('Draft version observed before previewing publish.'),
    message: z.string().optional().describe('Optional publish message to bind into preview.'),
  },
  group: 'content',
  handler: async (args, ctx) => {
    try {
      const context = await loadAgentContext(ctx.event, 'publishEntries')
      const preview = await context.convex.mutation(
        api.ginkoCms.editor.mcpPreviewPublishEntryOperation,
        {
          agentRunId: args.agentRunId,
          entryId: args.entryId,
          locales: args.locales,
          expectedVersion: args.expectedVersion,
          ...(args.message ? { message: args.message } : {}),
        },
      )

      return ok(
        {
          preview,
          publicChanged: false,
        },
        `Previewed publish operation for "${args.entryId}".`,
      )
    } catch (error) {
      return failFromError(error, 'Failed to preview publish.')
    }
  },
})
