import { throwCmsError } from '../errors.js'
import type { StudioEntryStatus } from './studioRows.js'

export type IndexedStudioWorkState = 'changed' | 'missing_translation' | null

export type StudioSearchCursorScope = {
  collection: string
  locale: string
  status: StudioEntryStatus | null
  workState: IndexedStudioWorkState
  query: string
}

type StudioSearchCursor = StudioSearchCursorScope & {
  v: 1
  kind: 'studioSearch'
  convexCursor: string
}

export function parseStudioSearchCursor(
  value: string | null | undefined,
  expected: StudioSearchCursorScope,
) {
  if (!value) return null
  let cursor: Partial<StudioSearchCursor>
  try {
    cursor = JSON.parse(value) as Partial<StudioSearchCursor>
  } catch {
    throwCmsError('INVALID_CURSOR', 'Invalid Studio search pagination cursor.')
  }
  if (
    cursor.v !== 1 ||
    cursor.kind !== 'studioSearch' ||
    cursor.collection !== expected.collection ||
    cursor.locale !== expected.locale ||
    cursor.status !== expected.status ||
    cursor.workState !== expected.workState ||
    cursor.query !== expected.query ||
    typeof cursor.convexCursor !== 'string'
  ) {
    throwCmsError('INVALID_CURSOR', 'Invalid Studio search pagination cursor.')
  }
  return cursor.convexCursor
}

export function encodeStudioSearchCursor(scope: StudioSearchCursorScope, convexCursor: string) {
  return JSON.stringify({ v: 1, kind: 'studioSearch', ...scope, convexCursor })
}
