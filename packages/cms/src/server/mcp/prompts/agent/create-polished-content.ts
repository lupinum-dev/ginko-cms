import { defineMcpPrompt } from '@nuxtjs/mcp-toolkit/server'
import { z } from 'zod'

export default defineMcpPrompt({
  name: 'create-polished-content',
  description: 'Create, enrich, QA, and prepare a content entry using canonical CMS tools.',
  inputSchema: {
    collection: z.string(),
    locale: z.string().optional(),
    brief: z.string(),
  },
  handler: async ({ collection, locale, brief }) =>
    [
      `Create polished content for ${collection}${locale ? ` (${locale})` : ''}.`,
      '',
      `Brief: ${brief}`,
      '',
      '1. Read `app://ginko-cms/agent-authoring-guide` and inspect `get-collection`.',
      '2. Create the entry with `create-entry`, then write draft content with `save-entry-draft`.',
      '3. Reuse known existing assets with `get-asset` and `resolve-asset-urls`; place asset ids with `save-entry-draft`.',
      '4. Inspect `get-entry` and use `page`, `list`, `search`, `nav`, `sitemap`, and `explain-public-visibility` for readiness checks.',
      '5. To prepare publishing, call `get-readiness-detail`, then `preview-publish` and `request-publish-review` with the active `agentRunId`, observed draft version, entry, and target locales. Use `get-review-status` to follow the human decision.',
      '6. After a human publisher approves and publishes, verify public output with `page`, `list`, `search`, `nav`, and `sitemap`.',
    ].join('\n'),
})
