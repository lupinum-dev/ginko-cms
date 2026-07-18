import type { FinderAssetItem, FinderAssetRecord, FinderItem } from './assetFinderTypes'

function assetItem(asset: FinderAssetRecord): FinderAssetItem {
  return { type: 'asset', asset, tags: asset.tags }
}

/** The backend has already applied the complete filter and stable sort before paging. */
export function buildAssetFinderItems(assets: FinderAssetRecord[]): FinderItem[] {
  return assets.map(assetItem)
}
