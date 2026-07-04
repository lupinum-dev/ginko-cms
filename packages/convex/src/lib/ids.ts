import type { SystemTableNames } from 'convex/server'

import type { Id, TableNames } from '../_generated/dataModel.js'

// Inbound: string from API boundary → typed Id for internal use
export const asEntryId = (id: string) => id as Id<'entries'>
export const asCollectionId = (id: string) => id as Id<'collections'>
export const asAssetId = (id: string) => id as Id<'assets'>
export const asStorageId = (id: string) => id as Id<'_storage'>

// Outbound: typed Id → string for API boundary
export const toStringId = (id: Id<TableNames | SystemTableNames>): string => id as unknown as string
export const toOptionalStringId = (
  id: Id<TableNames | SystemTableNames> | null | undefined,
): string | null => (id ? (id as unknown as string) : null)
