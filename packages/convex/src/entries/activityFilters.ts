import type { ActivityOutcome } from '@lupinum/ginko-cms-contract/shared/types.js'

import { throwCmsError } from '../errors.js'
import type { ActivityDoc, HandlerQueryCtx } from '../lib/types.js'

const ACTIVITY_DEFAULT_LIMIT = 20
const ACTIVITY_MAX_LIMIT = 50
const ACTIVITY_FILTER_MAX_LENGTH = 256

export type ActivityFilter =
  | { kind: 'content'; entryId: string }
  | { kind: 'collection'; collection: string }
  | { kind: 'actor'; appIdentityId: string }
  | { kind: 'operation'; operationKind: string }
  | { kind: 'result'; outcome: ActivityOutcome }
  | { kind: 'time'; from: number; to: number }

export type ActivityCursor = {
  v: 2
  kind: 'activity'
  scope: string
  createdAt: number
  creationTime: number
}

export type EntryActivityCursor = {
  v: 1
  kind: 'entryActivity'
  entryId: string
  createdAt: number
  creationTime: number
}

export function boundedActivityLimit(value: number | undefined): number {
  return Math.max(1, Math.min(value ?? ACTIVITY_DEFAULT_LIMIT, ACTIVITY_MAX_LIMIT))
}

export function normalizeActivityFilter(
  ctx: HandlerQueryCtx,
  filter: ActivityFilter | undefined,
): ActivityFilter | null {
  if (!filter) return null

  const exactString = (value: string, label: string) => {
    const normalized = value.trim()
    if (normalized.length === 0 || normalized.length > ACTIVITY_FILTER_MAX_LENGTH) {
      throwCmsError(
        'INVALID_ACTIVITY_FILTER',
        `${label} must be between 1 and ${ACTIVITY_FILTER_MAX_LENGTH} characters.`,
      )
    }
    return normalized
  }

  switch (filter.kind) {
    case 'content': {
      const entryId = ctx.db.normalizeId('entries', exactString(filter.entryId, 'Content ID'))
      if (!entryId) {
        throwCmsError('INVALID_ACTIVITY_FILTER', 'Content ID is invalid.')
      }
      return { kind: 'content', entryId: String(entryId) }
    }
    case 'collection':
      return {
        kind: 'collection',
        collection: exactString(filter.collection, 'Collection slug'),
      }
    case 'actor':
      return {
        kind: 'actor',
        appIdentityId: exactString(filter.appIdentityId, 'Actor ID'),
      }
    case 'operation':
      return {
        kind: 'operation',
        operationKind: exactString(filter.operationKind, 'Operation kind'),
      }
    case 'result':
      return filter
    case 'time':
      if (!Number.isFinite(filter.from) || !Number.isFinite(filter.to) || filter.from > filter.to) {
        throwCmsError(
          'INVALID_ACTIVITY_FILTER',
          'Activity time range must have finite bounds in chronological order.',
        )
      }
      return filter
  }
}

export function activityScopeKey(filter: ActivityFilter | null): string {
  if (!filter) return JSON.stringify(['all'])
  switch (filter.kind) {
    case 'content':
      return JSON.stringify(['content', filter.entryId])
    case 'collection':
      return JSON.stringify(['collection', filter.collection])
    case 'actor':
      return JSON.stringify(['actor', filter.appIdentityId])
    case 'operation':
      return JSON.stringify(['operation', filter.operationKind])
    case 'result':
      return JSON.stringify(['result', filter.outcome])
    case 'time':
      return JSON.stringify(['time', filter.from, filter.to])
  }
}

export function parseActivityCursor(
  value: string | null,
  scope: string,
  filter: ActivityFilter | null,
): ActivityCursor | null {
  if (!value) return null
  let parsed: Partial<ActivityCursor>
  try {
    parsed = JSON.parse(value) as Partial<ActivityCursor>
  } catch {
    throwCmsError('INVALID_CURSOR', 'Activity cursor is invalid.')
  }
  if (
    parsed.v !== 2 ||
    parsed.kind !== 'activity' ||
    parsed.scope !== scope ||
    typeof parsed.createdAt !== 'number' ||
    !Number.isFinite(parsed.createdAt) ||
    typeof parsed.creationTime !== 'number' ||
    !Number.isFinite(parsed.creationTime)
  ) {
    throwCmsError('INVALID_CURSOR', 'Activity cursor is invalid.')
  }
  if (filter?.kind === 'time' && (parsed.createdAt < filter.from || parsed.createdAt > filter.to)) {
    throwCmsError('INVALID_CURSOR', 'Activity cursor is outside its time filter.')
  }
  return parsed as ActivityCursor
}

export function encodeActivityCursor(row: ActivityDoc, scope: string): string {
  return JSON.stringify({
    v: 2,
    kind: 'activity',
    scope,
    createdAt: row.createdAt,
    creationTime: row._creationTime,
  } satisfies ActivityCursor)
}

export function parseEntryActivityCursor(
  value: string | null | undefined,
  entryId: string,
): EntryActivityCursor | null {
  if (!value) return null
  let parsed: Partial<EntryActivityCursor>
  try {
    parsed = JSON.parse(value) as Partial<EntryActivityCursor>
  } catch {
    throwCmsError('INVALID_CURSOR', 'Entry activity cursor is invalid.', { cursor: value })
  }
  if (
    parsed.v !== 1 ||
    parsed.kind !== 'entryActivity' ||
    parsed.entryId !== entryId ||
    typeof parsed.createdAt !== 'number' ||
    !Number.isFinite(parsed.createdAt) ||
    typeof parsed.creationTime !== 'number' ||
    !Number.isFinite(parsed.creationTime)
  ) {
    throwCmsError('INVALID_CURSOR', 'Entry activity cursor is invalid.', { cursor: value })
  }
  return parsed as EntryActivityCursor
}

export function encodeEntryActivityCursor(row: ActivityDoc, entryId: string): string {
  return JSON.stringify({
    v: 1,
    kind: 'entryActivity',
    entryId,
    createdAt: row.createdAt,
    creationTime: row._creationTime,
  } satisfies EntryActivityCursor)
}
