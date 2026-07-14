import { defineMcpTool } from '@nuxtjs/mcp-toolkit/server'
import { z } from 'zod'

import { api } from '#convex/api'

import { fail, failFromError, loadAgentContext, ok } from '../_shared/agent-tools'

const localeFallback = z.union([z.boolean(), z.array(z.string())]).optional()

export const page = defineMcpTool({
  name: 'page',
  description: 'Load a published CMS page with the locked public content contract.',
  inputSchema: {
    collection: z.string(),
    locale: z.string(),
    path: z.string().optional(),
    ref: z.string().optional(),
    fallback: localeFallback,
  },
  group: 'public',
  tags: ['read-only', 'public'],
  handler: async (args, ctx) => {
    try {
      const context = await loadAgentContext(ctx.event, 'readCms')
      const result = await context.convex.query(api.ginkoCms.public.page, args)
      const pageResult = result as { status?: string }
      if (pageResult.status === 'not-found') {
        return fail(
          `No published page at "${args.path}" in collection "${args.collection}".`,
          { collection: args.collection, path: args.path },
          { category: 'not_found', code: 'PAGE_NOT_FOUND' },
        )
      }
      return ok(
        result,
        `Loaded page result "${pageResult.status ?? 'unknown'}" for "${args.path}".`,
      )
    } catch (error) {
      return failFromError(error, 'Failed to load page.')
    }
  },
})

export const sitemap = defineMcpTool({
  name: 'sitemap',
  description: 'Load public sitemap entries.',
  inputSchema: {
    collection: z.string(),
    locale: z.string(),
    limit: z.number().optional(),
    cursor: z.union([z.string(), z.null()]).optional(),
  },
  group: 'public',
  tags: ['read-only', 'public'],
  handler: async (args, ctx) => {
    try {
      const context = await loadAgentContext(ctx.event, 'readCms')
      const result = await context.convex.query(api.ginkoCms.public.sitemap, args)
      const urls = (result as { urls?: unknown[] }).urls ?? []
      return ok(result, `Loaded ${urls.length} sitemap URL${urls.length === 1 ? '' : 's'}.`)
    } catch (error) {
      return failFromError(error, 'Failed to load sitemap.')
    }
  },
})

export const explainPublicVisibility = defineMcpTool({
  name: 'explain-public-visibility',
  description: 'Explain why a CMS entry is or is not publicly visible.',
  inputSchema: {
    collection: z.string(),
    entryId: z.string(),
    locale: z.string().optional(),
  },
  group: 'public',
  tags: ['read-only', 'public', 'diagnostics'],
  handler: async (args, ctx) => {
    try {
      const context = await loadAgentContext(ctx.event, 'readCms')
      const result = await context.convex.query(
        api.ginkoCms.diagnostics.explainPublicVisibility,
        args,
      )
      if (!result || !Array.isArray(result.diagnostics) || !Array.isArray(result.locales)) {
        return fail(
          'Public visibility diagnostics returned a malformed response.',
          {
            issues: [
              {
                code: 'malformed_visibility_response',
                message: 'Expected diagnostics[] and locales[] in the visibility explanation.',
              },
            ],
          },
          { category: 'server', code: 'MALFORMED_VISIBILITY_RESPONSE' },
        )
      }

      const diagnostics = result.diagnostics
      const localeSuffix = args.locale ? ` for locale "${args.locale}"` : ''
      return ok(
        result,
        `Explained public visibility for "${args.collection}" entry "${args.entryId}"${localeSuffix}: ${diagnostics.length} diagnostic${diagnostics.length === 1 ? '' : 's'}.`,
      )
    } catch (error) {
      return failFromError(error, 'Failed to explain public visibility.')
    }
  },
})
