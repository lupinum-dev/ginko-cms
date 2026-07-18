import type { ProjectionRecordResult, ProjectionRepairIssue } from './projections.js'

export type PhaseWork = {
  continueCursor: string
  isDone: boolean
  processed: number
  result: ProjectionRecordResult
  referencedAssetIds?: string[]
}

export type ProjectionScanTable =
  | 'entries'
  | 'entryLocaleDrafts'
  | 'entryRevisions'
  | 'draftSearchEntries'
  | 'publicEntries'
  | 'publicSearchEntries'

type ProjectionScanCursor = {
  v: 1
  kind: 'projectionScan'
  table: ProjectionScanTable
  creationTime: number
  id: string
}

export function parseProjectionScanCursor(value: string | null, table: ProjectionScanTable) {
  if (!value) return null
  try {
    const parsed = JSON.parse(value) as Partial<ProjectionScanCursor>
    if (
      parsed.v !== 1 ||
      parsed.kind !== 'projectionScan' ||
      parsed.table !== table ||
      typeof parsed.creationTime !== 'number' ||
      !Number.isFinite(parsed.creationTime) ||
      typeof parsed.id !== 'string'
    ) {
      throw new Error('invalid cursor')
    }
    return parsed as ProjectionScanCursor
  } catch {
    throw new Error('PROJECTION_REPAIR_SCAN_CURSOR_INVALID')
  }
}

export function projectionScanPage<T extends { _id: string; _creationTime: number }>(
  rows: T[],
  pageSize: number,
  table: ProjectionScanTable,
) {
  const page = rows.slice(0, pageSize)
  const last = page.at(-1)
  const isDone = rows.length <= pageSize
  return {
    page,
    isDone,
    continueCursor:
      isDone || !last
        ? ''
        : JSON.stringify({
            v: 1,
            kind: 'projectionScan',
            table,
            creationTime: last._creationTime,
            id: String(last._id),
          } satisfies ProjectionScanCursor),
  }
}

export function emptyProjectionResult(): ProjectionRecordResult {
  return {
    repairedPublicRows: 0,
    repairedDraftSearchRows: 0,
    repairedAssetRefSources: 0,
    deletedOrphans: 0,
    issues: [],
  }
}

export function mergeResult(target: ProjectionRecordResult, next: ProjectionRecordResult) {
  target.repairedPublicRows += next.repairedPublicRows
  target.repairedDraftSearchRows += next.repairedDraftSearchRows
  target.repairedAssetRefSources += next.repairedAssetRefSources
  target.deletedOrphans += next.deletedOrphans
  target.issues.push(...next.issues)
}

export function issueResult(issues: ProjectionRepairIssue[]): ProjectionRecordResult {
  return { ...emptyProjectionResult(), issues }
}
