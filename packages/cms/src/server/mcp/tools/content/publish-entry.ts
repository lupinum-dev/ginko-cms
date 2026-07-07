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
  name: 'publish-entry',
  description:
    'Publish entry locales through the canonical CMS publish operation when the agent has publish permission.',
  inputSchema: {
    agentRunId: z.string().describe('Active agent run id for this publish.'),
    entryId: z.string().describe('Entry id to publish.'),
    locales: z.array(z.string()).min(1).describe('Locales to publish.'),
    expectedVersion: z.number().describe('Draft version observed before publishing.'),
    message: z.string().optional().describe('Optional publish message.'),
  },
  group: 'content',
  handler: async (args, ctx) => {
    try {
      const context = await loadAgentContext(ctx.event, 'publishEntries')
      const operationArgs = {
        agentRunId: args.agentRunId,
        entryId: args.entryId,
        locales: args.locales,
        expectedVersion: args.expectedVersion,
        ...(args.message ? { message: args.message } : {}),
      }
      const preview = await context.convex.mutation(
        api.ginkoCms.editor.mcpPreviewPublishEntryOperation,
        operationArgs,
      )
      const previewRecord = asRecord(preview)
      if (previewRecord.allowed === false) {
        return fail(
          'Publish is blocked. Resolve the preview blockers before publishing.',
          { preview },
          { category: 'validation', code: 'PUBLISH_BLOCKED' },
        )
      }

      const confirmationToken = confirmationTokenFromPreview(preview)
      if (!confirmationToken) {
        return fail(
          'Publish preview did not return a confirmation token.',
          { preview },
          { category: 'conflict', code: 'PUBLISH_CONFIRMATION_MISSING' },
        )
      }

      const publish = await context.convex.mutation(api.ginkoCms.editor.mcpPublishEntry, {
        ...operationArgs,
        _confirmationToken: confirmationToken,
      })

      return ok(
        {
          preview,
          publish,
          publicChanged: true,
        },
        `Published "${args.entryId}".`,
      )
    } catch (error) {
      return failFromError(error, 'Failed to publish entry.')
    }
  },
})
