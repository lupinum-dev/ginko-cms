import { cronJobs } from 'convex/server'

import { internal } from './_generated/api.js'

const crons = cronJobs()
const internalApi = internal as typeof internal & {
  operations: {
    cleanupExpiredConfirmations: unknown
  }
  revalidation: {
    deliverDue: unknown
  }
  storageMaintenance: {
    cleanupStorageHygiene: unknown
    reconcileStorageOrphans: unknown
  }
}

crons.interval(
  'deliver revalidation outbox',
  { minutes: 1 },
  internalApi.revalidation.deliverDue as never,
  {},
)

crons.interval(
  'reconcile orphaned CMS storage',
  { hours: 1 },
  internalApi.storageMaintenance.reconcileStorageOrphans as never,
  {},
)

crons.interval(
  'cleanup expired MCP confirmations',
  { minutes: 10 },
  internalApi.operations.cleanupExpiredConfirmations as never,
  {},
)

crons.interval(
  'cleanup storage hygiene rows',
  { hours: 1 },
  internalApi.storageMaintenance.cleanupStorageHygiene as never,
  {},
)

export default crons
