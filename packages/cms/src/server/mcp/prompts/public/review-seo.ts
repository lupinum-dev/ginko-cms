import { defineMcpPrompt } from '@nuxtjs/mcp-toolkit/server'
import { z } from 'zod'

export default defineMcpPrompt({
  name: 'review-seo',
  description: 'Review public SEO readiness for a route-backed entry.',
  inputSchema: {
    collection: z.string().describe('Collection slug'),
    entryId: z.string().describe('Entry id'),
    locale: z.string().optional().describe('Optional locale code'),
  },
  handler: async ({ collection, entryId, locale }) => {
    return [
      `Review SEO readiness for ${collection}/${entryId}${locale ? ` (${locale})` : ''}.`,
      '',
      'Use public visibility diagnostics first, then call `get-readiness-detail` for exact draft readiness. If the credential has publish permission, call `preview-publish` with the active `agentRunId` when draft SEO or route changes need a publish-impact preview. Inspect page data and translations. Report canonical route, hreflang/alternates, x-default availability, sitemap inclusion, title/description readiness, and any blockers. Publish only when explicitly requested and permitted.',
    ].join('\n')
  },
})
