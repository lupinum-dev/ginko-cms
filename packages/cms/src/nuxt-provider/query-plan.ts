import { createContentDataSourceError } from '@lupinum/ginko-content/data-source'
import {
  PROVIDER_QUERY_VERSION,
  type ContentProviderQuery,
  type ContentProviderQueryPlan,
  type ProviderDocumentInput,
} from '@lupinum/ginko-content/provider'

export type FilterState = { locale?: string; pathPrefix?: string; impossible?: true }
type PlanFilter = ContentProviderQuery['plan']['filter']
type PlanCompare = Extract<PlanFilter, { type: 'compare' }>
type PlanSort = ContentProviderQuery['plan']['sort']

const unsupported = (): never => {
  throw createContentDataSourceError('QUERY_UNSUPPORTED')
}

export function assertProviderQuery(input: unknown): asserts input is ContentProviderQuery {
  if (
    input === null ||
    typeof input !== 'object' ||
    Array.isArray(input) ||
    !('v' in input) ||
    input.v !== PROVIDER_QUERY_VERSION ||
    !('plan' in input) ||
    input.plan === null ||
    typeof input.plan !== 'object' ||
    Array.isArray(input.plan)
  ) {
    unsupported()
  }
}

export function assertQueryCollection(collection: string | null): asserts collection is string {
  if (!collection) unsupported()
}

export function assertPortableListPlan(query: ContentProviderQuery): void {
  assertQueryCollection(query.collection)
  if (query.plan.mode === 'count' || query.plan.projection?.without?.length) unsupported()
}

export function applyOnlyProjection(
  entry: ProviderDocumentInput,
  only: readonly string[] = [],
): ProviderDocumentInput {
  if (!only.length) return entry
  const projected: ProviderDocumentInput = {
    collection: entry.collection,
    locale: entry.locale,
    contentPath: entry.contentPath,
    canonicalKey: entry.canonicalKey,
    body: entry.body,
  }
  for (const field of only) {
    if (field in entry) projected[field] = entry[field]
  }
  return projected
}

const assertSupportedOperator = (operator: string): void => {
  if (!['eq', 'ne', 'prefix'].includes(operator)) unsupported()
}

const applyCompare = (state: FilterState, clause: PlanCompare): FilterState => {
  assertSupportedOperator(clause.operator)
  const { field, operator, value } = clause
  if (field === 'draft' || field === 'partial') {
    if ((operator === 'ne' && value === true) || (operator === 'eq' && value === false))
      return state
    if ((operator === 'eq' && value === true) || (operator === 'ne' && value === false)) {
      return { impossible: true }
    }
    return unsupported()
  }
  if (field === 'locale' && operator === 'eq' && typeof value === 'string') {
    if (state.locale && state.locale !== value) return { impossible: true }
    return { ...state, locale: value }
  }
  if (field === 'path' && operator === 'prefix' && typeof value === 'string' && value) {
    if (!state.pathPrefix) return { ...state, pathPrefix: value }
    if (value === state.pathPrefix || value.startsWith(`${state.pathPrefix}/`)) {
      return { ...state, pathPrefix: value }
    }
    if (state.pathPrefix.startsWith(`${value}/`)) return state
    return { impossible: true }
  }
  return unsupported()
}

const sameState = (left: FilterState, right: FilterState): boolean =>
  left.impossible === right.impossible &&
  left.locale === right.locale &&
  left.pathPrefix === right.pathPrefix

export function collectPlanFilter(filter: PlanFilter): FilterState {
  if (!filter || filter.type === 'true') return {}
  if (filter.type === 'and') {
    let state: FilterState = {}
    for (const clause of filter.clauses || []) {
      const next = collectPlanFilter(clause)
      if (state.impossible || next.impossible) return { impossible: true }
      if (next.locale) {
        if (state.locale && state.locale !== next.locale) return { impossible: true }
        state = { ...state, locale: next.locale }
      }
      if (next.pathPrefix) {
        state = applyCompare(state, {
          type: 'compare',
          field: 'path',
          operator: 'prefix',
          value: next.pathPrefix,
        })
      }
    }
    return state
  }
  if (filter.type === 'compare') return applyCompare({}, filter)
  if (filter.type === 'or') {
    const possible = filter.clauses.map(collectPlanFilter).filter((branch) => !branch.impossible)
    if (!possible.length) return { impossible: true }
    if (possible.length === 1 || possible.every((branch) => sameState(branch, possible[0]!))) {
      return possible[0]!
    }
    return unsupported()
  }
  if (filter.type === 'not') {
    const child = collectPlanFilter(filter.clause)
    if (child.impossible) return {}
    if (sameState(child, {})) return { impossible: true }
  }
  return unsupported()
}

