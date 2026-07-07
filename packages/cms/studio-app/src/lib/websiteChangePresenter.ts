export type WebsiteChangeValue = string | boolean | null

export type WebsiteChangeInput = {
  locale?: string
  entryId?: string
  scope?: 'current_entry' | 'descendant'
  kind: string
  label: string
  before: WebsiteChangeValue
  after: WebsiteChangeValue
}

export type WebsiteChangeLabels = {
  canonicalUrl: string
  empty: string
  excluded: string
  included: string
  navigation: string
  notSet: string
  oldUrlRedirect: string
  pageUrl: string
  search: string
  sitemap: string
}

export type WebsiteChangeRow = {
  key: string
  locale: string | null
  label: string
  before: string
  after: string
}

export type WebsiteChangeGroups = {
  pageAddressRows: WebsiteChangeRow[]
  searchPreviewRows: WebsiteChangeRow[]
  visibilityRows: WebsiteChangeRow[]
  seoSettingRows: WebsiteChangeRow[]
  otherRows: WebsiteChangeRow[]
  hiddenChangeCount: number
}

export function displayWebsiteChangeValue(
  value: WebsiteChangeValue,
  labels: Pick<WebsiteChangeLabels, 'empty' | 'excluded' | 'included' | 'notSet'>,
): string {
  if (typeof value === 'boolean') return value ? labels.included : labels.excluded
  if (value === null) return labels.notSet
  return value.trim() || labels.empty
}

export function displayWebsiteChangeLabel(
  change: WebsiteChangeInput,
  labels: Pick<
    WebsiteChangeLabels,
    'canonicalUrl' | 'navigation' | 'oldUrlRedirect' | 'pageUrl' | 'search' | 'sitemap'
  >,
): string {
  if (change.kind === 'route' && change.label === 'Public route') return labels.pageUrl
  if (change.kind === 'redirect' && change.label === 'Old route redirect') {
    return labels.oldUrlRedirect
  }
  if (change.kind === 'nav') return labels.navigation
  if (change.kind === 'sitemap') return labels.sitemap
  if (change.kind === 'search') return labels.search
  if (change.kind === 'seo' && /canonical\s+href/i.test(change.label)) return labels.canonicalUrl
  return change.label
}

function labelMatches(change: WebsiteChangeInput, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(change.label))
}

export function isWebsiteSearchPreviewChange(change: WebsiteChangeInput): boolean {
  if (change.kind !== 'seo') return false
  const title =
    labelMatches(change, [/\btitle\b/i, /\bmeta\s+title\b/i, /\bog\s+title\b/i]) &&
    !labelMatches(change, [/\bdescription\b/i])
  const description = labelMatches(change, [/\bdescription\b/i, /\bmeta\s+description\b/i])
  const canonical = labelMatches(change, [/\bcanonical\b/i, /\bhref\b/i, /\burl\b/i])
  return title || description || canonical
}

function websiteChangeRow(change: WebsiteChangeInput, labels: WebsiteChangeLabels) {
  return {
    key: `${change.locale ?? ''}:${change.entryId ?? ''}:${change.scope ?? ''}:${change.kind}:${change.label}:${String(change.before)}:${String(change.after)}`,
    locale: change.locale ?? null,
    label: displayWebsiteChangeLabel(change, labels),
    before: displayWebsiteChangeValue(change.before, labels),
    after: displayWebsiteChangeValue(change.after, labels),
  }
}

export function groupWebsiteChanges(
  changes: WebsiteChangeInput[],
  labels: WebsiteChangeLabels,
  options: { visibleRowLimit?: number } = {},
): WebsiteChangeGroups {
  const pageAddressRows = changes
    .filter((change) => change.kind === 'route' || change.kind === 'redirect')
    .map((change) => websiteChangeRow(change, labels))
  const searchPreviewRows = changes
    .filter(isWebsiteSearchPreviewChange)
    .map((change) => websiteChangeRow(change, labels))
  const visibilityRows = changes
    .filter(
      (change) => change.kind === 'sitemap' || change.kind === 'search' || change.kind === 'nav',
    )
    .map((change) => websiteChangeRow(change, labels))
  const seoSettingRows = changes
    .filter((change) => change.kind === 'seo' && !isWebsiteSearchPreviewChange(change))
    .map((change) => websiteChangeRow(change, labels))
  const otherRows = changes
    .filter(
      (change) =>
        change.kind !== 'route' &&
        change.kind !== 'redirect' &&
        change.kind !== 'sitemap' &&
        change.kind !== 'search' &&
        change.kind !== 'nav' &&
        change.kind !== 'seo',
    )
    .map((change) => websiteChangeRow(change, labels))
  const renderedCount =
    pageAddressRows.length +
    searchPreviewRows.length +
    visibilityRows.length +
    seoSettingRows.length +
    otherRows.length
  const visibleRowLimit = options.visibleRowLimit ?? renderedCount

  return {
    pageAddressRows: pageAddressRows.slice(0, visibleRowLimit),
    searchPreviewRows: searchPreviewRows.slice(0, visibleRowLimit),
    visibilityRows: visibilityRows.slice(0, visibleRowLimit),
    seoSettingRows: seoSettingRows.slice(0, visibleRowLimit),
    otherRows: otherRows.slice(0, visibleRowLimit),
    hiddenChangeCount: Math.max(changes.length - renderedCount, 0),
  }
}
