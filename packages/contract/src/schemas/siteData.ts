import { v } from 'convex/values'

import { defineArgs } from '../args.js'
import { jsonValueValidator, localeTextValidator } from '../validators.js'

export const getSiteDataBlock = defineArgs({
  description: 'Load one site data block.',
  args: {
    key: v.string(),
  },
})

export const createSiteDataBlock = defineArgs({
  description: 'Create a new site data block.',
  args: {
    key: v.string(),
    label: v.optional(localeTextValidator),
    schemaType: v.optional(v.string()),
    localized: v.optional(v.boolean()),
    visibility: v.optional(v.union(v.literal('private'), v.literal('public'))),
    data: v.optional(jsonValueValidator),
    locale: v.optional(v.string()),
  },
  meta: {
    key: {
      label: 'Key',
      description: 'Stable identifier for the site data block.',
      examples: ['footer', 'announcementBar'],
    },
  },
})

export const saveSiteData = defineArgs({
  description: 'Save the contents of a site data block.',
  args: {
    key: v.string(),
    data: jsonValueValidator,
    locale: v.optional(v.string()),
  },
})

export const updateSiteDataBlock = defineArgs({
  description: 'Update site data block metadata.',
  args: {
    key: v.string(),
    label: v.optional(localeTextValidator),
    schemaType: v.optional(v.string()),
    localized: v.optional(v.boolean()),
    visibility: v.optional(v.union(v.literal('private'), v.literal('public'))),
  },
})

export const deleteSiteDataBlock = defineArgs({
  description: 'Delete a site data block.',
  args: {
    key: v.string(),
  },
})
