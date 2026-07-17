import { v } from 'convex/values'

import { defineArgs } from '../args.js'
import { jsonObjectValidator } from '../validators.js'

export const PORTABLE_IMPORT_LIMITS = Object.freeze({
  // The supported envelope is deliberately tied to the release-gated
  // target corpus. These are localized documents, not canonical entries.
  entries: 5_000,
  locales: 3,
  assets: 500,
  documentBytes: 256 * 1024,
  stagedItemsPerRequest: 10,
  appliedItemsPerBatch: 10,
  durationMs: 2 * 60 * 60 * 1_000,
})

export const createImportPlan = defineArgs({
  description: 'Create an immutable CMS portability import plan.',
  args: {
    planId: v.string(),
    payload: jsonObjectValidator,
    payloadSha256: v.string(),
  },
})

export const inspectPortableDrafts = defineArgs({
  description: 'Read current draft hashes for one bounded import-planning page.',
  args: {
    items: v.array(
      v.object({
        itemKey: v.string(),
        identity: v.object({
          collection: v.string(),
          canonicalKey: v.string(),
          locale: v.string(),
        }),
      }),
    ),
  },
})

export const inspectPortableAssets = defineArgs({
  description: 'Read canonical registered asset facts for one bounded import-planning page.',
  args: {
    assets: v.array(
      v.object({
        sha256: v.string(),
        bytes: v.number(),
        mediaType: v.union(
          v.literal('image/png'),
          v.literal('image/jpeg'),
          v.literal('image/gif'),
          v.literal('image/webp'),
        ),
      }),
    ),
  },
})

export const appendImportPlanItems = defineArgs({
  description: 'Append one bounded page of immutable import plan items.',
  args: {
    planId: v.string(),
    payloadSha256: v.string(),
    items: v.array(
      v.object({
        applyOrder: v.number(),
        itemKey: v.string(),
        inputSha256: v.string(),
        payload: jsonObjectValidator,
        document: jsonObjectValidator,
      }),
    ),
  },
})

export const appendImportPlanAssets = defineArgs({
  description: 'Append one bounded page of immutable import plan assets.',
  args: {
    planId: v.string(),
    payloadSha256: v.string(),
    assets: v.array(
      v.object({
        assetKey: v.string(),
        inputSha256: v.string(),
        payload: jsonObjectValidator,
      }),
    ),
  },
})

const runArgs = {
  runId: v.string(),
  payloadSha256: v.string(),
}

export const sealImportPlan = defineArgs({
  description: 'Verify all import plan rows and create its bound run.',
  args: { planId: v.string(), payloadSha256: v.string() },
})

export const beginImportApply = defineArgs({
  description: 'Move a planned portable import into its applying state.',
  args: runArgs,
})

export const beginPortableAssetUpload = defineArgs({
  description: 'Fence one host-mediated portability asset upload attempt.',
  args: {
    ...runArgs,
    sha256: v.string(),
    attemptTokenHash: v.string(),
    storageOrigin: v.string(),
  },
})

export const issuePortableAssetUploadUrl = defineArgs({
  description: 'Issue one Convex upload URL to the authenticated CMS host.',
  args: {
    ...runArgs,
    sha256: v.string(),
    attemptTokenHash: v.string(),
    attemptGeneration: v.number(),
  },
})

export const recordPortableAssetUpload = defineArgs({
  description: 'Conditionally bind a committed storage object to its fenced stage.',
  args: {
    ...runArgs,
    sha256: v.string(),
    attemptTokenHash: v.string(),
    attemptGeneration: v.number(),
    storageId: v.id('_storage'),
  },
})

export const verifyPortableAssetUpload = defineArgs({
  description: 'Verify and atomically attach one fenced portability asset stage.',
  args: {
    ...runArgs,
    sha256: v.string(),
    attemptTokenHash: v.string(),
    attemptGeneration: v.number(),
  },
})

export const applyImportBatch = defineArgs({
  description: 'Resume one bounded server-owned batch of planned portable drafts.',
  args: runArgs,
})

export const beginImportVerification = defineArgs({
  description: 'Move a fully applied portable import into verification.',
  args: runArgs,
})

export const finalizeImport = defineArgs({
  description: 'Verify completeness and seal the import receipt without publishing.',
  args: runArgs,
})

export const abortImport = defineArgs({
  description: 'Stop an active portable import without rolling back committed drafts.',
  args: runArgs,
})

export const expireImport = defineArgs({
  description: 'Close an active portable import after its immutable deadline.',
  args: runArgs,
})

export const createExportRun = defineArgs({
  description: 'Start one fenced immutable published-content export capture.',
  args: {
    runId: v.string(),
    deploymentId: v.string(),
    scope: v.object({ collections: v.array(v.string()) }),
    sourceContractSha256: v.string(),
    leaseTokenHash: v.string(),
  },
})

const exportLeaseArgs = {
  runId: v.string(),
  leaseTokenHash: v.string(),
  leaseGeneration: v.number(),
}

export const captureExportPage = defineArgs({
  description: 'Capture one bounded page of immutable public revisions and asset holds.',
  args: exportLeaseArgs,
})

export const sealExportRun = defineArgs({
  description: 'Verify the final captured page and release the editorial write lease.',
  args: exportLeaseArgs,
})

export const readExportDocuments = defineArgs({
  description: 'Read one bounded page of documents reconstructed from a sealed export roster.',
  args: {
    runId: v.string(),
    cursor: v.union(v.string(), v.null()),
    limit: v.number(),
  },
})

export const readExportAssets = defineArgs({
  description: 'Read one bounded page of held immutable export asset facts.',
  args: {
    runId: v.string(),
    cursor: v.union(v.string(), v.null()),
    limit: v.number(),
  },
})

export const beginPortableAssetDownload = defineArgs({
  description: 'Fence one short-lived host-mediated export asset download capability.',
  args: {
    runId: v.string(),
    holdId: v.string(),
    downloadTokenHash: v.string(),
  },
})

export const claimPortableAssetDownload = defineArgs({
  description: 'Atomically claim one of at most three export asset download attempts.',
  args: {
    runId: v.string(),
    holdId: v.string(),
    downloadTokenHash: v.string(),
    downloadGeneration: v.number(),
  },
})

export const completeExportRun = defineArgs({
  description: 'Record or replay one verified local export manifest receipt.',
  args: {
    runId: v.string(),
    manifestSha256: v.string(),
    documentCount: v.number(),
    assetCount: v.number(),
  },
})

export const abortExportRun = defineArgs({
  description: 'Stop an active restart-only portable export and release its holds.',
  args: { runId: v.string() },
})

export const expireExportRun = defineArgs({
  description: 'Close an active portable export after its immutable deadline.',
  args: { runId: v.string() },
})
