import { defineMcpPrompt } from '@nuxtjs/mcp-toolkit/server'
import { z } from 'zod'

export default defineMcpPrompt({
  name: 'publish-readiness',
  description: 'QA a content piece and prepare a safe publish preview.',
  inputSchema: {
    collection: z.string(),
    entryId: z.string(),
    locale: z.string().optional(),
  },
  handler: async ({ collection, entryId, locale }) =>
    [
      `Check publish readiness for ${collection}/${entryId}${locale ? ` (${locale})` : ''}.`,
      '',
      '1. Inspect `get-entry` with `entryId` and `get-collection`.',
      '2. Check title, description, slug/path, required fields, media alt text, body presence, sitemap/search/nav inclusion, and route collisions.',
      '3. Run `explain-public-visibility` for each target locale.',
      '4. Call `get-readiness-detail` for exact readiness. If the credential has publish permission, call `preview-publish` with the active `agentRunId`, observed draft version, entry, and target locales. Treat blockers from the operation preview as authoritative.',
      '5. If direct publish was explicitly requested and the credential has publish permission, call `publish-entry`; otherwise call `request-publish-review` with the active `agentRunId`.',
      '6. After publish or approval, verify with `page`, `list`, `search`, `nav`, and `sitemap`.',
    ].join('\n'),
})
