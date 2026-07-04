import { defineMcpTool } from '@nuxtjs/mcp-toolkit/server'
import { z } from 'zod'

import { components } from '#convex/api'

import { asRecord, fail, loadAgentContext, ok } from '../../_shared/agent-tools'

function hrefFor(
  path: unknown,
  routeHref: unknown,
  locale: string,
  defaultLocale: string,
): string | null {
  if (typeof routeHref === 'string' && routeHref) return routeHref
  if (typeof path !== 'string' || !path) return null
  if (!locale || locale === defaultLocale) return path
  return `/${locale}${path === '/' ? '' : path}`
}

function compactResult(value: unknown, locale: string, defaultLocale: string) {
  const result = asRecord(value)
  const data = asRecord(result.data)
  const route = asRecord(result.route)
  const seo = asRecord(result.seo)
  const href = hrefFor(route.path, route.href, locale, defaultLocale)
  return {
    id: result.id ?? result._id ?? null,
    stableId: result.stableId ?? result.revision ?? null,
    collection: result.collection ?? null,
    locale: result.locale ?? null,
    title: result.title ?? seo.title ?? null,
    description: seo.description ?? result.description ?? data.description ?? null,
    href,
    score: result.score ?? null,
    route: {
      path: route.path ?? null,
      href,
    },
  }
}

export default defineMcpTool({
  name: 'search',
  description: 'Search published CMS entries.',
  inputSchema: {
    query: z.string(),
    locale: z.string(),
    collection: z.string(),
    limit: z.number().optional(),
    cursor: z.string().nullable().optional(),
    compact: z
      .boolean()
      .optional()
      .describe('Return compact search summaries without body AST or full data payloads.'),
  },
  handler: async (args, ctx) => {
    try {
      const context = await loadAgentContext(ctx.event, 'readCms')
      const { compact, ...queryArgs } = args
      const result = await context.convex.query(components.ginkoCms.public.search, queryArgs)
      const record = asRecord(result)
      const results = Array.isArray(record.results) ? record.results : []
      if (!compact) {
        return ok(result, `Found ${results.length} result${results.length === 1 ? '' : 's'}.`)
      }
      const collectionSlug = args.collection
      const collections = await context.convex.query(
        components.ginkoCms.collections.listCollections,
        {},
      )
      const collection = (Array.isArray(collections) ? collections : []).find(
        (candidate) => candidate.slug === collectionSlug,
      )
      const defaultLocale =
        collection && Array.isArray(collection.locales) && typeof collection.locales[0] === 'string'
          ? collection.locales[0]
          : args.locale
      return ok(
        {
          ...record,
          results: results.map((result) => compactResult(result, args.locale, defaultLocale)),
          compact: true,
        },
        `Found ${results.length} compact result${results.length === 1 ? '' : 's'}.`,
      )
    } catch (error) {
      return fail(error instanceof Error ? error.message : 'Failed to search public entries.')
    }
  },
})
