import { cronJobs } from 'convex/server'

import { internal } from './_generated/api.js'

const crons = cronJobs()

crons.interval('deliver revalidation outbox', { minutes: 1 }, internal.revalidation.deliverDue, {})

crons.interval(
  'cleanup expired MCP confirmations',
  { minutes: 10 },
  internal.operations.cleanupExpiredConfirmations,
  {},
)

crons.interval(
  'cleanup storage hygiene rows',
  { hours: 1 },
  internal.storageMaintenance.cleanupStorageHygiene,
  {},
)

export default crons
