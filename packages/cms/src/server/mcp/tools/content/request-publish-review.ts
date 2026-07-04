import { defineMcpTool } from '@nuxtjs/mcp-toolkit/server'
import { z } from 'zod'

import { components } from '#convex/api'

import { asRecord, fail, failFromError, loadAgentContext, ok } from '../../_shared/agent-tools'

type JsonRecord = Record<string, unknown>

function versionHash(input: { entryId: string; expectedVersion: number; locales: string[] }) {
  return JSON.stringify({
    entryId: input.entryId,
    expectedVersion: input.expectedVersion,
    locales: [...input.locales].sort(),
  })
}

function compactPreview(previews: JsonRecord[]) {
  return {
    kind: 'publish-impact',
    status: previews.some((preview) =>
      ['blocked', 'not_publishable'].includes(String(preview.status ?? '')),
    )
      ? 'blocked'
      : 'ready',
    locales: previews.flatMap((preview) => {
      const locales = preview.locales
      return Array.isArray(locales) ? locales : []
    }),
    blockingDiagnostics: previews.flatMap((preview) => {
      const diagnostics = preview.blockingDiagnostics
      return Array.isArray(diagnostics) ? diagnostics : []
    }),
    warnings: previews.flatMap((preview) => {
      const warnings = preview.warnings
      return Array.isArray(warnings) ? warnings : []
    }),
    changes: previews.flatMap((preview) => {
      const changes = preview.changes
      return Array.isArray(changes) ? changes : []
    }),
    events: previews.flatMap((preview) => {
      const events = preview.events
      return Array.isArray(events) ? events : []
    }),
  }
}

export default defineMcpTool({
  name: 'request-publish-review',
  description:
    'Create a human review request for publishing an entry without changing public output.',
  inputSchema: {
    agentRunId: z.string().describe('Active agent run id that is requesting review.'),
    collection: z.string().describe('Collection slug for publish-impact diagnostics.'),
    entryId: z.string().describe('Entry id to publish after approval.'),
    locales: z.array(z.string()).min(1).describe('Locales proposed for publish.'),
    expectedVersion: z.number().describe('Draft version observed before requesting review.'),
    message: z.string().optional().describe('Optional publish message for the reviewer.'),
    title: z.string().optional().describe('Optional review request title.'),
    summary: z.string().optional().describe('Optional human-readable request summary.'),
  },
  group: 'content',
  handler: async (args, ctx) => {
    try {
      const context = await loadAgentContext(ctx.event, 'editEntries')
      const entry = asRecord(
        await context.convex.query(components.ginkoCms.editor.getEntry, {
          id: args.entryId,
        }),
      )
      if (!entry || Object.keys(entry).length === 0) {
        return fail(
          `Entry "${args.entryId}" not found.`,
          { entryId: args.entryId },
          { category: 'not_found', code: 'ENTRY_NOT_FOUND' },
        )
      }
      if (entry.draftVersion !== args.expectedVersion) {
        return fail(
          'This entry changed in another session. Reload and request review again.',
          {
            entryId: args.entryId,
            expectedVersion: args.expectedVersion,
            actualVersion: entry.draftVersion,
          },
          { category: 'conflict', code: 'ENTRY_CONCURRENT_EDIT' },
        )
      }

      const previews = await Promise.all(
        args.locales.map(async (locale) =>
          asRecord(
            await context.convex.query(components.ginkoCms.diagnostics.previewPublishImpact, {
              collection: args.collection,
              entryId: args.entryId,
              locale,
            }),
          ),
        ),
      )
      const preview = compactPreview(previews)
      if (preview.status !== 'ready') {
        return fail(
          'Publish review was not created because the requested publish is currently blocked.',
          { preview },
          { category: 'conflict', code: 'PUBLISH_REVIEW_BLOCKED' },
        )
      }

      const review = await context.convex.mutation(
        components.ginkoCms.reviewRequests.requestPublishReview,
        {
          agentRunId: args.agentRunId,
          entryId: args.entryId,
          locales: args.locales,
          expectedVersion: args.expectedVersion,
          ...(args.message ? { message: args.message } : {}),
          title: args.title ?? `Publish ${args.entryId}`,
          summary:
            args.summary ??
            `Publish ${args.locales.join(', ')} for entry "${args.entryId}" after human review.`,
          preview,
          versionHash: versionHash({
            entryId: args.entryId,
            expectedVersion: args.expectedVersion,
            locales: args.locales,
          }),
        },
      )

      return ok(
        {
          reviewRequest: review,
          publicChanged: false,
        },
        `Created publish review request for "${args.entryId}".`,
      )
    } catch (error) {
      return failFromError(error, 'Failed to request publish review.')
    }
  },
})
