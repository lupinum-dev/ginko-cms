import { v } from 'convex/values'

import { defineArgs } from '../args.js'

export const explainPublicVisibility = defineArgs({
  description: 'Explain why a CMS entry is or is not publicly visible.',
  args: {
    collection: v.string(),
    entryId: v.string(),
    locale: v.optional(v.string()),
  },
})
