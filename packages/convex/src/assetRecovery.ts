import { anyApi } from 'convex/server'
import type { FunctionReference } from 'convex/server'
import { v } from 'convex/values'

import type { Doc, Id } from './_generated/dataModel.js'
import { internalMutation, internalQuery } from './_generated/server.js'
import { canManageAssetRecovery } from './auth/checks.js'
import { throwCmsError } from './errors.js'
import { callerAction, callerMutation } from './functions.js'
import { logActivity } from './lib/activity.js'
import { getCollection } from './lib/collections.js'
import type { QueryOrMutationCtx } from './lib/types.js'
import {
  buildPreview,
  defineCmsOperation,
  definePreview,
  operationIssue,
  previewResultValidator,
} from './operationHelpers.js'

/**
 * Ginko's application-level recovery artifact is intentionally asset-only.
 * Database disaster recovery is owned by Convex snapshots; content portability
 * is owned by the portability CLI. Keeping those concerns out of this module
 * prevents an unverifiable second database restore path.
 */
const RECOVERY_FORMAT = 'ginko-cms-asset-recovery'
const RECOVERY_VERSION = 1
const MAX_ASSET_BYTES = 25 * 1024 * 1024
const MAX_ARCHIVE_BYTES = 36 * 1024 * 1024

type AnyInternalQuery = FunctionReference<'query', 'internal', Record<string, unknown>, unknown>
type AnyInternalMutation = FunctionReference<
  'mutation',
  'internal',
  Record<string, unknown>,
  unknown
>

const assetRecoveryApi = anyApi as unknown as {
  assetRecovery: {
    readAssetForRecovery: AnyInternalQuery
    getAssetRecoveryArtifact: AnyInternalQuery
    recordAssetRecoveryArtifact: AnyInternalMutation
    restoreAssetFromRecovery: AnyInternalMutation
  }
}

type AssetSnapshot = {
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

type AssetRecoveryActionCtx = {
  runQuery: (ref: AnyInternalQuery, args: Record<string, unknown>) => Promise<unknown>
  runMutation: (ref: AnyInternalMutation, args: Record<string, unknown>) => Promise<unknown>
  storage: {
    get: (id: Id<'_storage'>) => Promise<Blob | null>
    store: (blob: Blob) => Promise<Id<'_storage'>>
    delete: (id: Id<'_storage'>) => Promise<void>
  }
}

const assetSnapshotValidator = v.object({
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

const assetRecoveryArtifactValidator = v.union(
  v.object({
    _id: v.string(),
    _creationTime: v.number(),
    artifactId: v.string(),
    assetId: v.string(),
    collection: v.union(v.string(), v.null()),
    entryId: v.union(v.string(), v.null()),
    checksum: v.string(),
    storageRef: v.string(),
    createdBy: v.string(),
    createdAt: v.number(),
  }),
  v.null(),
)

const restorePreviewValidator = v.object({
  artifactId: v.string(),
  checksum: v.string(),
  applySupported: v.boolean(),
  blockers: v.array(v.object({ code: v.string(), message: v.string() })),
  warnings: v.array(v.object({ code: v.string(), message: v.string() })),
})

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(',')}]`
  const record = value as Record<string, unknown>
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(',')}}`
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength
}

async function sha256Bytes(bytes: Uint8Array): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', Uint8Array.from(bytes).buffer)
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function sha256Text(value: string): Promise<string> {
  return await sha256Bytes(new TextEncoder().encode(value))
}

const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

function bytesToBase64(bytes: Uint8Array): string {
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

function base64ToBytes(value: string): Uint8Array {
  if (value.length % 4 !== 0 || !/^[a-z0-9+/]*={0,2}$/i.test(value)) {
    throwCmsError('BACKUP_ARCHIVE_INVALID', 'Recovery artifact contains malformed asset bytes.')
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
      throwCmsError('BACKUP_ARCHIVE_INVALID', 'Recovery artifact contains malformed asset bytes.')
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
    throwCmsError('BACKUP_ARCHIVE_INVALID', `Recovery artifact field "${key}" is invalid.`)
  }
  return value
}

function requiredNumber(record: Record<string, unknown>, key: string): number {
  const value = record[key]
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throwCmsError('BACKUP_ARCHIVE_INVALID', `Recovery artifact field "${key}" is invalid.`)
  }
  return value
}

