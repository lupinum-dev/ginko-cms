import type {
  CmsField,
  CollectionMode,
  CollectionRouting,
  CollectionType,
  EntryStatus,
  JsonMap,
  JsonValue,
  LocaleState,
  LocaleText,
  NodeKind,
  SlugMode,
} from '@lupinum/ginko-cms-contract/shared/types.js'
export type StudioField = CmsField
export type StudioLocaleState = LocaleState

export interface StudioEntryLocaleData {
  draft: StudioLocaleState
  published?: StudioLocaleState | null
}

export interface StudioLocaleVariant {
  locale: string
  draftPath?: string | null
  publishedPath?: string | null
  published?: boolean
  updatedAt?: number | null
}

export interface StudioEntry {
  _id: string
  locale: string
  slug: string
  status: EntryStatus
  draftVersion: number
  _can?: Record<string, boolean>
  parentEntryId?: string | null
  nodeKind?: NodeKind | null
  path?: string | null
  baseSlug?: string | null
  dirtyLocales: string[]
  data: JsonMap
  draft?: JsonMap
  localeData?: StudioEntryLocaleData | null
}

export interface StudioCollectionConfig {
  _id: string
  slug?: string
  label?: LocaleText | null
  labelMap?: LocaleText | null
  icon?: string | null
  type?: CollectionType
  mode?: CollectionMode
  pathPrefix?: string | null
  slugMode?: SlugMode
  singleton?: boolean
  routing?: Partial<CollectionRouting> | null
  fields?: StudioField[]
  locales?: string[]
  settings?: JsonValue
  contract?: {
    source: 'code'
    version: string
  }
  projectionStatus?: {
    activeCollectionProjectionRunId: string | null
    activeSiteProjectionRunId: string | null
    activatedAt: number | null
  }
  lastImportRun?: {
    importRunId: string
    kind: 'preview' | 'apply'
    status: 'previewed' | 'blocked' | 'applied' | 'published' | 'failed'
    publish: boolean
    blockerCount: number
    warningCount: number
    publishedCount: number
    createdAt: number
  } | null
}

export interface StudioAssetRecord {
  _id: string
  filename: string
  mimeType: string
  size: number
  width?: number | null
  height?: number | null
  url?: string | null
  alt?: LocaleText | null
  caption?: LocaleText | null
  entryId?: string | null
  collectionId?: string | null
  ownerPath?: string[]
  createdAt?: number
  updatedAt?: number | null
}

export interface StudioAssetContext {
  locale?: string
  entryId?: string
  collectionId?: string
  collectionSlug?: string
  onAssetRegistered?: (assetId: string) => Promise<void> | void
}
