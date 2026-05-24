import { z } from 'zod'

import { internal } from '#trellis/api'
import { defineMcpTool } from '#trellis/mcp/advanced'

import { failFromError, loadAgentContext, ok } from '../../_shared/agent-tools'

export default defineMcpTool({
  name: 'export-backup',
  description:
    'Export a backup artifact for one CMS entry before permanent deletion. Archive remains the preferred cleanup path.',
  inputSchema: {
    scope: z.literal('entry').describe('Only entry-scoped backup exports are exposed through MCP.'),
    entryId: z.string().describe('Entry id the backup artifact must cover.'),
  },
  handler: async (args, ctx) => {
    try {
      const context = await loadAgentContext(ctx.event, 'deleteEntries')
      const exported = await context.convex.action(internal.ginkoCmsMcp.exportBackup, {
        scope: 'entry',
        entryId: args.entryId,
      })
      return ok(
        {
          ...exported,
          scope: 'entry',
          entryId: args.entryId,
          nextAction: {
            tool: 'delete-entry',
            args: {
              entryId: args.entryId,
              exportArtifactId: exported.artifactId,
            },
          },
        },
        `Exported entry backup "${exported.artifactId}" for "${args.entryId}".`,
      )
    } catch (error) {
      return failFromError(error, 'Failed to export entry backup.')
    }
  },
})
