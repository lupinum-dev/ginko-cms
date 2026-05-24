import { z } from 'zod'

import { internal } from '#trellis/api'
import { defineMcpTool } from '#trellis/mcp/advanced'

import { fail, failFromError, loadAgentContext, ok } from '../../_shared/agent-tools'

export default defineMcpTool({
  name: 'get-entry',
  description: 'Load one CMS entry.',
  inputSchema: {
    entryId: z.string().describe('Entry id to load.'),
    locale: z.string().optional(),
    compact: z
      .boolean()
      .optional()
      .describe('Return a compact editorial summary instead of the full Studio entry payload.'),
  },
  handler: async (args, ctx) => {
    try {
      const entryId = args.entryId
      const context = await loadAgentContext(ctx.event, 'readCms')
      const entry = await context.convex.query(internal.ginkoCmsMcp.getEntry, {
        id: entryId,
        ...(args.locale ? { locale: args.locale } : {}),
      })
      if (!entry) {
        return fail(
          `Entry "${entryId}" not found.`,
          { entryId },
          {
            category: 'not_found',
            code: 'ENTRY_NOT_FOUND',
          },
        )
      }
      if (!args.compact) return ok(entry, `Loaded entry "${entryId}".`)

      const record = entry as Record<string, unknown>
      const locales = Array.isArray(record.locales)
        ? record.locales.map((item) => {
            const localeRecord =
              item && typeof item === 'object' && !Array.isArray(item)
                ? (item as Record<string, unknown>)
                : {}
            return {
              locale: localeRecord.locale,
              status: localeRecord.status,
              draftSlug: localeRecord.draftSlug,
              draftPath: localeRecord.draftPath,
              publishedPath: localeRecord.publishedPath,
              title: localeRecord.title,
            }
          })
        : []
      return ok(
        {
          entryId: record._id ?? entryId,
          stableId: record.stableId ?? null,
          collection: record.collection,
          status: record.status,
          draftVersion: record.draftVersion,
          dirtyLocales: record.dirtyLocales ?? [],
          locales,
          shared: record.shared,
        },
        `Loaded compact entry "${entryId}".`,
      )
    } catch (error) {
      return failFromError(error, 'Failed to load entry.')
    }
  },
})
