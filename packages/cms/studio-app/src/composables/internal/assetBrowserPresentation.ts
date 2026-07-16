import type { FinderAssetRecord, FinderItem } from './assetFinderTypes'

type Translate = (key: string, params?: Record<string, unknown>) => string

export function assetOwnerPathLabel(t: Translate, asset: Pick<FinderAssetRecord, 'ownerPath'>) {
  return asset.ownerPath?.length
    ? asset.ownerPath.join(' / ')
    : t('ginkoCms.studio.assetBrowser.globalPath')
}

export function assetOwnershipLabel(
  t: Translate,
  asset: Pick<FinderAssetRecord, 'scope' | 'collectionLabel'>,
) {
  if (asset.scope === 'global') return t('ginkoCms.studio.assetBrowser.ownershipGlobalAsset')
  if (asset.scope === 'collection') {
    return t('ginkoCms.studio.assetBrowser.ownershipCollection', {
      label: asset.collectionLabel ?? t('ginkoCms.studio.assetBrowser.ownershipCollectionFallback'),
    })
  }
  return t('ginkoCms.studio.assetBrowser.ownershipEntry')
}

export function assetPreviewKey(asset: Pick<FinderAssetRecord, 'id' | 'thumbnailUrl'>) {
  return `${asset.id}:${asset.thumbnailUrl ?? ''}`
}

export function assetFinderItemKey(item: FinderItem): string {
  return item.type === 'folder' ? `f:${item.id}` : `a:${item.asset.id}`
}
