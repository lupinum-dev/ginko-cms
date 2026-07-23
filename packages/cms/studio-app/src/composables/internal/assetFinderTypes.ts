import type { LocaleText } from '@lupinum/ginko-cms-contract/shared/types.js'

export type SidebarMode = 'collections' | 'tags' | 'full' | 'trash'
export type StudioAssetBrowserMode = 'manage' | 'pick'

export interface FinderAssetRecord {
  id: string
  filename: string
  mimeType: string
  size: number
  width: number | null
  height: number | null
  scope: 'global' | 'collection' | 'entry'
  entryId: string | null
  collection: string | null
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
  referenceCertainty: {
    state: 'used' | 'unused-verified' | 'unknown-stale'
    proofCurrent: boolean
    canonicalGeneration: number
    verifiedRunId: string | null
    verifiedAt: number | null
  }
}

export interface FinderAssetFacets {
  activeCount: number
  trashedCount: number
  globalActiveCount: number
  collections: Array<{ key: string; label: string; count: number }>
  tags: Array<{ key: string; count: number }>
}

export interface FinderAssetUsage {
  sourceKind: 'draft' | 'revision' | 'public'
  sourceId: string
  entryId: string
  entryTitle: string
  fieldPath: string
  locale: string
  collection: string
  collectionLabel: string
}