function nullableString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key]
  if (value === null) return null
  if (typeof value !== 'string') {
    throwCmsError('BACKUP_ARCHIVE_INVALID', `Recovery artifact field "${key}" is invalid.`)
  }
  return value
}

function nullableNumber(record: Record<string, unknown>, key: string): number | null {
  const value = record[key]
  if (value === null) return null
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throwCmsError('BACKUP_ARCHIVE_INVALID', `Recovery artifact field "${key}" is invalid.`)
  }
  return value
}

function decodeAssetSnapshot(value: unknown): AssetSnapshot {
  if (!isRecord(value)) {
    throwCmsError('BACKUP_ARCHIVE_INVALID', 'Recovery artifact asset manifest is malformed.')
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
    throwCmsError('BACKUP_ARCHIVE_INVALID', 'Recovery artifact asset manifest is malformed.')
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

function isLocaleTextOrNull(value: unknown): boolean {
  return (
    value === null ||
    typeof value === 'string' ||
    (isRecord(value) && Object.values(value).every((label) => typeof label === 'string'))
  )
}

export function decodeAssetRecoveryArchive(
  archiveJson: string,
  artifactId = 'unbound',
): AssetRecoveryArchive {
  if (byteLength(archiveJson) > MAX_ARCHIVE_BYTES) {
    throwCmsError('BACKUP_SIZE_LIMIT_EXCEEDED', 'Recovery artifact exceeds its byte limit.', {
      artifactId,
    })
  }
  let value: unknown
  try {
    value = JSON.parse(archiveJson)
  } catch {
    throwCmsError('BACKUP_ARCHIVE_INVALID', 'Recovery artifact is not valid JSON.', { artifactId })
  }
  if (
    !isRecord(value) ||
    value.format !== RECOVERY_FORMAT ||
    value.version !== RECOVERY_VERSION ||
    !isRecord(value.manifest) ||
    typeof value.bytesBase64 !== 'string'
  ) {
    throwCmsError('BACKUP_ARCHIVE_INVALID', 'Recovery artifact format is unsupported.', {
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
    throwCmsError('BACKUP_MANIFEST_INVALID', 'Recovery artifact manifest is inconsistent.', {
      artifactId,
    })
  }
  if (base64ToBytes(archive.bytesBase64).byteLength !== archive.manifest.byteSize) {
    throwCmsError('BACKUP_MANIFEST_INVALID', 'Recovery artifact byte count is inconsistent.', {
      artifactId,
    })
  }
  return archive
}

function assetSnapshot(asset: Doc<'assets'>): AssetSnapshot {
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

async function loadVerifiedArchive(
  ctx: AssetRecoveryActionCtx,
  artifactId: string,
): Promise<{
  artifact: Doc<'assetRecoveryArtifacts'>
  archive: AssetRecoveryArchive
  archiveJson: string
  bytes: Uint8Array
}> {
  const artifact = (await ctx.runQuery(
    assetRecoveryApi.assetRecovery.getAssetRecoveryArtifact,
    { artifactId },
  )) as Doc<'assetRecoveryArtifacts'> | null
  if (!artifact) {
    throwCmsError('BACKUP_NOT_FOUND', 'Asset recovery artifact was not found.', { artifactId })
  }
  const blob = await ctx.storage.get(artifact.storageRef as Id<'_storage'>)
  if (!blob) {
    throwCmsError('BACKUP_STORAGE_MISSING', 'Recovery artifact bytes are missing.', { artifactId })
  }
  const archiveJson = await blob.text()
  if ((await sha256Text(archiveJson)) !== artifact.checksum) {
    throwCmsError('BACKUP_CHECKSUM_MISMATCH', 'Recovery artifact checksum is invalid.', {
      artifactId,
    })
  }
  const archive = decodeAssetRecoveryArchive(archiveJson, artifactId)
  const bytes = base64ToBytes(archive.bytesBase64)
  if (
    bytes.byteLength !== archive.manifest.byteSize ||
    (await sha256Bytes(bytes)) !== archive.manifest.bytesSha256 ||
    (await sha256Text(canonicalJson(archive.asset))) !== archive.manifest.assetSha256 ||
    archive.asset.originalAssetId !== artifact.assetId
  ) {
    throwCmsError('BACKUP_DATA_CHECKSUM_MISMATCH', 'Recovery artifact payload is corrupt.', {
      artifactId,
    })
  }
  return { artifact, archive, archiveJson, bytes }
}

export const readAssetForRecovery = internalQuery({
  args: { assetId: v.string() },
  returns: v.union(v.object({ storageId: v.string(), snapshot: assetSnapshotValidator }), v.null()),
  handler: async (ctx, args) => {
    const assetId = ctx.db.normalizeId('assets', args.assetId)
    const asset = assetId ? await ctx.db.get(assetId) : null
    return asset ? { storageId: String(asset.storageId), snapshot: assetSnapshot(asset) } : null
  },
})

export const getAssetRecoveryArtifact = internalQuery({
  args: { artifactId: v.string() },
  returns: assetRecoveryArtifactValidator,
  handler: async (ctx, args) => {
    return await ctx.db
      .query('assetRecoveryArtifacts')
      .withIndex('by_artifact', (query) => query.eq('artifactId', args.artifactId))
      .first()
  },
})

export const recordAssetRecoveryArtifact = internalMutation({
  args: {
    artifactId: v.string(),
    assetId: v.string(),
    collection: v.union(v.string(), v.null()),
    entryId: v.union(v.string(), v.null()),
    checksum: v.string(),
    storageRef: v.string(),
    appIdentityId: v.string(),
    now: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.insert('assetRecoveryArtifacts', {
      artifactId: args.artifactId,
      collection: args.collection,
      entryId: args.entryId ? (args.entryId as Id<'entries'>) : null,
      assetId: args.assetId,
      checksum: args.checksum,
      storageRef: args.storageRef,
      createdBy: args.appIdentityId,
      createdAt: args.now,
    })
    await logActivity(ctx, {
      kind: 'asset.recovery-exported',
      summary: 'Created verified asset recovery artifact',
      appIdentityId: args.appIdentityId,
      collection: args.collection,
      entryId: args.entryId ? (args.entryId as Id<'entries'>) : null,
      detail: { artifactId: args.artifactId, assetId: args.assetId },
      createdAt: args.now,
    })
    return null
  },
})

export const restoreAssetFromRecovery = internalMutation({
  args: {
    artifactId: v.string(),
    asset: assetSnapshotValidator,
    restoredStorageRef: v.string(),
    appIdentityId: v.string(),
    now: v.number(),
  },
  returns: v.object({ assetId: v.string(), originalAssetId: v.string() }),
  handler: async (ctx, args) => {
    const originalId = ctx.db.normalizeId('assets', args.asset.originalAssetId)
    if (originalId && (await ctx.db.get(originalId))) {
      throwCmsError('BACKUP_RESTORE_TARGET_EXISTS', 'The backed-up asset still exists.', {
        artifactId: args.artifactId,
        assetId: args.asset.originalAssetId,
      })
    }
    if (args.asset.collection && !(await getCollection(ctx, args.asset.collection))) {
      throwCmsError(
        'BACKUP_RESTORE_DANGLING_COLLECTION_ASSET',
        'The asset collection is absent from the installed contract.',
        { artifactId: args.artifactId, collection: args.asset.collection },
      )
    }
    const entryId = args.asset.entryId ? ctx.db.normalizeId('entries', args.asset.entryId) : null
    if (args.asset.entryId && !entryId) {
      throwCmsError('BACKUP_RESTORE_DANGLING_ENTRY_ASSET', 'The asset entry id is invalid.')
    }
    const entry = entryId ? await ctx.db.get(entryId) : null
    if (args.asset.scope === 'entry' && (!entry || entry.collection !== args.asset.collection)) {
      throwCmsError(
        'BACKUP_RESTORE_DANGLING_ENTRY_ASSET',
        'The entry-scoped asset owner is unavailable.',
        { artifactId: args.artifactId, entryId: args.asset.entryId },
      )
    }
    const assetId = await ctx.db.insert('assets', {
      storageId: args.restoredStorageRef as Id<'_storage'>,
      filename: args.asset.filename,
      mimeType: args.asset.mimeType,
      size: args.asset.size,
      sha256: args.asset.sha256,
      width: args.asset.width,
      height: args.asset.height,
      frames: args.asset.frames,
      alt: args.asset.alt as Doc<'assets'>['alt'],
      caption: args.asset.caption as Doc<'assets'>['caption'],
      scope: args.asset.scope,
      entryId,
      collection: args.asset.collection,
      tags: args.asset.tags,
      createdBy: args.asset.createdBy,
      updatedBy: args.appIdentityId,
      createdAt: args.asset.createdAt,
      updatedAt: args.now,
      deletedAt: null,
      deletedBy: null,
    })
    await logActivity(ctx, {
      kind: 'asset.recovered',
      summary: 'Restored asset bytes from verified recovery artifact',
      appIdentityId: args.appIdentityId,
      collection: args.asset.collection,
      entryId,
      detail: {
        artifactId: args.artifactId,
        originalAssetId: args.asset.originalAssetId,
        restoredAssetId: String(assetId),
      },
      createdAt: args.now,
    })
    return { assetId: String(assetId), originalAssetId: args.asset.originalAssetId }
  },
})

export const createAssetRecoveryArtifact = callerAction.protected({
  id: 'assetRecovery:createAssetRecoveryArtifact',
  args: { assetId: v.string() },
  guard: canManageAssetRecovery,
  returns: v.object({
    artifactId: v.string(),
    assetId: v.string(),
    checksum: v.string(),
    storageRef: v.string(),
  }),
  handler: async (ctx, args) => {
    const appIdentity = await ctx.appIdentity()
    const actionCtx = ctx as unknown as AssetRecoveryActionCtx
    const source = (await ctx.runQuery(
      assetRecoveryApi.assetRecovery.readAssetForRecovery,
      { assetId: args.assetId },
    )) as { storageId: string; snapshot: AssetSnapshot } | null
    if (!source) throwCmsError('ASSET_NOT_FOUND', 'Asset not found.', { assetId: args.assetId })
    const blob = await ctx.storage.get(source.storageId as Id<'_storage'>)
    if (!blob) {
      throwCmsError('ASSET_STORAGE_MISSING', 'Asset storage bytes are missing.', {
        assetId: args.assetId,
      })
    }
    if (blob.size > MAX_ASSET_BYTES) {
      throwCmsError('BACKUP_SIZE_LIMIT_EXCEEDED', 'Asset exceeds the recovery byte limit.')
    }
    const bytes = new Uint8Array(await blob.arrayBuffer())
    const bytesSha256 = await sha256Bytes(bytes)
    if (bytes.byteLength !== source.snapshot.size || bytesSha256 !== source.snapshot.sha256) {
      throwCmsError('BACKUP_ASSET_FACTS_MISMATCH', 'Stored bytes do not match asset facts.', {
        assetId: args.assetId,
      })
    }
    const now = Date.now()
    const archive: AssetRecoveryArchive = {
      format: RECOVERY_FORMAT,
      version: RECOVERY_VERSION,
      exportedAt: now,
      asset: source.snapshot,
      manifest: {
        byteSize: bytes.byteLength,
        bytesSha256,
        assetSha256: await sha256Text(canonicalJson(source.snapshot)),
        assetUpdatedAt: source.snapshot.updatedAt ?? source.snapshot.createdAt,
      },
      bytesBase64: bytesToBase64(bytes),
    }
    const archiveJson = canonicalJson(archive)
    if (byteLength(archiveJson) > MAX_ARCHIVE_BYTES) {
      throwCmsError('BACKUP_SIZE_LIMIT_EXCEEDED', 'Recovery artifact exceeds its byte limit.')
    }
    const checksum = await sha256Text(archiveJson)
    const storageRef = await ctx.storage.store(
      new Blob([archiveJson], { type: 'application/vnd.ginko-cms.asset-recovery+json' }),
    )
    try {
      const stored = await ctx.storage.get(storageRef)
      if (!stored || (await sha256Text(await stored.text())) !== checksum) {
        throwCmsError(
          'BACKUP_STORAGE_VERIFY_FAILED',
          'Stored recovery artifact failed verification.',
        )
      }
      const artifactId = `asset_recovery_${now}_${globalThis.crypto.randomUUID()}`
      await actionCtx.runMutation(assetRecoveryApi.assetRecovery.recordAssetRecoveryArtifact, {
        artifactId,
        assetId: args.assetId,
        collection: source.snapshot.collection,
        entryId: source.snapshot.entryId,
        checksum,
        storageRef,
        appIdentityId: appIdentity.userId,
        now,
      })
      return {
        artifactId,
        assetId: args.assetId,
        checksum,
        storageRef: String(storageRef),
      }
    } catch (error) {
      await ctx.storage.delete(storageRef)
      throw error
    }
  },
})

export const verifyAssetRecoveryArtifact = callerAction.protected({
  id: 'assetRecovery:verifyAssetRecoveryArtifact',
  args: { artifactId: v.string() },
  guard: canManageAssetRecovery,
  returns: v.object({
    ok: v.boolean(),
    checksumMatches: v.boolean(),
    currentDataMatches: v.boolean(),
    artifactId: v.string(),
  }),
  handler: async (ctx, args) => {
    const { archive } = await loadVerifiedArchive(
      ctx as unknown as AssetRecoveryActionCtx,
      args.artifactId,
    )
    const current = (await ctx.runQuery(
      assetRecoveryApi.assetRecovery.readAssetForRecovery,
      { assetId: archive.asset.originalAssetId },
    )) as { snapshot: AssetSnapshot } | null
    const currentDataMatches =
      current !== null && canonicalJson(current.snapshot) === canonicalJson(archive.asset)
    return {
      ok: currentDataMatches,
      checksumMatches: true,
      currentDataMatches,
      artifactId: args.artifactId,
    }
  },
})

export const downloadAssetRecoveryArtifact = callerAction.protected({
  id: 'assetRecovery:downloadAssetRecoveryArtifact',
  args: { artifactId: v.string() },
  guard: canManageAssetRecovery,
  returns: v.object({ artifactId: v.string(), checksum: v.string(), archiveJson: v.string() }),
  handler: async (ctx, args) => {
    const { artifact, archiveJson } = await loadVerifiedArchive(
      ctx as unknown as AssetRecoveryActionCtx,
      args.artifactId,
    )
    return { artifactId: artifact.artifactId, checksum: artifact.checksum, archiveJson }
  },
})

async function assetRestoreBlockers(
  ctx: AssetRecoveryActionCtx,
  artifactId: string,
): Promise<{
  artifact: Doc<'assetRecoveryArtifacts'>
  archive: AssetRecoveryArchive
  checksum: string
  blockers: Array<{ code: string; message: string }>
}> {
  const { artifact, archive } = await loadVerifiedArchive(ctx, artifactId)
  const blockers: Array<{ code: string; message: string }> = []
  const current = (await ctx.runQuery(
    assetRecoveryApi.assetRecovery.readAssetForRecovery,
    { assetId: archive.asset.originalAssetId },
  )) as { snapshot: AssetSnapshot } | null
  if (current) blockers.push({ code: 'restore-target-exists', message: 'The asset still exists.' })
  return { artifact, archive, checksum: artifact.checksum, blockers }
}

export const previewRestoreAsset = callerAction.protected({
  id: 'assetRecovery:previewRestoreAsset',
  args: { artifactId: v.string() },
  guard: canManageAssetRecovery,
  returns: restorePreviewValidator,
  handler: async (ctx, args) => {
    const result = await assetRestoreBlockers(
      ctx as unknown as AssetRecoveryActionCtx,
      args.artifactId,
    )
    return {
      artifactId: args.artifactId,
      checksum: result.checksum,
      applySupported: result.blockers.length === 0,
      blockers: result.blockers,
      warnings: [],
    }
  },
})

export const restoreAsset = callerAction.protected({
  id: 'assetRecovery:restoreAsset',
  args: { artifactId: v.string(), expectedChecksum: v.string() },
  guard: canManageAssetRecovery,
  returns: v.object({
    artifactId: v.string(),
    restoredAssetId: v.string(),
    originalAssetId: v.string(),
  }),
  handler: async (ctx, args) => {
    const appIdentity = await ctx.appIdentity()
    const actionCtx = ctx as unknown as AssetRecoveryActionCtx
    const result = await assetRestoreBlockers(actionCtx, args.artifactId)
    if (args.expectedChecksum !== result.checksum) {
      throwCmsError(
        'BACKUP_RESTORE_CHECKSUM_CONFIRMATION_MISMATCH',
        'Restore checksum confirmation does not match the recovery artifact.',
      )
    }
    if (result.blockers.length) {
      throwCmsError('BACKUP_RESTORE_BLOCKED', 'Asset recovery is blocked.', {
        blockers: result.blockers,
      })
    }
    const verified = await loadVerifiedArchive(actionCtx, args.artifactId)
    const storageRef = await ctx.storage.store(
      new Blob([Uint8Array.from(verified.bytes).buffer], {
        type: verified.archive.asset.mimeType,
      }),
    )
    try {
      const stored = await ctx.storage.get(storageRef)
      if (
        !stored ||
        (await sha256Bytes(new Uint8Array(await stored.arrayBuffer()))) !==
          verified.archive.asset.sha256
      ) {
        throwCmsError('BACKUP_RESTORE_BYTE_MISMATCH', 'Restored asset bytes failed verification.')
      }
      const restored = (await actionCtx.runMutation(
        assetRecoveryApi.assetRecovery.restoreAssetFromRecovery,
        {
        artifactId: args.artifactId,
        asset: verified.archive.asset,
        restoredStorageRef: storageRef,
        appIdentityId: appIdentity.userId,
        now: Date.now(),
        },
      )) as { assetId: string; originalAssetId: string }
      return {
        artifactId: args.artifactId,
        restoredAssetId: restored.assetId,
        originalAssetId: restored.originalAssetId,
      }
    } catch (error) {
      await ctx.storage.delete(storageRef)
      throw error
    }
  },
})

const deleteAssetRecoveryArtifactArgs = { artifactId: v.string() }

export const deleteAssetRecoveryArtifactOperation = defineCmsOperation({
  id: 'ginko-cms.delete-asset-recovery-artifact',
  kind: 'destructive',
  executeFunctionRef: 'assetRecovery:deleteAssetRecoveryArtifactOperationExecute',
  args: deleteAssetRecoveryArtifactArgs,
  guard: canManageAssetRecovery,
  returns: v.null(),
  previewReturns: previewResultValidator(),
  load: async (ctx, args) => ({
    artifact: await ctx.db
      .query('assetRecoveryArtifacts')
      .withIndex('by_artifact', (query) => query.eq('artifactId', args.artifactId))
      .first(),
  }),
  preview: async (_ctx, args, { artifact }) =>
    artifact
      ? buildPreview({
          summary: `Will delete asset recovery artifact "${artifact.artifactId}".`,
          warnings: [
            operationIssue({
              code: 'asset-recovery-delete',
              message: 'A fresh verified artifact will be required before permanent asset purge.',
            }),
          ],
          details: { artifactId: artifact.artifactId, assetId: artifact.assetId ?? null },
          confirm: { operationId: 'ginko-cms.delete-asset-recovery-artifact', args },
          version: { createdAt: artifact.createdAt, checksum: artifact.checksum },
        })
      : buildPreview({
          allowed: false,
          summary: 'Asset recovery artifact was not found.',
          blockers: [
            operationIssue({
              code: 'asset-recovery-artifact-not-found',
              message: 'Asset recovery artifact was not found.',
            }),
          ],
          confirm: { operationId: 'ginko-cms.delete-asset-recovery-artifact', args },
        }),
  handler: async (ctx, args, { artifact }) => {
    if (!artifact) {
      throwCmsError('BACKUP_NOT_FOUND', 'Asset recovery artifact was not found.', {
        artifactId: args.artifactId,
      })
    }
    const appIdentity = await ctx.appIdentity()
    await ctx.storage.delete(artifact.storageRef as Id<'_storage'>)
    await ctx.db.delete(artifact._id)
    await logActivity(ctx, {
      kind: 'asset.recovery-deleted',
      summary: 'Deleted asset recovery artifact',
      appIdentityId: appIdentity.userId,
      collection: artifact.collection ?? null,
      entryId: artifact.entryId ?? null,
      detail: { artifactId: artifact.artifactId, assetId: artifact.assetId ?? null },
    })
    return null
  },
})

export const deleteAssetRecoveryArtifactOperationExecute = callerMutation.protected(
  deleteAssetRecoveryArtifactOperation,
)

export const previewDeleteAssetRecoveryArtifactOperation = callerMutation.protected(
  Object.assign(definePreview(deleteAssetRecoveryArtifactOperation), {
    id: 'assetRecovery:previewDeleteAssetRecoveryArtifactOperation',
  }),
)

export const validateAssetRecoveryArtifactForPurge = internalQuery({
  args: { artifactId: v.string(), assetId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await assertAssetRecoveryArtifactCoversPurge(ctx, args.artifactId, args.assetId)
    return null
  },
})

export async function assertAssetRecoveryArtifactCoversPurge(
  ctx: QueryOrMutationCtx,
  artifactId: string,
  assetIdValue: string,
): Promise<void> {
  const artifact = await ctx.db
    .query('assetRecoveryArtifacts')
    .withIndex('by_artifact', (query) => query.eq('artifactId', artifactId))
    .first()
  if (
    !artifact ||
    artifact.assetId !== assetIdValue ||
    !/^[a-f0-9]{64}$/.test(artifact.checksum) ||
    !artifact.storageRef
  ) {
    throwCmsError(
      'BACKUP_SCOPE_MISMATCH',
      'A current verified recovery artifact for this asset is required.',
      { artifactId, assetId: assetIdValue },
    )
  }
  const assetId = ctx.db.normalizeId('assets', assetIdValue)
  const asset = assetId ? await ctx.db.get(assetId) : null
  if (!asset) throwCmsError('ASSET_NOT_FOUND', 'Asset not found.', { assetId: assetIdValue })
  const updatedAt = asset.updatedAt ?? asset.createdAt
  if (artifact.createdAt < updatedAt) {
    throwCmsError('BACKUP_STALE_FOR_PURGE', 'Asset recovery artifact is stale.', {
      artifactId,
      artifactCreatedAt: artifact.createdAt,
      assetUpdatedAt: updatedAt,
    })
  }
}
