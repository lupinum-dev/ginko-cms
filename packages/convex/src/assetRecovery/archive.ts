import { v } from 'convex/values'

import type { Doc } from '../_generated/dataModel.js'
import { throwCmsError } from '../errors.js'

/** Asset-only recovery archive format. Database recovery remains owned by Convex snapshots. */
export const RECOVERY_FORMAT = 'ginko-cms-asset-recovery'
export const RECOVERY_VERSION = 1
export const MAX_ASSET_BYTES = 25 * 1024 * 1024
export const MAX_ARCHIVE_BYTES = 36 * 1024 * 1024

export type AssetSnapshot = {
  originalAssetId: string
  filename: string
  mimeType: string
  size: number
  sha256: string
  width: number
  height: number
  frames: number
  alt: string | Record<string, string> | null
  caption: string | Record<string, string> | null
  scope: 'global' | 'collection' | 'entry'
  entryId: string | null
  collection: string | null
  tags: string[]
  createdBy: string
  updatedBy: string | null
  createdAt: number
  updatedAt: number | null
  deletedAt: number | null
  deletedBy: string | null
}

export type AssetRecoveryArchive = {
  format: typeof RECOVERY_FORMAT
  version: typeof RECOVERY_VERSION
  exportedAt: number
  asset: AssetSnapshot
  manifest: {
    byteSize: number
    bytesSha256: string
    assetSha256: string
    assetUpdatedAt: number
  }
  bytesBase64: string
}

export const assetSnapshotValidator = v.object({
  originalAssetId: v.string(),
  filename: v.string(),
  mimeType: v.string(),
  size: v.number(),
  sha256: v.string(),
  width: v.number(),
  height: v.number(),
  frames: v.number(),
  alt: v.union(v.string(), v.record(v.string(), v.string()), v.null()),
  caption: v.union(v.string(), v.record(v.string(), v.string()), v.null()),
  scope: v.union(v.literal('global'), v.literal('collection'), v.literal('entry')),
  entryId: v.union(v.string(), v.null()),
  collection: v.union(v.string(), v.null()),
  tags: v.array(v.string()),
  createdBy: v.string(),
  updatedBy: v.union(v.string(), v.null()),
  createdAt: v.number(),
  updatedAt: v.union(v.number(), v.null()),
  deletedAt: v.union(v.number(), v.null()),
  deletedBy: v.union(v.string(), v.null()),
})

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(',')}]`
  const record = value as Record<string, unknown>
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(',')}}`
}

export function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength
}

export async function sha256Bytes(bytes: Uint8Array): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', Uint8Array.from(bytes).buffer)
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function sha256Text(value: string): Promise<string> {
  return await sha256Bytes(new TextEncoder().encode(value))
}

const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

export function bytesToBase64(bytes: Uint8Array): string {
  let output = ''
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index]!
    const second = bytes[index + 1]
    const third = bytes[index + 2]
    const packed = (first << 16) | ((second ?? 0) << 8) | (third ?? 0)
    output += BASE64[(packed >>> 18) & 63]
    output += BASE64[(packed >>> 12) & 63]
    output += second === undefined ? '=' : BASE64[(packed >>> 6) & 63]
    output += third === undefined ? '=' : BASE64[packed & 63]
  }
  return output
}

export function base64ToBytes(value: string): Uint8Array {
  if (value.length % 4 !== 0 || !/^[a-z0-9+/]*={0,2}$/i.test(value)) {
    throwCmsError(
      'ASSET_RECOVERY_ARCHIVE_INVALID',
      'Recovery artifact contains malformed asset bytes.',
    )
  }
  const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0
  const output = new Uint8Array((value.length / 4) * 3 - padding)
  let offset = 0
  for (let index = 0; index < value.length; index += 4) {
    const a = BASE64.indexOf(value[index]!)
    const b = BASE64.indexOf(value[index + 1]!)
    const c = value[index + 2] === '=' ? 0 : BASE64.indexOf(value[index + 2]!)
    const d = value[index + 3] === '=' ? 0 : BASE64.indexOf(value[index + 3]!)
    if (a < 0 || b < 0 || c < 0 || d < 0) {
      throwCmsError(
        'ASSET_RECOVERY_ARCHIVE_INVALID',
        'Recovery artifact contains malformed asset bytes.',
      )
    }
    const packed = (a << 18) | (b << 12) | (c << 6) | d
    if (offset < output.length) output[offset++] = (packed >>> 16) & 255
    if (offset < output.length) output[offset++] = (packed >>> 8) & 255
    if (offset < output.length) output[offset++] = packed & 255
  }
  return output
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function requiredString(record: Record<string, unknown>, key: string): string {
  const value = record[key]
  if (typeof value !== 'string' || value.length === 0) {
    throwCmsError('ASSET_RECOVERY_ARCHIVE_INVALID', `Recovery artifact field "${key}" is invalid.`)
  }
  return value
}

function requiredNumber(record: Record<string, unknown>, key: string): number {
  const value = record[key]
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throwCmsError('ASSET_RECOVERY_ARCHIVE_INVALID', `Recovery artifact field "${key}" is invalid.`)
  }
  return value
}

function nullableString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key]
  if (value === null) return null
  if (typeof value !== 'string') {
    throwCmsError('ASSET_RECOVERY_ARCHIVE_INVALID', `Recovery artifact field "${key}" is invalid.`)
  }
  return value
}

function nullableNumber(record: Record<string, unknown>, key: string): number | null {
  const value = record[key]
  if (value === null) return null
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throwCmsError('ASSET_RECOVERY_ARCHIVE_INVALID', `Recovery artifact field "${key}" is invalid.`)
  }
  return value
}

