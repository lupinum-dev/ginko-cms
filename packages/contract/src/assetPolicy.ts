export const MAX_ASSET_SIZE_BYTES = 25 * 1024 * 1024

export const ALLOWED_ASSET_MIME_TYPES = [
  'image/avif',
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
] as const

export type AllowedAssetMimeType = (typeof ALLOWED_ASSET_MIME_TYPES)[number]
