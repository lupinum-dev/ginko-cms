import type { FinderAssetRecord } from './assetFinderTypes'
import type { StudioAssetRecord } from './types'

export function mimeKind(mimeType: string): string {
  if (mimeType === 'image/jpeg') return 'JPEG Image'
  if (mimeType === 'image/png') return 'PNG Image'
  if (mimeType === 'image/svg+xml') return 'SVG Image'
  if (mimeType === 'image/webp') return 'WebP Image'
  if (mimeType === 'image/x-icon') return 'Icon'
  if (mimeType === 'application/pdf') return 'PDF Document'
  if (mimeType.startsWith('image/')) return 'Image'
  return 'File'
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1_048_576) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1_048_576).toFixed(1)} MB`
}

export function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function mimeIcon(mimeType: string): string {
  if (mimeType === 'application/pdf') return 'lucide:file-text'
  if (mimeType === 'application/zip') return 'lucide:file-archive'
  if (mimeType.startsWith('image/')) return 'lucide:image'
  return 'lucide:file'
}

export function latestAssetTimestamp(assets: FinderAssetRecord[]): number | null {
  if (assets.length === 0) return null
  let max = 0
  for (const asset of assets) {
    const timestamp = asset.updatedAt ?? asset.createdAt
    if (timestamp > max) max = timestamp
  }
  return max
}

export function normalizeAssetTags(tags: string[]): string[] {
  const next = new Set<string>()
  for (const tag of tags) {
    const normalized = tag.trim().toLowerCase()
    if (normalized.length > 0) next.add(normalized)
  }
  return Array.from(next)
}

export function arraysEqual(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

export function withoutKey(
  record: Record<string, string[]>,
  key: string,
): Record<string, string[]> {
  return Object.fromEntries(Object.entries(record).filter(([entryKey]) => entryKey !== key))
}

export async function getImageDimensions(file: File): Promise<{ width?: number; height?: number }> {
  if (!file.type.startsWith('image/')) return {}
  return await new Promise<{ width?: number; height?: number }>((resolve) => {
    const image = new Image()
    image.onload = () => resolve({ width: image.width, height: image.height })
    image.onerror = () => resolve({})
    image.src = URL.createObjectURL(file)
  })
}

export function mimeTypeMatches(pattern: string, mimeType: string): boolean {
  return pattern.endsWith('/*') ? mimeType.startsWith(pattern.slice(0, -1)) : pattern === mimeType
}

export function parseAspectRatio(value: string | null | undefined): number | null {
  if (!value) return null
  const match = value.trim().match(/^(\d+(?:\.\d+)?)(?::|\/)(\d+(?:\.\d+)?)$/)
  if (!match) return null
  const width = Number(match[1])
  const height = Number(match[2])
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null
  return width / height
}

export function finderAssetToStudioAsset(asset: FinderAssetRecord): StudioAssetRecord {
  return {
    _id: asset.id,
    filename: asset.filename,
    mimeType: asset.mimeType,
    size: asset.size,
    width: asset.width,
    height: asset.height,
    url: asset.url,
    alt: asset.alt,
    caption: asset.caption,
    entryId: asset.entryId,
    collectionId: asset.collectionId,
    ownerPath: asset.ownerPath,
    createdAt: asset.createdAt,
    updatedAt: asset.updatedAt,
  }
}
