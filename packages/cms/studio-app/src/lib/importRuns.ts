export type ImportRun = {
  _id: string
  importRunId: string
  kind: 'preview' | 'apply'
  status?: string
  publish?: boolean
  publishLocales?: string[]
  collectionSlugs?: string[]
  collectionCount?: number
  entryCount?: number
  assetCount?: number
  source?: Record<string, unknown>
  summary?: Record<string, unknown>
  result?: Record<string, unknown>
  createdBy?: string
  createdAt?: number
}

type JsonRecord = Record<string, unknown>

function numberFrom(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function asRecord(value: unknown): JsonRecord | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as JsonRecord)
    : null
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function asStringArray(value: unknown): string[] {
  return asArray(value).filter((item): item is string => typeof item === 'string')
}

export function importRunStatusVariant(status?: string) {
  if (status === 'blocked' || status === 'failed') return 'destructive'
  if (status === 'published' || status === 'applied' || status === 'previewed') return 'default'
  return 'outline'
}

export function formatImportIssue(issue: unknown): string {
  const record = asRecord(issue)
  if (!record) return String(issue)
  const code = typeof record.code === 'string' ? record.code : null
  const kind = typeof record.kind === 'string' ? record.kind : null
  const message = typeof record.message === 'string' ? record.message : null
  const entry =
    typeof record.entryKey === 'string'
      ? record.entryKey
      : typeof record.entry === 'string'
        ? record.entry
        : null
  return [code ?? kind, entry, message].filter(Boolean).join(' · ') || JSON.stringify(record)
}

export function formatImportChange(change: unknown): string {
  const record = asRecord(change)
  if (!record) return String(change)
  const kind = typeof record.kind === 'string' ? record.kind : 'change'
  const current = record.current === undefined ? null : String(record.current)
  const next = record.next === undefined ? null : String(record.next)
  return current || next ? `${kind}: ${current ?? 'none'} -> ${next ?? 'none'}` : kind
}

export function deriveImportRunResult(run: ImportRun) {
  const result = asRecord(run.result)
  const summary = asRecord(run.summary) ?? {}
  const entriesRecord = asRecord(result?.entries)
  const entryRows = Array.isArray(result?.entries)
    ? asArray(result?.entries)
    : asArray(result?.entryChanges)
  const entryChanges = entryRows.flatMap((item) => {
    const record = asRecord(item)
    if (!record) return []
    return [
      {
        key: typeof record.key === 'string' ? record.key : 'unknown entry',
        status: typeof record.status === 'string' ? record.status : 'unknown',
        changes: asArray(record.changes).map(formatImportChange),
      },
    ]
  })

  const blockers = asArray(result?.blockedChanges)
  const warnings = asArray(result?.warnings)
  const published = asStringArray(entriesRecord?.published)

  return {
    malformed:
      run.kind === 'apply' && !result && run.status !== 'failed'
        ? 'Stored apply result is missing or malformed.'
        : '',
    blockers,
    warnings,
    noops: asStringArray(result?.noops),
    skipped: asStringArray(entriesRecord?.skipped),
    entryCreated: asStringArray(entriesRecord?.created),
    entryUpdated: asStringArray(entriesRecord?.updated),
    published,
    entryChanges,
    blockerCount: blockers.length || numberFrom(summary.blockerCount),
    warningCount: warnings.length || numberFrom(summary.warningCount),
    publishedCount: published.length || numberFrom(summary.publishedCount),
  }
}

export function importRunSourceLabel(run: ImportRun): string {
  const source = run.source ?? {}
  const provider = typeof source.provider === 'string' ? source.provider : 'unknown source'
  const root = typeof source.root === 'string' ? source.root : ''
  const ref = typeof source.ref === 'string' && source.ref ? ` @ ${source.ref}` : ''
  return root ? `${provider}: ${root}${ref}` : `${provider}${ref}`
}

export function importRunSourceSummary(run: ImportRun): string {
  const source = run.source ?? {}
  const provider = typeof source.provider === 'string' ? source.provider : ''
  const root = typeof source.root === 'string' ? source.root : ''
  const ref = typeof source.ref === 'string' ? source.ref : ''
  if (provider === 'filesystem' && root === 'content') return ref
  if (provider === 'filesystem') return [root, ref].filter(Boolean).join(' @ ')
  return importRunSourceLabel(run)
}

export function deriveImportRunSummary(run: ImportRun) {
  const result = deriveImportRunResult(run)

  return {
    blockers: result.blockerCount,
    warnings: result.warningCount,
    published: result.publishedCount,
  }
}

export function deriveImportRunsOverview(runs: ImportRun[]) {
  const initial = {
    totalRuns: 0,
    previewRuns: 0,
    applyRuns: 0,
    publishedRuns: 0,
    blockedRuns: 0,
    failedRuns: 0,
    totalBlockers: 0,
    totalWarnings: 0,
    totalPublished: 0,
    latestRun: null as ImportRun | null,
  }

  return runs.reduce((overview, run) => {
    const summary = deriveImportRunSummary(run)
    overview.totalRuns += 1
    overview.totalBlockers += summary.blockers
    overview.totalWarnings += summary.warnings
    overview.totalPublished += summary.published

    if (run.kind === 'preview') overview.previewRuns += 1
    if (run.kind === 'apply') overview.applyRuns += 1
    if (run.status === 'published') overview.publishedRuns += 1
    if (run.status === 'blocked') overview.blockedRuns += 1
    if (run.status === 'failed') overview.failedRuns += 1

    if (!overview.latestRun || (run.createdAt ?? 0) > (overview.latestRun.createdAt ?? 0)) {
      overview.latestRun = run
    }

    return overview
  }, initial)
}
