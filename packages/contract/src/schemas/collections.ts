import { v } from 'convex/values'

import { defineArgs } from '../args.js'

export const getCollection = defineArgs({
  description: 'Load one collection definition.',
  args: {
    slug: v.string(),
  },
})
