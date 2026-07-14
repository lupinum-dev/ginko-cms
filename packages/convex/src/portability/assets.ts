import {
  beginPortableAssetUpload as beginPortableAssetUploadArgs,
  issuePortableAssetUploadUrl as issuePortableAssetUploadUrlArgs,
  recordPortableAssetUpload as recordPortableAssetUploadArgs,
  verifyPortableAssetUpload as verifyPortableAssetUploadArgs,
} from '@lupinum/ginko-cms-contract/convex/schemas/portability.js'
import { verifyPublicImageBytes } from '@lupinum/ginko-content/cms-contract'
import { IncrementalSha256 } from '@lupinum/ginko-content/portability'
import { makeFunctionReference } from 'convex/server'
import { v } from 'convex/values'

import type { Doc, Id } from '../_generated/dataModel.js'
import { internalAction, internalMutation } from '../_generated/server.js'
import { registerVerifiedAssetRecord } from '../assets.js'
import { canManagePortability } from '../auth/checks.js'
import { callerAction, callerMutation } from '../functions.js'
import type { MutationCtx } from '../lib/types.js'
import { assertSha256 } from './model.js'

export const PORTABLE_ASSET_ATTEMPT_LEASE_MS = 5 * 60 * 1_000
const PORTABLE_ASSET_IDLE_TIMEOUT_MS = 30_000
const PORTABLE_ASSET_TOTAL_TIMEOUT_MS = 2 * 60 * 1_000
const MAX_PORTABLE_ASSET_CLEANUP_ATTEMPTS = 5

async function getRun(ctx: MutationCtx, runId: string): Promise<Doc<'portableRuns'>> {
  const run = await ctx.db
    .query('portableRuns')
    .withIndex('by_run_id', (query) => query.eq('runId', runId))
    .unique()
  if (!run) throw new Error('Portable run not found.')
  return run
}

async function getStage(ctx: MutationCtx, runId: string, sha256: string) {
  const stage = await ctx.db
    .query('portableAssetStages')
    .withIndex('by_run_sha256', (query) => query.eq('runId', runId).eq('sha256', sha256))
    .unique()
  if (!stage) throw new Error('Portable asset stage not found.')
  return stage
}

function requirePlannedRun(
  run: Doc<'portableRuns'>,
  input: { callerId: string; payloadSha256: string },
) {
  if (run.callerId !== input.callerId) throw new Error('Portable run belongs to another caller.')
  if (run.payloadSha256 !== input.payloadSha256) throw new Error('Portable run payload mismatch.')
  if (run.expiresAt <= Date.now()) throw new Error('Portable run expired.')
  if (run.state !== 'planned')
    throw new Error(`Portable run state is ${run.state}, expected planned.`)
}

function assertAttempt(
  stage: Doc<'portableAssetStages'>,
  input: { tokenHash: string; generation: number },
) {
  assertSha256(input.tokenHash, 'attemptTokenHash')
  if (stage.attemptTokenHash !== input.tokenHash || stage.attemptGeneration !== input.generation) {
    throw new Error('Portable asset upload attempt token or generation mismatch.')
  }
  if (stage.leaseExpiresAt === null || stage.leaseExpiresAt <= Date.now()) {
    throw new Error('Portable asset upload attempt lease expired.')
  }
}

