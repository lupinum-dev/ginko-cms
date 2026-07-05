import { defineMcpTool } from '@nuxtjs/mcp-toolkit/server'
import { z } from 'zod'

import { api } from '#convex/api'

import { asRecord, fail, failFromError, loadAgentContext, ok } from '../../_shared/agent-tools'

type JsonRecord = Record<string, unknown>

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
  name: 'preview-publish',
  description: 'Preview publish blockers and public-impact changes without publishing content.',
  inputSchema: {
    collection: z.string().describe('Collection slug for publish-impact diagnostics.'),
    entryId: z.string().describe('Entry id to preview.'),
    locales: z.array(z.string()).min(1).describe('Locales proposed for publish.'),
    expectedVersion: z.number().describe('Draft version observed before previewing publish.'),
  },
  group: 'content',
  handler: async (args, ctx) => {
    try {
      const context = await loadAgentContext(ctx.event, 'editEntries')
      const entry = asRecord(
        await context.convex.query(api.ginkoCms.editor.getEntry, {
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
          'This entry changed in another session. Reload and preview publish again.',
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
            await context.convex.query(api.ginkoCms.diagnostics.previewPublishImpact, {
              collection: args.collection,
              entryId: args.entryId,
              locale,
            }),
          ),
        ),
      )

      return ok(
        {
          preview: compactPreview(previews),
          publicChanged: false,
        },
        `Previewed publish impact for "${args.entryId}".`,
      )
    } catch (error) {
      return failFromError(error, 'Failed to preview publish.')
    }
  },
})
