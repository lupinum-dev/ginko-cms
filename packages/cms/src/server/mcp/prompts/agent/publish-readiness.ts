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
      '4. Call `publish-entry` once without `_confirmationToken` to obtain the preview.confirmation.token. Treat allowed, blockers, warnings, and effects in that preview as authoritative.',
      '5. Execute `publish-entry` only after explicit user confirmation, repeating the same args with the matching token.',
      '6. After execution, verify with `page`, `list`, `search`, `nav`, and `sitemap`.',
    ].join('\n'),
})
