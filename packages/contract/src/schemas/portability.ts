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
