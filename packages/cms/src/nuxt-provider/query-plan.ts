import { createContentDataSourceError } from '@lupinum/ginko-content/data-source'
import {
  PROVIDER_QUERY_VERSION,
  type ContentProviderQuery,
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
