import type { StudioAssetRecord } from '../../../composables/internal/types'
import type { AssetInfo } from '../../../editor/types'

function readLocalizedText(
  value: StudioAssetRecord['alt'] | StudioAssetRecord['caption'],
  locale?: string,
) {
  if (typeof value === 'string') {
    return value
  }

  if (value && typeof value === 'object' && locale) {
    const localized = value[locale]
    return typeof localized === 'string' ? localized : undefined
  }

  return undefined
}

export function mapStudioAssetToImageInfo(
  asset: StudioAssetRecord,
  locale?: string,
): Partial<AssetInfo> {
  return {
    alt: readLocalizedText(asset.alt, locale),
    filename: asset.filename,
    height: typeof asset.height === 'number' ? asset.height : undefined,
    id: asset._id,
    mimeType: asset.mimeType,
    size: asset.size,
    title: readLocalizedText(asset.caption, locale),
    url: asset.url ?? undefined,
    width: typeof asset.width === 'number' ? asset.width : undefined,
  }
}

export function mapStudioAssetToFileInfo(
  asset: StudioAssetRecord,
  locale?: string,
): Partial<AssetInfo> {
  return {
    filename: asset.filename,
    id: asset._id,
    mimeType: asset.mimeType,
    size: asset.size,
    title: readLocalizedText(asset.caption, locale),
    url: asset.url ?? undefined,
  }
}