export const beginPortableAssetUpload = callerMutation.protected({
  id: 'portability:beginPortableAssetUpload',
  args: beginPortableAssetUploadArgs.args,
  guard: canManagePortability,
  returns: v.union(
    v.object({
      state: v.literal('attempt'),
      runId: v.string(),
      sha256: v.string(),
      attemptGeneration: v.number(),
      leaseExpiresAt: v.number(),
    }),
    v.object({ state: v.literal('attached'), assetId: v.string() }),
  ),
  handler: async (ctx, args) => {
    const identity = await ctx.appIdentity()
    assertSha256(args.sha256, 'asset sha256')
    assertSha256(args.attemptTokenHash, 'attemptTokenHash')
    const origin = new URL(args.storageOrigin)
    if (origin.protocol !== 'https:' || origin.origin !== args.storageOrigin) {
      throw new Error('Portable storage origin must be an exact HTTPS origin.')
    }
    const run = await getRun(ctx, args.runId)
    requirePlannedRun(run, {
      callerId: identity.userId,
      payloadSha256: args.payloadSha256,
    })
    const stage = await getStage(ctx, run.runId, args.sha256)
    if (stage.callerId !== identity.userId) {
      throw new Error('Portable asset stage cannot begin an upload attempt.')
    }
    if (stage.state === 'attached' && stage.assetId) {
      return { state: 'attached' as const, assetId: stage.assetId }
    }
    if (stage.state !== 'awaiting-upload') {
      throw new Error('Portable asset stage cannot begin an upload attempt.')
    }
    const now = Date.now()
    if (stage.leaseExpiresAt !== null && stage.leaseExpiresAt > now) {
      if (
        stage.attemptTokenHash === args.attemptTokenHash &&
        stage.storageOrigin === args.storageOrigin
      ) {
        return {
          state: 'attempt' as const,
          runId: run.runId,
          sha256: stage.sha256,
          attemptGeneration: stage.attemptGeneration,
          leaseExpiresAt: stage.leaseExpiresAt,
        }
      }
      throw new Error('Portable asset upload attempt lease is already active.')
    }
    const attemptGeneration = stage.attemptGeneration + 1
    const leaseExpiresAt = now + PORTABLE_ASSET_ATTEMPT_LEASE_MS
    await ctx.db.patch(stage._id, {
      attemptTokenHash: args.attemptTokenHash,
      attemptGeneration,
      leaseExpiresAt,
      storageOrigin: args.storageOrigin,
      updatedAt: now,
    })
    return {
      state: 'attempt' as const,
      runId: run.runId,
      sha256: stage.sha256,
      attemptGeneration,
      leaseExpiresAt,
    }
  },
})

export const issuePortableAssetUploadUrl = callerMutation.protected({
  id: 'portability:issuePortableAssetUploadUrl',
  args: issuePortableAssetUploadUrlArgs.args,
  guard: canManagePortability,
  returns: v.union(
    v.object({
      state: v.literal('awaiting-upload'),
      uploadUrl: v.string(),
      byteLength: v.number(),
      mediaType: v.union(
        v.literal('image/png'),
        v.literal('image/jpeg'),
        v.literal('image/gif'),
        v.literal('image/webp'),
      ),
      storageOrigin: v.string(),
    }),
    v.object({ state: v.union(v.literal('uploaded'), v.literal('verifying')) }),
    v.object({ state: v.literal('attached'), assetId: v.string() }),
  ),
  handler: async (ctx, args) => {
    const identity = await ctx.appIdentity()
    const run = await getRun(ctx, args.runId)
    requirePlannedRun(run, {
      callerId: identity.userId,
      payloadSha256: args.payloadSha256,
    })
    const stage = await getStage(ctx, run.runId, args.sha256)
    if (stage.callerId !== identity.userId) {
      throw new Error('Portable asset stage caller mismatch.')
    }
    if (
      stage.attemptTokenHash !== args.attemptTokenHash ||
      stage.attemptGeneration !== args.attemptGeneration
    ) {
      throw new Error('Portable asset upload attempt token or generation mismatch.')
    }
    if (stage.state === 'attached' && stage.assetId) {
      return { state: 'attached' as const, assetId: stage.assetId }
    }
    assertAttempt(stage, {
      tokenHash: args.attemptTokenHash,
      generation: args.attemptGeneration,
    })
    if (stage.state === 'uploaded' || stage.state === 'verifying') {
      return { state: stage.state }
    }
    if (stage.state !== 'awaiting-upload' || !stage.storageOrigin) {
      throw new Error('Portable asset stage cannot issue an upload URL.')
    }
    const uploadUrl = await ctx.storage.generateUploadUrl()
    if (new URL(uploadUrl).origin !== stage.storageOrigin) {
      throw new Error('Portable generated upload URL has an unexpected origin.')
    }
    return {
      state: 'awaiting-upload' as const,
      uploadUrl,
      byteLength: stage.byteLength,
      mediaType: stage.mediaType,
      storageOrigin: stage.storageOrigin,
    }
  },
})

