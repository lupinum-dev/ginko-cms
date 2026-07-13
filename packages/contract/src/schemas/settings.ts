import { v } from 'convex/values'

import { defineArgs } from '../args.js'
import { webhookConfigValidator } from '../validators.js'

export const updateSettings = defineArgs({
  description: 'Update CMS settings.',
  args: {
    webhooks: v.optional(v.array(webhookConfigValidator)),
  },
})
