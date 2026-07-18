import type { SystemTableNames } from 'convex/server'

import type { Id, TableNames } from '../_generated/dataModel.js'
import { throwCmsError } from '../errors.js'
import type { QueryOrMutationCtx } from './types.js'

// Inbound IDs are runtime-validated at the API boundary. A TypeScript cast is
// not evidence that a user-controlled string belongs to the entries table.
export function asEntryId(ctx: QueryOrMutationCtx, value: string): Id<'entries'> {
  const id = ctx.db.normalizeId('entries', value)
  if (!id) throwCmsError('ENTRY_NOT_FOUND', 'Entry not found.', { entryId: value })
  return id
}

// Outbound: typed Id → string for API boundary
export const toStringId = (id: Id<TableNames | SystemTableNames>): string => String(id)
export const toOptionalStringId = (
  id: Id<TableNames | SystemTableNames> | null | undefined,
): string | null => (id ? String(id) : null)
