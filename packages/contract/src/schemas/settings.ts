import { v } from 'convex/values'

import { defineArgs } from '../args.js'
import { localeConfigValidator, webhookConfigValidator } from '../validators.js'

export const updateSettings = defineArgs({
  description: 'Update CMS settings.',
  args: {
    locales: v.optional(v.array(localeConfigValidator)),
    webhooks: v.optional(v.array(webhookConfigValidator)),
  },
  meta: {
    locales: {
      label: 'Locales',
      description: 'Locale configuration for the CMS.',
      examples: [[{ code: 'en', label: 'English', isDefault: true }]],
    },
  },
})
