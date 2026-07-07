import { defineMcpTool } from '@nuxtjs/mcp-toolkit/server'
import { z } from 'zod'

import { api } from '#convex/api'

import { failFromError, loadAgentContext, ok } from '../../_shared/agent-tools'

export default defineMcpTool({
  name: 'restore-entry',
  description: 'Restore an archived entry to draft state through the CMS operation layer.',
  inputSchema: {
    agentRunId: z.string().describe('Active agent run id for this restore.'),
    entryId: z.string().describe('Entry id to restore.'),
  },
  group: 'content',
  handler: async (args, ctx) => {
    try {
      const context = await loadAgentContext(ctx.event, 'archiveEntries')
      await context.convex.mutation(api.ginkoCms.editor.mcpRestoreEntry, args)
      return ok({ restored: true, entryId: args.entryId }, `Restored entry "${args.entryId}".`)
    } catch (error) {
      return failFromError(error, 'Failed to restore entry.')
    }
  },
})
