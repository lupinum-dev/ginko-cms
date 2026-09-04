import type { EntryStatus } from '@lupinum/ginko-cms-contract/shared/types.js'

export type LocaleSummary = {
  locale: string
  published: boolean
  draftExists?: boolean
  updatedAt?: number
}

export type StudioEntryRow = {
  _id: string
  slug: string
  path: string
  title: string
  status: EntryStatus
  dirtyLocales?: string[]
  draftVersion?: number
  updatedAt: number
  parentEntryId: string | null
  orderRank: string
  nodeKind: string
  data: Record<string, unknown>
  localeSummaries: LocaleSummary[]
  publicState?: 'public' | 'draft_only' | 'needs_attention' | 'data_only'
  draftChangedSincePublish?: boolean
  blockingIssueCount?: number
  missingTranslationLocales?: string[]
  localeReadinessStates?: Record<string, string>
  nextAction?: string
  workflowSummary?: {
    nextAction?: {
      kind: string
    } | null
  }
  _can?: Record<string, boolean>
}

export type StudioEntrySummaryRow = {
  _id: string
  entryId: string
  collection: string
  title: string
  slug: string
  path: string
  status: EntryStatus
  routeMode: 'route' | 'none'
  nodeKind: string
  parentEntryId: string | null
  updatedAt: number
  publishedAt: number | null
  publicState: 'public' | 'draft_only' | 'needs_attention' | 'data_only'
  draftChangedSincePublish: boolean
  blockingIssueCount: number
  missingTranslationLocales: string[]
  localeReadiness: Array<LocaleSummary & { state: string; changed: boolean; draftPath: string }>
  workflowSummary?: {
    readinessStatesByLocale?: Record<string, string>
  }
  nextAction: string
  _can?: Record<string, boolean>
}

export type TreeRow = StudioEntryRow & {
  depth: number
  kind: string
  order: string
  localeVariants: LocaleSummary[]
}

export type EnrichedRow = TreeRow & {
  publicState: 'public' | 'draft_only' | 'needs_attention' | 'data_only'
  publicStateLabel: string
  publicStateTone: 'success' | 'warning' | 'danger' | 'neutral'
  draftChangedSincePublish: boolean
  blockingIssueCount: number
  missingTranslationLocales: string[]
  nextAction: string
}

export type DropHint = {
  targetId: string
  mode: 'before' | 'after' | 'inside'
}

export type LocaleChipState = 'live' | 'live_with_changes' | 'draft' | 'missing'

export function asTreeRow(row: StudioEntryRow | TreeRow): TreeRow {
  if (
    typeof (row as Partial<TreeRow>).depth === 'number' &&
    typeof (row as Partial<TreeRow>).kind === 'string' &&
    typeof (row as Partial<TreeRow>).order === 'string' &&
    Array.isArray((row as Partial<TreeRow>).localeVariants)
  ) {
    return row as TreeRow
  }
  return {
    ...row,
    depth: 0,
    kind: row.nodeKind,
    order: row.orderRank,
    localeVariants: row.localeSummaries,
  }
}

// Per-language chips use the canonical editorial states. Work-filtered rows
// carry the backend projection; unfiltered rows derive only visual labels from
// the canonical publication and draft flags already returned by the backend.
export function localeChipState(
  row: Pick<StudioEntryRow, 'dirtyLocales' | 'localeReadinessStates'>,
  variant: LocaleSummary,
): LocaleChipState {
  const exact = row.localeReadinessStates?.[variant.locale]
  if (exact === 'live' || exact === 'live_with_changes' || exact === 'missing') return exact
  if (exact) return 'draft'
  const dirty = (row.dirtyLocales ?? []).includes(variant.locale)
  if (variant.published) return dirty ? 'live_with_changes' : 'live'
  return (variant.draftExists ?? dirty) ? 'draft' : 'missing'
}

export const localeChipClasses: Record<LocaleChipState, string> = {
  live: 'ginko:bg-success/10 ginko:text-success-fg ginko:dark:bg-success/20',
  live_with_changes: 'ginko:bg-success/10 ginko:text-success-fg ginko:dark:bg-success/20',
  draft: 'ginko:bg-muted ginko:text-muted-foreground',
  missing: 'ginko:bg-warning/10 ginko:text-warning-fg ginko:dark:bg-warning/20',
}

export const collectionKindClasses: Record<string, string> = {
  section: 'ginko:bg-warning/15 ginko:text-warning-fg ginko:dark:bg-warning/25',
  group: 'ginko:bg-primary/10 ginko:text-primary ginko:dark:bg-primary/20',
  folder: 'ginko:bg-success/15 ginko:text-success-fg ginko:dark:bg-success/25',
  page: 'ginko:bg-muted ginko:text-muted-foreground',
}

export function canEditCollectionEntry(row: StudioEntryRow | undefined): row is StudioEntryRow {
  return row?._can?.edit === true
}
