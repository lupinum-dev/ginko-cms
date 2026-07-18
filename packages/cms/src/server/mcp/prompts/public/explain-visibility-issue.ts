import { defineMcpPrompt } from '@nuxtjs/mcp-toolkit/server'
import { z } from 'zod'

export default defineMcpPrompt({
  name: 'explain-visibility-issue',
  description: 'Guide an agent through explaining why a CMS entry is not public.',
  inputSchema: {
    collection: z.string().describe('Collection slug'),
    entryId: z.string().describe('Entry id'),
    locale: z.string().optional().describe('Optional locale code'),
  },
  handler: async ({ collection, entryId, locale }) => {
    return [
      `Explain public visibility for ${collection}/${entryId}${locale ? ` (${locale})` : ''}.`,
      '',
      '1. Read the diagnostics guide resource.',
      '2. Call `explain-public-visibility` with the collection, entry id, and locale if provided.',
      '3. If diagnostics mention collection mode, route collisions, missing fields, or parent routes, inspect the collection and entry before recommending changes.',
      '4. Explain the public impact in plain language: route, sitemap, search, nav, redirects, and the concrete fix.',
      '5. MCP cannot publish or run destructive operations. Only save draft changes when explicitly asked; send public-output changes through human review.',
    ].join('\n')
  },
})
