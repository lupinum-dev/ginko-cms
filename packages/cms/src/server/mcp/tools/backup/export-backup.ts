import { defineMcpTool } from '@nuxtjs/mcp-toolkit/server'
import { z } from 'zod'

import { api } from '#convex/api'

import { failFromError, loadAgentContext, ok } from '../../_shared/agent-tools'

export default defineMcpTool({
  name: 'export-backup',
  description:
    'Export a backup artifact for one CMS entry before permanent deletion. Archive remains the preferred cleanup path.',
  inputSchema: {
    agentRunId: z.string().describe('Active agent run id for this write.'),
    scope: z.literal('entry').describe('Only entry-scoped backup exports are exposed through MCP.'),
    entryId: z.string().describe('Entry id the backup artifact must cover.'),
  },
  handler: async (args, ctx) => {
    try {
      const context = await loadAgentContext(ctx.event, 'deleteEntries')
      const exported = await context.convex.action(api.ginkoCms.backup.mcpExportBackup, {
        agentRunId: args.agentRunId,
        scope: 'entry',
        entryId: args.entryId,
      })
      return ok(
        {
          ...exported,
          scope: 'entry',
          entryId: args.entryId,
        },
        `Exported entry backup "${exported.artifactId}" for "${args.entryId}".`,
      )
    } catch (error) {
      return failFromError(error, 'Failed to export entry backup.')
    }
  },
})