export const recordPortableAssetUpload = callerMutation.protected({
  id: 'portability:recordPortableAssetUpload',
  args: recordPortableAssetUploadArgs.args,
  guard: canManagePortability,
  returns: v.object({ runId: v.string(), sha256: v.string(), state: v.literal('uploaded') }),
  handler: async (ctx, args) => {
    const identity = await ctx.appIdentity()
    const run = await getRun(ctx, args.runId)
    requirePlannedRun(run, {
      callerId: identity.userId,
      payloadSha256: args.payloadSha256,
    })
    const stage = await getStage(ctx, run.runId, args.sha256)
    if (stage.callerId !== identity.userId) throw new Error('Portable asset stage caller mismatch.')
    assertAttempt(stage, {
      tokenHash: args.attemptTokenHash,
      generation: args.attemptGeneration,
    })
    if (stage.state === 'uploaded' && stage.storageId === args.storageId) {
      return { runId: run.runId, sha256: stage.sha256, state: 'uploaded' }
    }
    if (stage.state !== 'awaiting-upload' || stage.storageId !== null) {
      throw new Error('Portable asset stage cannot record this upload.')
    }
    const storage = await ctx.db.system.get('_storage', args.storageId)
    if (!storage) throw new Error('Portable uploaded storage object was not found.')
    await ctx.db.patch(stage._id, {
      state: 'uploaded',
      storageId: args.storageId,
      updatedAt: Date.now(),
    })
    return { runId: run.runId, sha256: stage.sha256, state: 'uploaded' }
  },
})

export const beginPortableAssetVerification = internalMutation({
  args: {
    runId: v.string(),
    callerId: v.string(),
    payloadSha256: v.string(),
    sha256: v.string(),
    attemptTokenHash: v.string(),
    attemptGeneration: v.number(),
  },
  returns: v.object({
    storageId: v.id('_storage'),
    byteLength: v.number(),
    mediaType: v.union(
      v.literal('image/png'),
      v.literal('image/jpeg'),
      v.literal('image/gif'),
      v.literal('image/webp'),
    ),
    storageOrigin: v.string(),
  }),
  handler: async (ctx, args) => {
    const run = await getRun(ctx, args.runId)
    requirePlannedRun(run, { callerId: args.callerId, payloadSha256: args.payloadSha256 })
    const stage = await getStage(ctx, run.runId, args.sha256)
    if (stage.callerId !== args.callerId || !['uploaded', 'verifying'].includes(stage.state)) {
      throw new Error('Portable asset stage cannot begin verification.')
    }
    assertAttempt(stage, {
      tokenHash: args.attemptTokenHash,
      generation: args.attemptGeneration,
    })
    if (!stage.storageId || !stage.storageOrigin) {
      throw new Error('Portable asset stage has no recorded storage object or origin.')
    }
    if (stage.state === 'uploaded') {
      await ctx.db.patch(stage._id, { state: 'verifying', updatedAt: Date.now() })
    }
    return {
      storageId: stage.storageId,
      byteLength: stage.byteLength,
      mediaType: stage.mediaType,
      storageOrigin: stage.storageOrigin,
    }
  },
})