export function sortFromPlan(sort: PlanSort = []): string | undefined {
  const supportedFields = new Set([
    'orderKey',
    'entryCreatedAt',
    'firstPublishedAt',
    'lastPublishedAt',
  ])
  for (const item of sort) {
    const field = item.field === 'file.stem' ? 'orderKey' : item.field
    if (!supportedFields.has(field)) unsupported()
    if (item.direction === 1) return `${field}:asc`
    if (item.direction === -1) return `${field}:desc`
    unsupported()
  }
  return undefined
}

export const hasExplicitPublicSort = (sort: PlanSort = []): boolean =>
  sort.some((item) => item.field)

const valueAt = (entry: ProviderDocumentInput, field: string): unknown => {
  if (field === 'draft' || field === 'partial') return false
  if (field === 'path') return entry.contentPath
  return field.split('.').reduce<unknown>((value, segment) => {
    if (!value || typeof value !== 'object' || !Object.hasOwn(value, segment)) return undefined
    return (value as Record<string, unknown>)[segment]
  }, entry)
}

const matchesPublishedFilter = (
  entry: ProviderDocumentInput,
  filter: ContentProviderQueryPlan['filter'],
): boolean => {
  if (filter.type === 'true') return true
  if (filter.type === 'and') {
    return filter.clauses.every((clause) => matchesPublishedFilter(entry, clause))
  }
  if (filter.type === 'or') {
    return filter.clauses.some((clause) => matchesPublishedFilter(entry, clause))
  }
  if (filter.type === 'not') return !matchesPublishedFilter(entry, filter.clause)

  const actual = valueAt(entry, filter.field)
  if (filter.operator === 'eq') return actual === filter.value
  if (filter.operator === 'ne') return actual !== filter.value
  if (filter.operator === 'exists') {
    return filter.value === true ? actual !== undefined : actual === undefined
  }
  if (filter.operator === 'prefix') return String(actual || '').startsWith(String(filter.value))
  return unsupported()
}

const sortPublishedEntries = (
  entries: ProviderDocumentInput[],
  sort: PlanSort = [],
): ProviderDocumentInput[] => {
  for (const clause of [...sort].reverse()) {
    const collator = new Intl.Collator(clause.locale, {
      numeric: clause.numeric,
      caseFirst: clause.caseFirst,
      sensitivity: clause.sensitivity,
    })
    entries.sort((left, right) => {
      const values = [valueAt(left, clause.field), valueAt(right, clause.field)].map((value) =>
        value === null || value === undefined ? '' : String(value),
      )
      if (clause.direction === -1) values.reverse()
      return collator.compare(values[0]!, values[1]!)
    })
  }
  return entries
}

const SCAN_CURSOR_PREFIX = 'ginko-cms-scan:'

const scanOffset = (cursor: string | null | undefined): number => {
  if (!cursor) return 0
  if (!cursor.startsWith(SCAN_CURSOR_PREFIX)) return unsupported()
  const offset = Number(cursor.slice(SCAN_CURSOR_PREFIX.length))
  if (!Number.isSafeInteger(offset) || offset < 0) return unsupported()
  return offset
}

export function needsPublishedScan(plan: ContentProviderQueryPlan): boolean {
  try {
    collectPlanFilter(plan.filter)
    sortFromPlan(plan.sort)
    return plan.pagination.mode === 'slice' && plan.pagination.skip > 0
  } catch {
    return true
  }
}

export function publishedScanLocale(
  filter: ContentProviderQueryPlan['filter'],
): string | undefined {
  if (filter.type === 'compare') {
    return filter.field === 'locale' && filter.operator === 'eq' && typeof filter.value === 'string'
      ? filter.value
      : undefined
  }
  if (filter.type === 'and') {
    return filter.clauses.map(publishedScanLocale).find((locale) => locale !== undefined)
  }
  return undefined
}

export function executePublishedScan(
  entries: ProviderDocumentInput[],
  plan: ContentProviderQueryPlan,
) {
  const matched = sortPublishedEntries(
    entries.filter((entry) => matchesPublishedFilter(entry, plan.filter)),
    plan.sort,
  )
  const offset =
    plan.pagination.mode === 'cursor' ? scanOffset(plan.pagination.after) : plan.pagination.skip
  const limit = plan.pagination.limit ?? matched.length
  const page = matched
    .slice(offset, offset + limit)
    .map((entry) => applyOnlyProjection(entry, plan.projection?.only))
  if (plan.mode === 'first') return { result: page[0] }
  if (plan.pagination.mode === 'cursor') {
    const hasNext = offset + limit < matched.length
    return {
      mode: 'cursor' as const,
      result: page,
      limit,
      pageInfo: {
        endCursor: hasNext ? `${SCAN_CURSOR_PREFIX}${offset + limit}` : null,
        hasNext,
      },
    }
  }
  return { result: page, skip: offset, limit, total: matched.length }
}
