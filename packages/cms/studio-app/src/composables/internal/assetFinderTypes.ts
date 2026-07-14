import type { LocaleText } from '@lupinum/ginko-cms-contract/shared/types.js'

export type SidebarMode = 'collections' | 'tags' | 'full' | 'trash'
export type StudioAssetBrowserMode = 'manage' | 'pick'

export interface FinderFolder {
  type: 'folder'
  id: string
  label: string
  icon: string
  count: number
  modifiedAt: number | null
}

export interface FinderAssetRecord {
  id: string
  filename: string
  mimeType: string
  size: number
  width: number | null
  height: number | null
  scope: 'global' | 'collection' | 'entry'
  entryId: string | null
  collectionId: string | null
  collectionSlug: string | null
  collectionLabel: string | null
  entryTitle: string | null
  ownerPath: string[]
  url: string | null
  thumbnailUrl: string | null
  createdAt: number
  updatedAt: number | null
  deletedAt: number | null
  alt: LocaleText | null
  caption: LocaleText | null
  tags: string[]
  usages: Array<{
    entryId: string
    entryTitle: string
    fieldPath: string
    locale: string
    collectionSlug: string
    collectionLabel: string
  }>
}

export interface FinderAssetItem {
  type: 'asset'
  asset: FinderAssetRecord
  tags: string[]
}

export type FinderItem = FinderFolder | FinderAssetItem

export interface BreadcrumbSegment {
  label: string
  drillPath: string[]
}
