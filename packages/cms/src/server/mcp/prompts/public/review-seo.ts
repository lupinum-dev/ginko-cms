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
      'Use public visibility diagnostics first, then call `publish-entry` without `_confirmationToken` if draft SEO or route changes need an operation preview. Inspect page data and translations. Report canonical route, hreflang/alternates, x-default availability, sitemap inclusion, title/description readiness, and any blockers. Do not execute publish from this prompt.',
    ].join('\n')
  },
})
