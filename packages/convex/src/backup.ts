import { jsonObjectValidator } from '@lupinum/ginko-cms-contract/convex/validators.js'
import type { JsonValue } from '@lupinum/ginko-cms-contract/shared/types.js'
import { anyApi } from 'convex/server'
import type { FunctionReference } from 'convex/server'
import { v } from 'convex/values'

import type { Doc, Id } from './_generated/dataModel.js'
import { internalMutation, internalQuery } from './_generated/server.js'
import { hasRole } from './auth/checks.js'
import { throwCmsError } from './errors.js'
import { callerAction, callerMutation } from './functions.js'
import { logActivity } from './lib/activity.js'
import { asCollectionId, asEntryId } from './lib/ids.js'
import type { MutationCtx, QueryOrMutationCtx } from './lib/types.js'
import {
  defineOperation,
  operationIssue,
  operationPreview,
  operationPreviewValidator,
  previewOf,
} from './operationHelpers.js'

const BACKUP_ARCHIVE_VERSION = 1
const BACKUP_DRIVER = 'convex-storage-json'
type AnyInternalQuery = FunctionReference<'query', 'internal', Record<string, unknown>, unknown>
type AnyInternalMutation = FunctionReference<
  'mutation',
  'internal',
  Record<string, unknown>,
  unknown
>

const backupApi = anyApi as unknown as {
  backup: {
    collectBackupData: AnyInternalQuery
    getBackupArtifact: AnyInternalQuery
    recordBackupArtifact: AnyInternalMutation
  }
}

const backupScopeValidator = v.union(
  v.literal('full'),
  v.literal('collection'),
  v.literal('entry'),
  v.literal('asset'),
)

const backupScopeArgs = {
  scope: backupScopeValidator,
  collectionId: v.optional(v.string()),
  entryId: v.optional(v.string()),
  assetId: v.optional(v.string()),
}

const backupCountsValidator = v.object({
  entries: v.number(),
  revisions: v.number(),
  assets: v.number(),
  members: v.number(),
})

const backupDataValidator = v.record(v.string(), v.array(jsonObjectValidator))

const backupArtifactValidator = v.union(
  v.object({
    _id: v.string(),
    _creationTime: v.number(),
    artifactId: v.string(),
    scope: backupScopeValidator,
    collectionId: v.optional(v.union(v.string(), v.null())),
    entryId: v.optional(v.union(v.string(), v.null())),
    assetId: v.optional(v.union(v.string(), v.null())),
    checksum: v.string(),
    driver: v.string(),
    storageRef: v.string(),
    counts: backupCountsValidator,
    createdBy: v.string(),
    createdAt: v.number(),
  }),
  v.null(),
)

type BackupScope = 'full' | 'collection' | 'entry' | 'asset'

type BackupScopeInput = {
  scope: BackupScope
  collectionId?: string
  entryId?: string
  assetId?: string
}

type JsonRecord = Record<string, JsonValue>
type BackupActionCtx = {
  runQuery: (ref: AnyInternalQuery, args: BackupScopeInput) => Promise<unknown>
  storage: {
    get: (id: Id<'_storage'>) => Promise<Blob | null>
    store: (blob: Blob) => Promise<Id<'_storage'>>
  }
}

type BackupArchive = {
  version: typeof BACKUP_ARCHIVE_VERSION
  exportedAt: number
  scope: BackupScopeInput
  dataChecksum: string
  counts: {
    entries: number
    revisions: number
    assets: number
    members: number
  }
  data: Record<string, JsonRecord[]>
  assetBytes: Record<string, number[]>
}

