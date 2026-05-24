import { v } from 'convex/values'

import { defineArgs } from '../args.js'
import { collectionDefinitionValidator } from '../validators.js'

export const getCollection = defineArgs({
  description: 'Load one collection definition.',
  args: {
    slug: v.string(),
  },
})

export const installCollectionContracts = defineArgs({
  description:
    'Install host code-defined collection contract snapshots. Intended for admin/deploy-key CLI calls, not browser or Studio execution.',
  args: {
    collections: v.array(collectionDefinitionValidator),
  },
})
