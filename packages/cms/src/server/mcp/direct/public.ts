import { explainPublicVisibility as explainPublicVisibilitySchema } from '@lupinum/ginko-cms-contract/convex/schemas/diagnostics.js'
import {
  page as pageSchema,
  sitemap as sitemapSchema,
} from '@lupinum/ginko-cms-contract/convex/schemas/public.js'

import { internal } from '#trellis/api'

import { projectTool, type ProjectToolDefinition } from '../_shared/project-tool-runtime'

export const page: ProjectToolDefinition = projectTool({
  schema: pageSchema,
  call: internal.ginkoCmsMcp.page,
  meta: {
    name: 'page',
  },
  group: 'public',
  respond: ({ args, result, ok, error }) => {
    const pageResult = result as { status?: string }
    if (pageResult.status === 'not-found') {
      return error(
        'not_found',
        `No published page at "${args.path}" in collection "${args.collection}".`,
      )
    }
    return ok(result, `Loaded page result "${pageResult.status ?? 'unknown'}" for "${args.path}".`)
  },
  operation: 'query',
  tags: ['read-only', 'public'],
})

export const sitemap: ProjectToolDefinition = projectTool({
  schema: sitemapSchema,
  call: internal.ginkoCmsMcp.sitemap,
  meta: {
    name: 'sitemap',
  },
  group: 'public',
  respond: ({ result, ok }) => {
    const urls = (result as { urls?: unknown[] }).urls ?? []
    return ok(result, `Loaded ${urls.length} sitemap URL${urls.length === 1 ? '' : 's'}.`)
  },
  operation: 'query',
  tags: ['read-only', 'public'],
})

export const explainPublicVisibility: ProjectToolDefinition = projectTool({
  schema: explainPublicVisibilitySchema,
  call: internal.ginkoCmsMcp.explainPublicVisibility,
  capability: 'readCms',
  meta: {
    name: 'explain-public-visibility',
    description: 'Explain why a CMS entry is or is not visible in public reads.',
  },
  group: 'public',
  respond: ({ args, result, ok, error }) => {
    if (!result || !Array.isArray(result.diagnostics) || !Array.isArray(result.locales)) {
      return error('server', 'Public visibility diagnostics returned a malformed response.', [
        {
          code: 'malformed_visibility_response',
          message: 'Expected diagnostics[] and locales[] in the visibility explanation.',
        },
      ])
    }

    const diagnostics = result.diagnostics
    const localeSuffix = args.locale ? ` for locale "${args.locale}"` : ''
    return ok(
      result,
      `Explained public visibility for "${args.collection}" entry "${args.entryId}"${localeSuffix}: ${diagnostics.length} diagnostic${diagnostics.length === 1 ? '' : 's'}.`,
    )
  },
  operation: 'query',
  tags: ['read-only', 'public', 'diagnostics'],
})
