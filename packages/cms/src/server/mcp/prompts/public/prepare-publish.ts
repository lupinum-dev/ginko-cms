import { z } from 'zod'

import { defineMcpPrompt } from '#trellis/mcp'

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
      '3. Call `publish-entry` without `_confirmationToken` to obtain the Trellis operation preview; treat blockers as authoritative.',
      '4. Summarize route, SEO, sitemap, search, nav, redirects, cache tags, webhook events, and blocking diagnostics from the preview.',
      '5. Ask the user to confirm the specific preview result before publishing; if the draft changes, rerun preview first.',
      '6. Execute `publish-entry` only by repeating the same args with the matching token. Previewing never publishes.',
    ].join('\n')
  },
})
