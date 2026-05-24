import { v } from 'convex/values'

import { defineArgs } from '../args.js'
import { collectionDefinitionValidator, jsonObjectValidator } from '../validators.js'

const importArgs = {
  source: v.optional(
    v.object({
      provider: v.optional(v.string()),
      root: v.optional(v.string()),
      ref: v.optional(v.string()),
    }),
  ),
  collections: v.array(collectionDefinitionValidator),
  publish: v.optional(v.boolean()),
  publishLocales: v.optional(v.array(v.string())),
  allowUnresolvedAssets: v.optional(v.boolean()),
  assets: v.optional(
    v.array(
      v.object({
        sourcePath: v.string(),
        referencedBy: v.array(v.string()),
      }),
    ),
  ),
  entries: v.optional(
    v.array(
      v.object({
        collection: v.string(),
        stableId: v.string(),
        parentStableId: v.optional(v.union(v.string(), v.null())),
        locale: v.string(),
        routePath: v.string(),
        slug: v.string(),
        orderRank: v.optional(v.union(v.string(), v.null())),
        shared: jsonObjectValidator,
        localized: jsonObjectValidator,
        bodyMdc: v.optional(v.string()),
        seo: v.optional(jsonObjectValidator),
        public: v.optional(
          v.object({
            sitemap: v.optional(v.boolean()),
            search: v.optional(v.boolean()),
            navigation: v.optional(v.boolean()),
          }),
        ),
      }),
    ),
  ),
}

export const previewImport = defineArgs({
  description:
    'Preview importing filesystem content into existing code-defined collection contracts.',
  args: importArgs,
})

export const applyImport = defineArgs({
  description: 'Apply imported filesystem content to existing code-defined collection contracts.',
  args: importArgs,
})

export const listImportRuns = defineArgs({
  description: 'List recent filesystem import preview/apply reports.',
  args: {
    importRunId: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
})
