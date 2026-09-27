export const MAX_ASSET_SIZE_BYTES = 25 * 1024 * 1024

// Convex HTTP responses are limited to 20 MB. Keep each private delivery
// response below that boundary without reducing the accepted asset size.
export const PRIVATE_ASSET_CHUNK_BYTES = 4 * 1024 * 1024

export const ALLOWED_ASSET_MIME_TYPES = [
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/webp',
] as const

export type AllowedAssetMimeType = (typeof ALLOWED_ASSET_MIME_TYPES)[number]