export const attachVerifiedPortableAsset = internalMutation({
  args: {
    runId: v.string(),
    callerId: v.string(),
    payloadSha256: v.string(),
    sha256: v.string(),
    attemptTokenHash: v.string(),
    attemptGeneration: v.number(),
    storageId: v.id('_storage'),
    mediaType: v.union(
      v.literal('image/png'),
      v.literal('image/jpeg'),
      v.literal('image/gif'),
      v.literal('image/webp'),
    ),
    bytes: v.number(),
    width: v.number(),
    height: v.number(),
    frames: v.number(),
  },
  returns: v.object({ state: v.literal('attached'), assetId: v.string() }),
  handler: async (ctx, args) => {
    const run = await getRun(ctx, args.runId)
    requirePlannedRun(run, { callerId: args.callerId, payloadSha256: args.payloadSha256 })
    const stage = await getStage(ctx, run.runId, args.sha256)
    if (stage.state === 'attached' && stage.assetId) {
      return { state: 'attached' as const, assetId: stage.assetId }
    }
    if (stage.callerId !== args.callerId || stage.state !== 'verifying') {
      throw new Error('Portable asset stage cannot attach verified bytes.')
    }
    assertAttempt(stage, {
      tokenHash: args.attemptTokenHash,
      generation: args.attemptGeneration,
    })
    if (
      stage.storageId !== args.storageId ||
      stage.sha256 !== args.sha256 ||
      stage.byteLength !== args.bytes ||
      stage.mediaType !== args.mediaType
    ) {
      throw new Error('Portable verified asset facts do not match the stage.')
    }
    const extension =
      args.mediaType === 'image/jpeg' ? 'jpg' : args.mediaType.slice('image/'.length)
    const assetId = await registerVerifiedAssetRecord(ctx, {
      storageId: args.storageId,
      filename: `${args.sha256}.${extension}`,
      mimeType: args.mediaType,
      bytes: args.bytes,
      sha256: args.sha256,
      width: args.width,
      height: args.height,
      frames: args.frames,
      alt: null,
      caption: null,
      scope: 'global',
      createdBy: args.callerId,
    })
    const now = Date.now()
    await ctx.db.patch(stage._id, {
      state: 'attached',
      assetId,
      updatedAt: now,
    })
    await ctx.db.patch(run._id, {
      attachedAssetCount: run.attachedAssetCount + 1,
      updatedAt: now,
    })
    return { state: 'attached' as const, assetId }
  },
})

export const markPortableAssetCleanupRequired = internalMutation({
  args: {
    runId: v.string(),
    sha256: v.string(),
    storageId: v.id('_storage'),
  },
  returns: v.union(v.id('portableAssetStages'), v.null()),
  handler: async (ctx, args) => {
    const stage = await getStage(ctx, args.runId, args.sha256)
    if (stage.storageId !== args.storageId || stage.state === 'attached') return null
    await ctx.db.patch(stage._id, { state: 'cleanup-required', updatedAt: Date.now() })
    return stage._id
  },
})

export const finishPortableAssetCleanup = internalMutation({
  args: { stageId: v.id('portableAssetStages'), storageId: v.id('_storage') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const stage = await ctx.db.get(args.stageId)
    if (stage?.storageId === args.storageId && stage.state === 'cleanup-required') {
      await ctx.db.patch(stage._id, {
        state: 'cleaned',
        storageId: null,
        updatedAt: Date.now(),
      })
    }
    return null
  },
})

export const cleanupPortableAssetStage = internalAction({
  args: {
    stageId: v.id('portableAssetStages'),
    storageId: v.id('_storage'),
    attempt: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    try {
      await ctx.storage.delete(args.storageId)
      await ctx.runMutation(finishPortableAssetCleanupRef, {
        stageId: args.stageId,
        storageId: args.storageId,
      })
    } catch {
      if (args.attempt < MAX_PORTABLE_ASSET_CLEANUP_ATTEMPTS) {
        await ctx.scheduler.runAfter(
          1_000 * 2 ** (args.attempt - 1),
          cleanupPortableAssetStageRef,
          { ...args, attempt: args.attempt + 1 },
        )
      }
    }
    return null
  },
})

const beginPortableAssetVerificationRef = makeFunctionReference<
  'mutation',
  Record<string, unknown>,
  {
    storageId: string
    byteLength: number
    mediaType: 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp'
    storageOrigin: string
  }
>('portability/assets:beginPortableAssetVerification')
const attachVerifiedPortableAssetRef = makeFunctionReference<
  'mutation',
  Record<string, unknown>,
  { state: 'attached'; assetId: string }
>('portability/assets:attachVerifiedPortableAsset')
const markPortableAssetCleanupRequiredRef = makeFunctionReference<
  'mutation',
  { runId: string; sha256: string; storageId: string },
  string | null
