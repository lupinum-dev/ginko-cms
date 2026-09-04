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
  createdAt: number
  updatedAt: number
  updatedBy: string
}

export function readLocaleText(value: LocaleText | null | undefined, locale: string): string {
  if (!value) return ''
  return typeof value === 'string' ? value : (value[locale] ?? '')
}
