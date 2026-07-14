import { v } from 'convex/values'

import { defineArgs } from '../args.js'
import { jsonObjectValidator } from '../validators.js'

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
        itemKey: v.string(),
        inputSha256: v.string(),
        payload: jsonObjectValidator,
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

export const applyImportItem = defineArgs({
  description: 'Idempotently apply one planned portable document as a CMS draft.',
  args: {
    ...runArgs,
    itemKey: v.string(),
    inputSha256: v.string(),
    document: jsonObjectValidator,
  },
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