>('portability/assets:markPortableAssetCleanupRequired')
const finishPortableAssetCleanupRef = makeFunctionReference<
  'mutation',
  { stageId: string; storageId: string },
  null
>('portability/assets:finishPortableAssetCleanup')
const cleanupPortableAssetStageRef = makeFunctionReference<
  'action',
  { stageId: string; storageId: string; attempt: number },
  null
>('portability/assets:cleanupPortableAssetStage')

export const verifyPortableAssetUpload = callerAction.protected({
  id: 'portability:verifyPortableAssetUpload',
  args: verifyPortableAssetUploadArgs.args,
  guard: canManagePortability,
  returns: v.object({ state: v.literal('attached'), assetId: v.string() }),
  handler: async (ctx, args) => {
    const identity = await ctx.appIdentity()
    const stage = await ctx.runMutation(beginPortableAssetVerificationRef, {
      ...args,
      callerId: identity.userId,
    })
    let cleanup = true
    try {
      const url = await ctx.storage.getUrl(stage.storageId as Id<'_storage'>)
      if (!url || new URL(url).origin !== stage.storageOrigin) {
        throw new Error('Portable storage URL has an unexpected origin.')
      }
      const bytes = await fetchPortableAsset(url, stage.byteLength)
      const verified = await verifyPublicImageBytes(bytes, stage.mediaType)
      if (verified.sha256 !== args.sha256 || verified.bytes !== stage.byteLength) {
        throw new Error('Portable asset checksum or byte length mismatch.')
      }
      const result = await ctx.runMutation(attachVerifiedPortableAssetRef, {
        ...args,
        callerId: identity.userId,
        storageId: stage.storageId,
        ...verified,
      })
      cleanup = false
      return result
    } finally {
      if (cleanup) {
        const stageId = await ctx.runMutation(markPortableAssetCleanupRequiredRef, {
          runId: args.runId,
          sha256: args.sha256,
          storageId: stage.storageId,
        })
        if (stageId) {
          await ctx.scheduler.runAfter(0, cleanupPortableAssetStageRef, {
            stageId,
            storageId: stage.storageId,
            attempt: 1,
          })
        }
      }
    }
  },
})

async function fetchPortableAsset(url: string, expectedBytes: number): Promise<Uint8Array> {
  const controller = new AbortController()
  const totalTimeout = setTimeout(() => controller.abort(), PORTABLE_ASSET_TOTAL_TIMEOUT_MS)
  try {
    const response = await fetch(url, { redirect: 'error', signal: controller.signal })
    if (!response.ok || !response.body) throw new Error('Portable storage fetch failed.')
    const contentLength = response.headers.get('content-length')
    if (contentLength !== null && Number(contentLength) !== expectedBytes) {
      throw new Error('Portable storage content length mismatch.')
    }
    const reader = response.body.getReader()
    const chunks: Uint8Array[] = []
    const hash = new IncrementalSha256()
    let total = 0
    for (;;) {
      const result = await readWithIdleTimeout(reader, controller)
      if (result.done) break
      total += result.value.byteLength
      if (total > expectedBytes) throw new Error('Portable storage body exceeds its planned size.')
      hash.update(result.value)
      chunks.push(result.value)
    }
    if (total !== expectedBytes) throw new Error('Portable storage body is truncated.')
    const bytes = new Uint8Array(total)
    let offset = 0
    for (const chunk of chunks) {
      bytes.set(chunk, offset)
      offset += chunk.byteLength
    }
    if (hash.digestHex().length !== 64) throw new Error('Portable storage hash failed.')
    return bytes
  } finally {
    clearTimeout(totalTimeout)
  }
}

async function readWithIdleTimeout(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  controller: AbortController,
) {
  let timeout: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      reader.read(),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
          controller.abort()
          reject(new Error('Portable storage fetch idle timeout.'))
        }, PORTABLE_ASSET_IDLE_TIMEOUT_MS)
      }),
    ])
  } finally {
    if (timeout) clearTimeout(timeout)
  }
}
