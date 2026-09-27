import {
  contentContractValidator,
  jsonObjectValidator,
} from '@lupinum/ginko-cms-contract/convex/validators.js'
import { v } from 'convex/values'

import {
  activateContractTransitionHandler,
  applyContractTransitionPageHandler,
} from './contractTransitions/apply.js'
import {
  beginContractTransitionHandler,
  cancelContractTransitionHandler,
  getContractTransitionStatusHandler,
} from './contractTransitions/lifecycle.js'
import {
  stagedTransitionItemValidator,
  transitionDraftInputValidator,
} from './contractTransitions/model.js'
import {
  listContractTransitionPageHandler,
  stageContractTransitionPageHandler,
} from './contractTransitions/staging.js'
import { validateContractTransitionPageHandler } from './contractTransitions/validation.js'
import { mutation, query } from './functions.js'

// Component exports must be public for the host to call them. The generated
// host adapters remain internal: only deploy-key-authorized owner CLI calls
// reach these installer operations. They are never exposed as browser APIs.

export const beginContractTransition = mutation({
  args: {
    runKey: v.string(),
    targetContent: contentContractValidator,
    targetContentHash: v.string(),
    targetPresentation: jsonObjectValidator,
    targetPresentationHash: v.string(),
    actor: v.string(),
  },
  returns: v.object({
    runId: v.id('contractTransitionRuns'),
    state: v.string(),
    fromContentHash: v.string(),
    toContentHash: v.string(),
    fromPresentationHash: v.string(),
    toPresentationHash: v.string(),
    affectedCollections: v.array(v.string()),
  }),
  handler: beginContractTransitionHandler,
})

export const listContractTransitionPage = query({
  args: {
    runId: v.id('contractTransitionRuns'),
    generation: v.number(),
    cursor: v.union(v.string(), v.null()),
    limit: v.optional(v.number()),
  },
  returns: v.object({
    page: v.array(
      v.object({
        entryId: v.string(),
        inputDraftVersion: v.number(),
        inputHash: v.string(),
        current: transitionDraftInputValidator,
      }),
    ),
    isDone: v.boolean(),
    continueCursor: v.string(),
  }),
  handler: listContractTransitionPageHandler,
})

export const stageContractTransitionPage = mutation({
  args: {
    runId: v.id('contractTransitionRuns'),
    generation: v.number(),
    cursor: v.union(v.string(), v.null()),
    limit: v.optional(v.number()),
    items: v.array(stagedTransitionItemValidator),
  },
  returns: v.object({
    state: v.union(v.literal('staging'), v.literal('validating')),
    generation: v.number(),
    scanned: v.number(),
    scannedCount: v.number(),
    staged: v.number(),
    stagedCount: v.number(),
    continueCursor: v.union(v.string(), v.null()),
  }),
  handler: stageContractTransitionPageHandler,
})

export const validateContractTransitionPage = mutation({
  args: {
    runId: v.id('contractTransitionRuns'),
    generation: v.number(),
    cursor: v.union(v.string(), v.null()),
    limit: v.optional(v.number()),
  },
  returns: v.object({
    state: v.union(v.literal('validating'), v.literal('ready')),
    generation: v.number(),
    validated: v.number(),
    validatedCount: v.number(),
    continueCursor: v.union(v.string(), v.null()),
  }),
  handler: validateContractTransitionPageHandler,
})

export const applyContractTransitionPage = mutation({
  args: {
    runId: v.id('contractTransitionRuns'),
    generation: v.number(),
    cursor: v.union(v.string(), v.null()),
    limit: v.optional(v.number()),
    actor: v.string(),
  },
  returns: v.object({
    generation: v.number(),
    cursor: v.union(v.string(), v.null()),
    applied: v.number(),
    appliedCount: v.number(),
    readyToActivate: v.boolean(),
  }),
  handler: applyContractTransitionPageHandler,
})

export const activateContractTransition = mutation({
  args: {
    runId: v.id('contractTransitionRuns'),
    generation: v.number(),
    actor: v.string(),
  },
  returns: v.object({
    state: v.literal('complete'),
    contentHash: v.string(),
    presentationHash: v.string(),
    appliedCount: v.number(),
  }),
  handler: activateContractTransitionHandler,
})

export const cancelContractTransition = mutation({
  args: { runId: v.id('contractTransitionRuns') },
  returns: v.object({ state: v.literal('cancelled') }),
  handler: cancelContractTransitionHandler,
})

export const getContractTransitionStatus = query({
  args: { runId: v.id('contractTransitionRuns') },
  returns: v.object({
    runKey: v.string(),
    state: v.string(),
    fromContentHash: v.string(),
    toContentHash: v.string(),
    fromPresentationHash: v.string(),
    toPresentationHash: v.string(),
    generation: v.number(),
    scannedCount: v.number(),
    stagedCount: v.number(),
    validatedCount: v.number(),
    appliedCount: v.number(),
    pendingCount: v.number(),
    stagedHash: v.string(),
    validatedHash: v.string(),
    lockActive: v.boolean(),
    cursor: v.union(v.string(), v.null()),
  }),
  handler: getContractTransitionStatusHandler,
})
