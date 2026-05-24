import { v } from 'convex/values'

import { defineArgs } from '../args.js'

export const validatePublicRoutes = defineArgs({
  description: 'Validate public route and rendered href claims.',
  args: {},
})

export const explainPublicVisibility = defineArgs({
  description: 'Explain why a CMS entry is or is not publicly visible.',
  args: {
    collection: v.string(),
    entryId: v.string(),
    locale: v.optional(v.string()),
  },
})

export const previewPublishImpact = defineArgs({
  description: 'Preview the public impact of publishing a CMS entry locale.',
  args: {
    collection: v.string(),
    entryId: v.string(),
    locale: v.optional(v.string()),
  },
})
