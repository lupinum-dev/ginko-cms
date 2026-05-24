import { v } from 'convex/values'

import { defineArgs } from '../args.js'

export const revalidationStatusValidator = v.union(
  v.literal('pending'),
  v.literal('delivering'),
  v.literal('delivered'),
  v.literal('failed'),
)

export const revalidationEnvironmentValidator = v.union(
  v.literal('production'),
  v.literal('preview'),
  v.literal('development'),
)

export const listRevalidationJobs = defineArgs({
  description: 'List public cache revalidation outbox jobs.',
  args: {
    status: v.optional(revalidationStatusValidator),
    limit: v.optional(v.number()),
  },
})

export const retryRevalidationJob = defineArgs({
  description: 'Retry a failed public cache revalidation outbox job.',
  args: {
    eventId: v.string(),
  },
})

export const upsertRevalidationTarget = defineArgs({
  description: 'Create or update a public cache revalidation target.',
  args: {
    targetId: v.optional(v.string()),
    name: v.string(),
    environment: revalidationEnvironmentValidator,
    endpoint: v.string(),
    secretEnv: v.string(),
    enabled: v.boolean(),
  },
})
