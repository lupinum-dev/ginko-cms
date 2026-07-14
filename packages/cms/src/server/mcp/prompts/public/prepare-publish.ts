import { defineMcpPrompt } from '@nuxtjs/mcp-toolkit/server'
import { z } from 'zod'

export default defineMcpPrompt({
  name: 'prepare-publish',
  description: 'Plan a safe localized publish using diagnostics before side effects.',
  inputSchema: {
    collection: z.string().describe('Collection slug'),
    entryId: z.string().describe('Entry id'),
    locale: z.string().describe('Locale to publish'),
  },
  handler: async ({ collection, entryId, locale }) => {
    return [
      `Prepare publishing ${collection}/${entryId} for locale ${locale}.`,
      '',
      '1. Inspect the collection capability and entry snapshot; first determine whether the collection is route-backed or data-only.',
      '2. Run `explain-public-visibility` for the target locale.',
      '3. Call `get-readiness-detail` for exact readiness, then call `preview-publish` with the active `agentRunId`, observed draft version, entry, and target locale; treat blockers as authoritative.',
      '4. Summarize route, SEO, sitemap, search, nav, redirects, cache tags, webhook events, and blocking diagnostics from readiness and, when available, the operation preview.',
      '5. Call `request-publish-review` with the active `agentRunId`, then use `get-review-status` to follow the human decision.',
      '6. If the draft changes, rerun readiness and any publish preview before publishing or requesting review.',
    ].join('\n')
  },
})
