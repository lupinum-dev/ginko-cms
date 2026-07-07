import { defineMcpTool } from '@nuxtjs/mcp-toolkit/server'
import { z } from 'zod'

import { api } from '#convex/api'

import { asRecord, fail, failFromError, loadAgentContext, ok } from '../../_shared/agent-tools'

function confirmationTokenFromPreview(preview: unknown): string | null {
  const record = asRecord(preview)
  const confirmation = asRecord(record.confirmation)
  const token = confirmation.token
  return typeof token === 'string' && token ? token : null
}

export default defineMcpTool({
  name: 'archive-entry',
  description: 'Archive an entry through the canonical archive operation.',
  inputSchema: {
    agentRunId: z.string().describe('Active agent run id for this archive.'),
    entryId: z.string().describe('Entry id to archive.'),
  },
  group: 'content',
  handler: async (args, ctx) => {
    try {
      const context = await loadAgentContext(ctx.event, 'archiveEntries')
      const operationArgs = {
        agentRunId: args.agentRunId,
        entryId: args.entryId,
      }
      const preview = await context.convex.mutation(
        api.ginkoCms.editor.mcpPreviewArchiveEntryOperation,
        operationArgs,
      )
      const previewRecord = asRecord(preview)
      const blockers = Array.isArray(previewRecord.blockers) ? previewRecord.blockers : []
      if (previewRecord.allowed === false || blockers.length > 0) {
        return fail(
          'Archive is blocked. Resolve the preview blockers before archiving.',
          { entryId: args.entryId, preview },
          { category: 'conflict', code: 'ARCHIVE_BLOCKED' },
        )
      }
      const confirmationToken = confirmationTokenFromPreview(preview)
      if (!confirmationToken) {
        return fail(
          'Archive preview did not return a confirmation token.',
          { entryId: args.entryId, preview },
          { category: 'conflict', code: 'ARCHIVE_CONFIRMATION_MISSING' },
        )
      }
      const archive = await context.convex.mutation(api.ginkoCms.editor.mcpArchiveEntry, {
        ...operationArgs,
        _confirmationToken: confirmationToken,
      })
      return ok(
        {
          preview,
          archive,
          publicChanged: true,
        },
        `Archived entry "${args.entryId}".`,
      )
    } catch (error) {
      return failFromError(error, 'Failed to archive entry.')
    }
  },
})
