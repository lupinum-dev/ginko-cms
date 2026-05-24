import type { CmsCollectionConfig } from '@public/types'

import type { StudioCollectionConfig } from '../composables/internal/types'

type LocaleText = StudioCollectionConfig['labelMap']

export type StudioCollectionListItem = {
  _id: string
  slug: string
  label: string
  labelMap: LocaleText
  type: 'flat' | 'tree'
  icon: string | null
  routing: NonNullable<StudioCollectionConfig['routing']>
  pathPrefix: string
  mode: 'route' | 'none'
  slugMode: NonNullable<StudioCollectionConfig['slugMode']>
  rootSlug: string | null
  singleton: boolean
  locales: string[]
  fieldCount: number
  entryCount: number
  createdAt: number
  updatedAt: number
  updatedBy: string
}

function titleFromSlug(slug: string) {
  return slug
    .split(/[-_]/g)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ')
}

export function readLocaleText(value: LocaleText | null | undefined, locale: string): string {
  if (!value) return ''
  return typeof value === 'string' ? value : (value[locale] ?? '')
}

function collectionRouting(collection: CmsCollectionConfig) {
  const mode = collection.mode ?? collection.routing?.mode ?? 'route'
  const pathPrefix = collection.pathPrefix ?? collection.routing?.pathPrefix ?? '/'
  const slugMode = collection.slugMode ?? collection.routing?.slugMode ?? 'shared'
  const rootSlug = collection.rootSlug ?? collection.routing?.rootSlug ?? null
  const singleton = collection.singleton ?? collection.routing?.singleton ?? false

  return {
    mode,
    pathPrefix,
    slugMode,
    rootSlug,
    singleton,
  }
}

export function codeDefinedCollectionList(
  collections: Record<string, CmsCollectionConfig> | undefined,
  locale: string,
): StudioCollectionListItem[] {
  return Object.entries(collections ?? {})
    .map(([slug, collection]) => {
      const routing = collectionRouting(collection)
      const labelMap = collection.label ?? titleFromSlug(slug)
      return {
        _id: `code:${slug}`,
        slug,
        label: readLocaleText(labelMap, locale) || titleFromSlug(slug),
        labelMap,
        type: collection.type ?? 'flat',
        icon: collection.icon ?? null,
        routing,
        pathPrefix: routing.pathPrefix,
        mode: routing.mode,
        slugMode: routing.slugMode,
        rootSlug: routing.rootSlug,
        singleton: routing.singleton,
        locales: collection.locales ?? [],
        fieldCount: collection.fields?.length ?? 0,
        entryCount: 0,
        createdAt: 0,
        updatedAt: 0,
        updatedBy: 'code',
      } satisfies StudioCollectionListItem
    })
    .sort((left, right) => left.label.localeCompare(right.label))
}

export function codeDefinedCollectionDetail(
  slug: string,
  collection: CmsCollectionConfig | null | undefined,
  locale: string,
): StudioCollectionConfig | null {
  if (!collection) return null
  const routing = collectionRouting(collection)
  const labelMap = collection.label ?? titleFromSlug(slug)
  return {
    _id: `code:${slug}`,
    slug,
    label: readLocaleText(labelMap, locale) || titleFromSlug(slug),
    labelMap,
    type: collection.type ?? 'flat',
    icon: collection.icon ?? null,
    routing,
    pathPrefix: routing.pathPrefix,
    mode: routing.mode,
    slugMode: routing.slugMode,
    singleton: routing.singleton,
    locales: collection.locales ?? [],
    fields: collection.fields ?? [],
    settings: collection.settings ?? {},
    contract: {
      source: 'code',
      version: 'host-runtime',
    },
    projectionStatus: {
      activeCollectionProjectionRunId: null,
      activeSiteProjectionRunId: null,
      activatedAt: null,
    },
    lastImportRun: null,
  }
}
