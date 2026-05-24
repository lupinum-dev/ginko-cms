import { z } from 'zod'

import { defineMcpPrompt } from '#trellis/mcp'

export default defineMcpPrompt({
  name: 'translate-page',
  description:
    'Prepare a read-only page translation plan while preserving public route correctness.',
  inputSchema: {
    collection: z.string().describe('Route-backed collection slug'),
    entryId: z.string().describe('Entry id'),
    sourceLocale: z.string().describe('Source locale code'),
    targetLocale: z.string().describe('Target locale code'),
  },
  handler: async ({ collection, entryId, sourceLocale, targetLocale }) => {
    return [
      `Prepare translating ${collection}/${entryId} from ${sourceLocale} to ${targetLocale}.`,
      '',
      '1. Inspect collection capability and entry snapshot.',
      '2. Inspect target locale state: draft exists, published state, route/href, missing required fields, and parent route blockers.',
      '3. Compare source and target locale data.',
      '4. Check target locale public visibility diagnostics.',
      '5. Use `publish-entry` without `_confirmationToken` as operation preview context when route, SEO, sitemap, search, nav, or publish blockers matter. It does not save or publish content; allowed previews create short-lived confirmation state.',
      '6. Preserve translated slug/path rules and required localized fields.',
      '7. Produce a translation plan with exact field changes. Do not save or publish unless the user explicitly asks for a write tool and the normal confirmation flow is satisfied.',
    ].join('\n')
  },
})