function isLocaleTextOrNull(value: unknown): boolean {
  return (
    value === null ||
    typeof value === 'string' ||
    (isRecord(value) && Object.values(value).every((label) => typeof label === 'string'))
  )
}

function decodeAssetSnapshot(value: unknown): AssetSnapshot {
  if (!isRecord(value)) {
    throwCmsError(
      'ASSET_RECOVERY_ARCHIVE_INVALID',
      'Recovery artifact asset manifest is malformed.',
    )
  }
  const scope = value.scope
  const tags = value.tags
  const alt = value.alt
  const caption = value.caption
  if (
    !['global', 'collection', 'entry'].includes(String(scope)) ||
    !Array.isArray(tags) ||
    tags.some((tag) => typeof tag !== 'string') ||
    !isLocaleTextOrNull(alt) ||
    !isLocaleTextOrNull(caption)
  ) {
    throwCmsError(
      'ASSET_RECOVERY_ARCHIVE_INVALID',
      'Recovery artifact asset manifest is malformed.',
    )
  }
  return {
    originalAssetId: requiredString(value, 'originalAssetId'),
    filename: requiredString(value, 'filename'),
    mimeType: requiredString(value, 'mimeType'),
    size: requiredNumber(value, 'size'),
    sha256: requiredString(value, 'sha256'),
    width: requiredNumber(value, 'width'),
    height: requiredNumber(value, 'height'),
    frames: requiredNumber(value, 'frames'),
    alt: alt as AssetSnapshot['alt'],
    caption: caption as AssetSnapshot['caption'],
    scope: scope as AssetSnapshot['scope'],
    entryId: nullableString(value, 'entryId'),
    collection: nullableString(value, 'collection'),
    tags: tags as string[],
    createdBy: requiredString(value, 'createdBy'),
    updatedBy: nullableString(value, 'updatedBy'),
    createdAt: requiredNumber(value, 'createdAt'),
    updatedAt: nullableNumber(value, 'updatedAt'),
    deletedAt: nullableNumber(value, 'deletedAt'),
    deletedBy: nullableString(value, 'deletedBy'),
  }
}

export function decodeAssetRecoveryArchive(
  archiveJson: string,
  artifactId = 'unbound',
): AssetRecoveryArchive {
  if (byteLength(archiveJson) > MAX_ARCHIVE_BYTES) {
    throwCmsError(
      'ASSET_RECOVERY_SIZE_LIMIT_EXCEEDED',
      'Recovery artifact exceeds its byte limit.',
      { artifactId },
    )
  }
  let value: unknown
  try {
    value = JSON.parse(archiveJson)
  } catch {
    throwCmsError('ASSET_RECOVERY_ARCHIVE_INVALID', 'Recovery artifact is not valid JSON.', {
      artifactId,
    })
  }
  if (
    !isRecord(value) ||
    value.format !== RECOVERY_FORMAT ||
    value.version !== RECOVERY_VERSION ||
    !isRecord(value.manifest) ||
    typeof value.bytesBase64 !== 'string'
  ) {
    throwCmsError('ASSET_RECOVERY_ARCHIVE_INVALID', 'Recovery artifact format is unsupported.', {
      artifactId,
    })
  }
  const manifest = value.manifest
  const archive: AssetRecoveryArchive = {
    format: RECOVERY_FORMAT,
    version: RECOVERY_VERSION,
    exportedAt: requiredNumber(value, 'exportedAt'),
    asset: decodeAssetSnapshot(value.asset),
    manifest: {
      byteSize: requiredNumber(manifest, 'byteSize'),
      bytesSha256: requiredString(manifest, 'bytesSha256'),
      assetSha256: requiredString(manifest, 'assetSha256'),
      assetUpdatedAt: requiredNumber(manifest, 'assetUpdatedAt'),
    },
    bytesBase64: value.bytesBase64,
  }
  if (
    !/^[a-f0-9]{64}$/.test(archive.manifest.bytesSha256) ||
    !/^[a-f0-9]{64}$/.test(archive.manifest.assetSha256) ||
    archive.manifest.byteSize < 0 ||
    archive.manifest.byteSize > MAX_ASSET_BYTES ||
    archive.asset.size !== archive.manifest.byteSize ||
    archive.asset.sha256 !== archive.manifest.bytesSha256
  ) {
    throwCmsError(
      'ASSET_RECOVERY_MANIFEST_INVALID',
      'Recovery artifact manifest is inconsistent.',
      { artifactId },
    )
  }
  if (base64ToBytes(archive.bytesBase64).byteLength !== archive.manifest.byteSize) {
    throwCmsError(
      'ASSET_RECOVERY_MANIFEST_INVALID',
      'Recovery artifact byte count is inconsistent.',
      { artifactId },
    )
  }
  return archive
}

export function assetSnapshot(asset: Doc<'assets'>): AssetSnapshot {
  return {
    originalAssetId: String(asset._id),
    filename: asset.filename,
    mimeType: asset.mimeType,
    size: asset.size,
    sha256: asset.sha256,
    width: asset.width,
    height: asset.height,
    frames: asset.frames,
    alt: asset.alt ?? null,
    caption: asset.caption ?? null,
    scope: asset.scope,
    entryId: asset.entryId ? String(asset.entryId) : null,
    collection: asset.collection ?? null,
    tags: asset.tags ?? [],
    createdBy: asset.createdBy,
    updatedBy: asset.updatedBy ?? null,
    createdAt: asset.createdAt,
    updatedAt: asset.updatedAt ?? null,
    deletedAt: asset.deletedAt ?? null,
    deletedBy: asset.deletedBy ?? null,
  }
}
