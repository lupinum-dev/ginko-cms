import type { AssetInfo, AssetProvider } from '../types'

export const defaultAssetProvider: AssetProvider = {
  buildUrl(asset: Partial<AssetInfo>): string {
    return asset.url || ''
  },

  parseUrl(url: string): Partial<AssetInfo> | null {
    if (!url) {
      return null
    }

    let filename: string | undefined
    try {
      const urlObj = new URL(url)
      const pathParts = urlObj.pathname.split('/').filter(Boolean)
      filename = pathParts.at(-1) || undefined
    } catch {
      const pathParts = url.split('/').filter(Boolean)
      filename = pathParts.at(-1) || undefined
    }

    return {
      filename,
      url,
    }
  },
}