function normalizeScope(args: BackupScopeInput): BackupScopeInput {
  if (args.scope === 'full') return { scope: 'full' }
  if (args.scope === 'collection') {
    if (!args.collectionId) {
      throwCmsError('BACKUP_SCOPE_INVALID', 'collection export requires collectionId.')
    }
    return { scope: 'collection', collectionId: args.collectionId }
  }
  if (args.scope === 'entry') {
    if (!args.entryId) {
      throwCmsError('BACKUP_SCOPE_INVALID', 'entry export requires entryId.')
    }
    return { scope: 'entry', entryId: args.entryId }
  }
  if (!args.assetId) {
    throwCmsError('BACKUP_SCOPE_INVALID', 'asset export requires assetId.')
  }
  return { scope: 'asset', assetId: args.assetId }
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(',')}]`
  const object = value as Record<string, unknown>
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`)
    .join(',')}}`
}

async function sha256Hex(value: string) {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

function artifactIdFor(now: number) {
  const random =
    typeof globalThis.crypto.randomUUID === 'function'
      ? globalThis.crypto.randomUUID()
      : Math.random().toString(36).slice(2)
  return `backup_${now}_${random}`
}

async function readStorageBytes(
  ctx: { storage: { get: (id: Id<'_storage'>) => Promise<Blob | null> } },
  storageId: string,
) {
  const blob = await ctx.storage.get(storageId as Id<'_storage'>)
  if (!blob) return null
  return Array.from(new Uint8Array(await blob.arrayBuffer()))
}

async function buildArchive(ctx: BackupActionCtx, scope: BackupScopeInput) {
  const data = (await ctx.runQuery(backupApi.backup.collectBackupData, scope)) as Record<
    string,
    JsonRecord[]
  >
  const assetBytes: Record<string, number[]> = {}
  for (const asset of data.assets ?? []) {
    const assetId = String(asset._id)
    const storageId = typeof asset.storageId === 'string' ? asset.storageId : null
    if (!storageId) continue
    const bytes = await readStorageBytes(ctx, storageId)
    if (bytes) assetBytes[assetId] = bytes
  }

  const counts = {
    entries: data.entries?.length ?? 0,
    revisions: data.entryRevisions?.length ?? 0,
    assets: data.assets?.length ?? 0,
    members: data.members?.length ?? 0,
  }
  const dataChecksum = await sha256Hex(canonicalJson({ data, assetBytes }))
  return {
    version: BACKUP_ARCHIVE_VERSION,
    exportedAt: Date.now(),
    scope,
    dataChecksum,
    counts,
    data,
    assetBytes,
  } satisfies BackupArchive
}

function assertArtifactScopeCovers(
  artifact: {
    scope: BackupScope
    collectionId?: Id<'collections'> | null
    entryId?: Id<'entries'> | null
    assetId?: string | null
  },
  target: BackupScopeInput,
) {
  if (artifact.scope === 'full') return
  if (target.scope === 'collection') {
    if (
      artifact.scope === 'collection' &&
      artifact.collectionId &&
      String(artifact.collectionId) === target.collectionId
    ) {
      return
    }
  }
  if (target.scope === 'entry') {
    if (
      artifact.scope === 'entry' &&
      artifact.entryId &&
      String(artifact.entryId) === target.entryId
    ) {
      return
    }
  }
  if (target.scope === 'asset') {
    if (artifact.scope === 'asset' && artifact.assetId === target.assetId) return
  }
  throwCmsError('BACKUP_SCOPE_MISMATCH', 'Backup artifact does not cover this purge target.', {
    artifactScope: artifact.scope,
    targetScope: target.scope,
  })
}

async function collectBackupDataForScope(ctx: QueryOrMutationCtx, rawArgs: BackupScopeInput) {
  const args = normalizeScope(rawArgs)
  const data: Record<string, JsonRecord[]> = {}
  const collectTable = async (table: string) => {
    data[table] = (await ctx.db.query(table as never).collect()) as JsonRecord[]
  }

  if (args.scope === 'full') {
    for (const table of [
      'collections',
      'entries',
      'entryDrafts',
      'entryRevisions',
      'publicEntries',
      'publicRoutes',
      'contentAssetRefs',
      'assets',
      'redirects',
      'members',
      'siteData',
      'cmsSettings',
    ]) {
      await collectTable(table)
    }
    data.activity = (await ctx.db.query('activity').collect()).filter(
      (row) => row.kind !== 'backup.exported',
    ) as JsonRecord[]
    return data
  }

  if (args.scope === 'collection') {
    const collectionId = asCollectionId(args.collectionId ?? '')
    data.collections = (await ctx.db
      .query('collections')
      .filter((q) => q.eq(q.field('_id'), collectionId))
      .collect()) as JsonRecord[]
    const entries = await ctx.db
      .query('entries')
      .withIndex('by_collection_status', (q) => q.eq('collectionId', collectionId))
      .collect()
    data.entries = entries as JsonRecord[]
    const entryIds = new Set(entries.map((entry) => String(entry._id)))
    data.entryDrafts = (await ctx.db.query('entryDrafts').collect()).filter((row) =>
      entryIds.has(String(row.entryId)),
    ) as JsonRecord[]
    data.entryRevisions = (await ctx.db.query('entryRevisions').collect()).filter((row) =>
      entryIds.has(String(row.entryId)),
    ) as JsonRecord[]
    data.publicEntries = (await ctx.db.query('publicEntries').collect()).filter((row) =>
      entryIds.has(String(row.entryId)),
    ) as JsonRecord[]
    data.publicRoutes = (await ctx.db.query('publicRoutes').collect()).filter((row) =>
      entryIds.has(String(row.entryId)),
    ) as JsonRecord[]
    data.contentAssetRefs = (await ctx.db.query('contentAssetRefs').collect()).filter((row) =>
      entryIds.has(String(row.entryId)),
    ) as JsonRecord[]
    data.assets = (await ctx.db
      .query('assets')
      .withIndex('by_collection', (q) => q.eq('collectionId', collectionId))
      .collect()) as JsonRecord[]
    return data
  }

  if (args.scope === 'entry') {
    const entryId = asEntryId(args.entryId ?? '')
    const entry = await ctx.db.get(entryId)
    data.entries = entry ? ([entry] as JsonRecord[]) : []
    data.entryDrafts = (await ctx.db
      .query('entryDrafts')
      .withIndex('by_entry', (q) => q.eq('entryId', entryId))
      .collect()) as JsonRecord[]
    data.entryRevisions = (await ctx.db
      .query('entryRevisions')
      .withIndex('by_entry_createdAt', (q) => q.eq('entryId', entryId))
      .collect()) as JsonRecord[]
    data.publicEntries = (await ctx.db
      .query('publicEntries')
      .withIndex('by_entry_locale', (q) => q.eq('entryId', entryId))
      .collect()) as JsonRecord[]
    data.publicRoutes = (await ctx.db
      .query('publicRoutes')
      .withIndex('by_entry_locale', (q) => q.eq('entryId', entryId))
      .collect()) as JsonRecord[]
    data.contentAssetRefs = (await ctx.db
      .query('contentAssetRefs')
      .withIndex('by_entry', (q) => q.eq('entryId', entryId))
      .collect()) as JsonRecord[]
    data.assets = (await ctx.db
      .query('assets')
      .withIndex('by_entry', (q) => q.eq('entryId', entryId))
      .collect()) as JsonRecord[]
    return data
  }

  const asset = await ctx.db.get(args.assetId as Id<'assets'>)
  data.assets = asset ? ([asset] as JsonRecord[]) : []
  return data
}

async function recordBackupArtifactDirectly(
  ctx: MutationCtx,
  args: {
    artifactId: string
    scope: BackupScope
    collectionId?: string
    entryId?: string
    assetId?: string
    checksum: string
    storageRef: string
    counts: BackupArchive['counts']
    appIdentityId: string
    now: number
  },
) {
  await ctx.db.insert('backupArtifacts', {
    artifactId: args.artifactId,
    scope: args.scope,
    collectionId: args.collectionId ? asCollectionId(args.collectionId) : null,
    entryId: args.entryId ? asEntryId(args.entryId) : null,
    assetId: args.assetId ?? null,
    checksum: args.checksum,
    driver: BACKUP_DRIVER,
    storageRef: args.storageRef,
    counts: args.counts,
    createdBy: args.appIdentityId,
    createdAt: args.now,
  })
  await logActivity(ctx, {
    kind: 'backup.exported',
    summary: `Exported ${args.scope} backup`,
    appIdentityId: args.appIdentityId,
    collectionId: args.collectionId ? asCollectionId(args.collectionId) : null,
    entryId: args.entryId ? asEntryId(args.entryId) : null,
    detail: { artifactId: args.artifactId, counts: args.counts },
  })
}

export const collectBackupData = internalQuery({
  args: backupScopeArgs,
  returns: backupDataValidator,
  handler: async (ctx, rawArgs) => await collectBackupDataForScope(ctx, rawArgs),
})

export const getBackupArtifact = internalQuery({
  args: { artifactId: v.string() },
  returns: backupArtifactValidator,
  handler: async (ctx, args) => await getBackupArtifactByArtifactId(ctx, args.artifactId),
})

async function getBackupArtifactByArtifactId(ctx: QueryOrMutationCtx, artifactId: string) {
  return await ctx.db
    .query('backupArtifacts')
    .withIndex('by_artifact', (q) => q.eq('artifactId', artifactId))
    .first()
}

export const recordBackupArtifact = internalMutation({
  args: {
    artifactId: v.string(),
    scope: backupScopeValidator,
    collectionId: v.optional(v.string()),
    entryId: v.optional(v.string()),
    assetId: v.optional(v.string()),
    checksum: v.string(),
    storageRef: v.string(),
    counts: v.object({
      entries: v.number(),
      revisions: v.number(),
      assets: v.number(),
      members: v.number(),
    }),
    appIdentityId: v.string(),
    now: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await recordBackupArtifactDirectly(ctx, args)
    return null
  },
})

export const exportBackup = callerAction.protected({
  id: 'backup:exportBackup',
  args: backupScopeArgs,
  guard: hasRole('owner'),
  returns: v.object({
    artifactId: v.string(),
    checksum: v.string(),
    storageRef: v.string(),
    counts: v.object({
      entries: v.number(),
      revisions: v.number(),
      assets: v.number(),
      members: v.number(),
    }),
  }),
  handler: async (ctx, rawArgs) => {
    const appIdentity = await ctx.appIdentity()
    const now = Date.now()
    const scope = normalizeScope(rawArgs)
    const archive = await buildArchive(ctx as unknown as BackupActionCtx, scope)
    const archiveJson = canonicalJson(archive)
    const checksum = await sha256Hex(archiveJson)
    const storageRef = await ctx.storage.store(
      new Blob([archiveJson], { type: 'application/vnd.ginko-cms.backup+json' }),
    )
    const artifactId = artifactIdFor(now)
    await ctx.runMutation(backupApi.backup.recordBackupArtifact, {
      ...scope,
      artifactId,
      checksum,
      storageRef,
      counts: archive.counts,
      appIdentityId: appIdentity.userId,
      now,
    })
    return {
      artifactId,
      checksum,
      storageRef,
      counts: archive.counts,
    }
  },
})

export const verifyBackup = callerAction.protected({
  id: 'backup:verifyBackup',
  args: { artifactId: v.string() },
  guard: hasRole('owner'),
  returns: v.object({
    ok: v.boolean(),
    checksumMatches: v.boolean(),
    currentDataMatches: v.boolean(),
    artifactId: v.string(),
  }),
  handler: async (ctx, args) => {
    const artifact = (await ctx.runQuery(backupApi.backup.getBackupArtifact, {
      artifactId: args.artifactId,
    })) as {
      artifactId: string
      checksum: string
      storageRef: string
      scope: BackupScope
      collectionId?: string | null
      entryId?: string | null
      assetId?: string | null
    } | null
    if (!artifact) {
      throwCmsError('BACKUP_NOT_FOUND', 'Backup artifact not found.', {
        artifactId: args.artifactId,
      })
    }
    const blob = await ctx.storage.get(artifact.storageRef as Id<'_storage'>)
    if (!blob) {
      throwCmsError('BACKUP_STORAGE_MISSING', 'Backup archive bytes are missing.', {
        artifactId: args.artifactId,
      })
    }
    const archiveJson = await blob.text()
    const checksumMatches = (await sha256Hex(archiveJson)) === artifact.checksum
    const archive = JSON.parse(archiveJson) as BackupArchive
    const current = await buildArchive(ctx as unknown as BackupActionCtx, {
      scope: artifact.scope,
      collectionId: artifact.collectionId ? String(artifact.collectionId) : undefined,
      entryId: artifact.entryId ? String(artifact.entryId) : undefined,
      assetId: artifact.assetId ?? undefined,
    })
    const currentDataMatches = current.dataChecksum === archive.dataChecksum
    return {
      ok: checksumMatches && currentDataMatches,
      checksumMatches,
      currentDataMatches,
      artifactId: artifact.artifactId,
    }
  },
})

export const downloadBackup = callerAction.protected({
  id: 'backup:downloadBackup',
  args: { artifactId: v.string() },
  guard: hasRole('owner'),
  returns: v.object({
    artifactId: v.string(),
    checksum: v.string(),
    archiveJson: v.string(),
  }),
  handler: async (ctx, args) => {
    const artifact = (await ctx.runQuery(backupApi.backup.getBackupArtifact, {
      artifactId: args.artifactId,
    })) as { artifactId: string; checksum: string; storageRef: string } | null
    if (!artifact) {
      throwCmsError('BACKUP_NOT_FOUND', 'Backup artifact not found.', {
        artifactId: args.artifactId,
      })
    }
    const blob = await ctx.storage.get(artifact.storageRef as Id<'_storage'>)
    if (!blob) {
      throwCmsError('BACKUP_STORAGE_MISSING', 'Backup archive bytes are missing.', {
        artifactId: args.artifactId,
      })
    }
    const archiveJson = await blob.text()
    const checksum = await sha256Hex(archiveJson)
    if (checksum !== artifact.checksum) {
      throwCmsError('BACKUP_CHECKSUM_MISMATCH', 'Backup archive checksum does not match artifact.')
    }
    return {
      artifactId: artifact.artifactId,
      checksum,
      archiveJson,
    }
  },
})

const deleteBackupArtifactArgs = {
  artifactId: v.string(),
}

export const deleteBackupArtifactOperation = defineOperation({
  id: 'ginko-cms.delete-backup-artifact',
  name: 'delete-backup-artifact',
  kind: 'destructive',
  executeFunctionRef: 'backup:deleteBackupArtifactOperationExecute',
  args: deleteBackupArtifactArgs,
  guard: hasRole('owner'),
  returns: v.null(),
  previewReturns: operationPreviewValidator(),
  load: async (ctx, args) => {
    const artifact = await getBackupArtifactByArtifactId(ctx, args.artifactId)
    return { artifact }
  },
  preview: async (_ctx, args, { artifact }) => {
    if (!artifact) {
      return operationPreview({
        allowed: false,
        summary: `Backup artifact "${args.artifactId}" was not found.`,
        blockers: [
          operationIssue({
            code: 'backup-artifact-not-found',
            message: `Backup artifact "${args.artifactId}" was not found.`,
          }),
        ],
        confirm: { operationId: 'ginko-cms.delete-backup-artifact', args },
      })
    }

    return operationPreview({
      summary: `Will delete backup artifact "${artifact.artifactId}".`,
      warnings: [
        operationIssue({
          code: 'backup-artifact-delete',
          message:
            'Deleting this backup can block future permanent entry or asset purges until a fresh matching backup is exported.',
        }),
      ],
      details: {
        artifactId: artifact.artifactId,
        scope: artifact.scope,
        createdAt: artifact.createdAt,
        counts: artifact.counts,
      },
      confirm: {
        operationId: 'ginko-cms.delete-backup-artifact',
        args,
        effect: {
          artifactId: artifact.artifactId,
          scope: artifact.scope,
        },
      },
      version: {
        createdAt: artifact.createdAt,
        checksum: artifact.checksum,
      },
    })
  },
  handler: async (ctx, args, { artifact }) => {
    const appIdentity = await ctx.appIdentity()
    if (!artifact) {
      throwCmsError('BACKUP_NOT_FOUND', 'Backup artifact not found.', {
        artifactId: args.artifactId,
      })
    }

    await ctx.storage.delete(artifact.storageRef as Id<'_storage'>)
    await ctx.db.delete(artifact._id)
    await logActivity(ctx, {
      kind: 'backup.deleted',
      summary: `Deleted ${artifact.scope} backup artifact`,
      appIdentityId: appIdentity.userId,
      collectionId: artifact.collectionId ?? null,
      entryId: artifact.entryId ?? null,
      detail: {
        artifactId: artifact.artifactId,
        scope: artifact.scope,
        counts: artifact.counts,
      },
    })
    return null
  },
})

export const deleteBackupArtifactOperationExecute = callerMutation.protected(
  deleteBackupArtifactOperation,
)

export const previewDeleteBackupArtifactOperation = callerMutation.protected(
  Object.assign(previewOf(deleteBackupArtifactOperation), {
    id: 'backup:previewDeleteBackupArtifactOperation',
  }),
)

export const validateBackupArtifactForPurge = internalQuery({
  args: {
    artifactId: v.string(),
    targetScope: backupScopeValidator,
    collectionId: v.optional(v.string()),
    entryId: v.optional(v.string()),
    assetId: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await assertBackupArtifactCoversPurge(ctx, args.artifactId, {
      scope: args.targetScope,
      collectionId: args.collectionId,
      entryId: args.entryId,
      assetId: args.assetId,
    })
    return null
  },
})

export async function assertBackupArtifactCoversPurge(
  ctx: QueryOrMutationCtx,
  artifactId: string,
  target: BackupScopeInput,
) {
  const artifact = await ctx.db
    .query('backupArtifacts')
    .withIndex('by_artifact', (q) => q.eq('artifactId', artifactId))
    .first()
  if (!artifact) {
    throwCmsError('BACKUP_NOT_FOUND', 'Backup artifact not found.', { artifactId })
  }
  assertArtifactScopeCovers(artifact, target)
  await assertBackupArtifactFreshForPurge(ctx, artifact, target)
}

async function assertBackupArtifactFreshForPurge(
  ctx: QueryOrMutationCtx,
  artifact: Doc<'backupArtifacts'>,
  target: BackupScopeInput,
) {
  let updatedAt: number | null = null

  if (target.scope === 'entry' && target.entryId) {
    const entry = await ctx.db.get(target.entryId as Id<'entries'>)
    updatedAt = entry?.updatedAt ?? entry?.publishedAt ?? entry?.createdAt ?? null
  }

  if (target.scope === 'asset' && target.assetId) {
    const asset = await ctx.db.get(target.assetId as Id<'assets'>)
    updatedAt = asset?.updatedAt ?? asset?.createdAt ?? null
  }

  if (updatedAt !== null && updatedAt > artifact.createdAt) {
    throwCmsError(
      'BACKUP_STALE_FOR_PURGE',
      'Backup artifact is older than the current purge target.',
      {
        artifactId: artifact.artifactId,
        targetScope: target.scope,
        artifactCreatedAt: artifact.createdAt,
        targetUpdatedAt: updatedAt,
      },
    )
  }
}
