import {
  ginkoPublicAssetFactValidator,
  jsonObjectValidator,
  jsonValueValidator,
  localeTextValidator,
} from '@lupinum/ginko-cms-contract/convex/validators.js'
import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

/**
 * Schema ownership model
 * ─────────────────────
 * Table structure (this file) is code-authoritative — it follows Convex
 * conventions and is deployed with `npx convex deploy`. It is never
 * modified at runtime.
 *
 * Collection configuration, locales, content policy, and presentation are
 * installed together in the singleton `cmsContract`. Content operations,
 * Studio, MCP, and public projection builders all read that same contract.
 *
 * Studio and MCP may inspect the collection contract, but they must not
 * create, edit, or delete schema. Contract changes happen in code and flow
 * into Convex through deploy-key authenticated internal component functions.
 */
export default defineSchema({
  cmsContract: defineTable({
    key: v.literal('active'),
    content: jsonValueValidator,
    presentation: jsonValueValidator,
    contentHash: v.string(),
    presentationHash: v.string(),
    transitionState: v.union(v.literal('ready'), v.literal('locked')),
    transitionRunId: v.union(v.string(), v.null()),
    installedAt: v.number(),
    installedBy: v.string(),
  }).index('by_key', ['key']),

  contractTransitionRuns: defineTable({
    runKey: v.string(),
    fromContentHash: v.string(),
    toContentHash: v.string(),
    targetContent: jsonValueValidator,
    state: v.union(
      v.literal('staging'),
      v.literal('ready'),
      v.literal('applying'),
      v.literal('complete'),
      v.literal('cancelled'),
      v.literal('failed'),
    ),
    cursor: v.union(v.string(), v.null()),
    stagedCount: v.number(),
    appliedCount: v.number(),
    createdBy: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_run_key', ['runKey'])
    .index('by_state', ['state', 'updatedAt']),

  contractTransitionItems: defineTable({
    runId: v.id('contractTransitionRuns'),
    entryId: v.id('entries'),
    inputDraftVersion: v.number(),
    inputHash: v.string(),
    outputHash: v.string(),
    output: jsonObjectValidator,
    state: v.union(v.literal('staged'), v.literal('applied')),
    appliedAt: v.union(v.number(), v.null()),
  })
    .index('by_run_entry', ['runId', 'entryId'])
    .index('by_run_state', ['runId', 'state']),

  entries: defineTable({
    collection: v.string(),
    stableId: v.string(),
    lifecycle: v.union(v.literal('active'), v.literal('archived')),
    slug: v.string(),
    parentEntryId: v.union(v.id('entries'), v.null()),
    orderRank: v.string(),
    nodeKind: v.union(
      v.literal('page'),
      v.literal('folder'),
      v.literal('group'),
      v.literal('section'),
      v.null(),
    ),
    shared: jsonObjectValidator,
    draftVersion: v.number(),
    sharedVersion: v.number(),
    activePublications: v.array(
      v.object({
        locale: v.string(),
        revisionId: v.id('entryRevisions'),
        sharedVersion: v.number(),
        localeVersion: v.number(),
        activatedAt: v.number(),
        activatedBy: v.string(),
      }),
    ),
    latestEditorialRevisionId: v.union(v.id('entryRevisions'), v.null()),
    createdBy: v.string(),
    updatedBy: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_collection_lifecycle', ['collection', 'lifecycle'])
    .index('by_collection_lifecycle_createdAt_slug', [
      'collection',
      'lifecycle',
      'createdAt',
      'slug',
    ])
    .index('by_collection_slug', ['collection', 'slug'])
    .index('by_collection_parent_slug', ['collection', 'parentEntryId', 'slug'])
    .index('by_collection_stableId', ['collection', 'stableId'])
    .index('by_createdAt_collection_slug', ['createdAt', 'collection', 'slug'])
    .index('by_parent', ['collection', 'parentEntryId', 'orderRank']),

  redirects: defineTable({
    collection: v.string(),
    locale: v.string(),
    kind: v.union(v.literal('exact'), v.literal('prefix')),
    fromPath: v.string(),
    targetEntryId: v.id('entries'),
    state: v.union(v.literal('active'), v.literal('retired')),
    statusCode: v.number(),
    source: v.union(v.literal('manual'), v.literal('publish'), v.literal('import')),
    operationId: v.string(),
    createdBy: v.string(),
    createdAt: v.number(),
    retiredBy: v.union(v.string(), v.null()),
    retiredAt: v.union(v.number(), v.null()),
    updatedAt: v.number(),
  })
    .index('by_collection_locale_state_from', ['collection', 'locale', 'state', 'fromPath'])
    .index('by_target', ['targetEntryId', 'state'])
    .index('by_collection_state', ['collection', 'state', 'updatedAt']),

  /** Monotonic concurrency fence for paged route reads and guarded previews. */
  routeGenerations: defineTable({
    scope: v.string(),
    collection: v.string(),
    locale: v.string(),
    generation: v.number(),
    updatedAt: v.number(),
  }).index('by_scope', ['scope']),

  portablePlans: defineTable({
    planId: v.string(),
    payload: jsonObjectValidator,
    payloadSha256: v.string(),
    callerId: v.string(),
    stagedItemCount: v.number(),
    stagedAssetCount: v.number(),
    initializedAssetCount: v.number(),
    initializedAttachedAssetCount: v.number(),
    stagedLocales: v.array(v.string()),
    createdAt: v.number(),
    expiresAt: v.number(),
  })
    .index('by_plan_id', ['planId'])
    .index('by_expires_at', ['expiresAt']),

  portableImportPlanItems: defineTable({
    planId: v.string(),
    applyOrder: v.number(),
    itemKey: v.string(),
    inputSha256: v.string(),
    payload: jsonObjectValidator,
    document: jsonObjectValidator,
  })
    .index('by_plan_item', ['planId', 'itemKey'])
    .index('by_plan_apply_order', ['planId', 'applyOrder'])
    .index('by_plan', ['planId']),

  portableImportPlanAssets: defineTable({
    planId: v.string(),
    assetKey: v.string(),
    inputSha256: v.string(),
    payload: jsonObjectValidator,
  })
    .index('by_plan_asset', ['planId', 'assetKey'])
    .index('by_plan', ['planId']),

  portableAssetStages: defineTable({
    runId: v.string(),
    callerId: v.string(),
    sha256: v.string(),
    byteLength: v.number(),
    mediaType: v.union(
      v.literal('image/png'),
      v.literal('image/jpeg'),
      v.literal('image/gif'),
      v.literal('image/webp'),
    ),
    state: v.union(
      v.literal('awaiting-upload'),
      v.literal('uploaded'),
      v.literal('verifying'),
      v.literal('verified'),
      v.literal('attached'),
      v.literal('cleanup-required'),
      v.literal('cleaned'),
    ),
    storageId: v.union(v.id('_storage'), v.null()),
    assetId: v.union(v.string(), v.null()),
    attemptTokenHash: v.union(v.string(), v.null()),
    attemptGeneration: v.number(),
    leaseExpiresAt: v.union(v.number(), v.null()),
    storageOrigin: v.union(v.string(), v.null()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_run_sha256', ['runId', 'sha256'])
    .index('by_run', ['runId'])
    .index('by_storage', ['storageId'])
    .index('by_state', ['state', 'updatedAt']),

  portableRuns: defineTable(
    v.union(
      v.object({
        runId: v.string(),
        planId: v.string(),
        mode: v.literal('import'),
        state: v.union(
          v.literal('planned'),
          v.literal('applying'),
          v.literal('verifying'),
          v.literal('complete'),
          v.literal('aborted'),
          v.literal('expired'),
        ),
        payloadSha256: v.string(),
        callerId: v.string(),
        deploymentId: v.string(),
        scope: v.object({ collections: v.array(v.string()) }),
        targetContractSha256: v.string(),
        sourceManifestSha256: v.string(),
        sourceContractSha256: v.string(),
        committedItemCount: v.number(),
        attachedAssetCount: v.number(),
        createdAt: v.number(),
        updatedAt: v.number(),
        expiresAt: v.number(),
      }),
      v.object({
        runId: v.string(),
        planId: v.null(),
        mode: v.literal('export'),
        state: v.union(
          v.literal('capturing'),
          v.literal('ready'),
          v.literal('complete'),
          v.literal('aborted'),
          v.literal('expired'),
        ),
        payloadSha256: v.string(),
        callerId: v.string(),
        deploymentId: v.string(),
        scope: v.object({ collections: v.array(v.string()) }),
        sourceContractSha256: v.string(),
        sourceContract: jsonObjectValidator,
        documentCount: v.number(),
        assetCount: v.number(),
        capturePosition: v.object({
          collectionIndex: v.number(),
          localeIndex: v.number(),
          orderKey: v.union(v.string(), v.null()),
          entryId: v.union(v.id('entries'), v.null()),
        }),
        captureComplete: v.boolean(),
        leaseTokenHash: v.union(v.string(), v.null()),
        leaseGeneration: v.number(),
        leaseExpiresAt: v.union(v.number(), v.null()),
        createdAt: v.number(),
        updatedAt: v.number(),
        expiresAt: v.number(),
      }),
    ),
  )
    .index('by_run_id', ['runId'])
    .index('by_plan_id', ['planId'])
    .index('by_mode_state', ['mode', 'state'])
    .index('by_mode_created_at', ['mode', 'createdAt'])
    .index('by_expires_at', ['expiresAt']),

  portableExportRoster: defineTable({
    runId: v.string(),
    index: v.number(),
    collection: v.string(),
    canonicalKey: v.string(),
    locale: v.string(),
    revisionId: v.id('entryRevisions'),
    document: jsonObjectValidator,
    documentSha256: v.string(),
  })
    .index('by_run_index', ['runId', 'index'])
    .index('by_run_identity', ['runId', 'collection', 'canonicalKey', 'locale'])
    .index('by_revision', ['revisionId']),

  portableExportAssets: defineTable({
    holdId: v.string(),
    runId: v.string(),
    sha256: v.string(),
    storageId: v.id('_storage'),
    bytes: v.number(),
    mediaType: v.union(
      v.literal('image/png'),
      v.literal('image/jpeg'),
      v.literal('image/gif'),
      v.literal('image/webp'),
    ),
    originalFilename: v.string(),
    expiresAt: v.number(),
    downloadTokenHash: v.union(v.string(), v.null()),
    downloadGeneration: v.number(),
    downloadAttempts: v.number(),
    downloadExpiresAt: v.union(v.number(), v.null()),
  })
    .index('by_hold_id', ['holdId'])
    .index('by_run_sha256', ['runId', 'sha256'])
    .index('by_run', ['runId'])
    .index('by_storage', ['storageId'])
    .index('by_expires_at', ['expiresAt']),

  portableExportReceipts: defineTable({
    runId: v.string(),
    manifestSha256: v.string(),
    documentCount: v.number(),
    assetCount: v.number(),
    completedAt: v.number(),
  }).index('by_run', ['runId']),

  portableItemReceipts: defineTable({
    runId: v.string(),
    itemKey: v.string(),
    inputSha256: v.string(),
    status: v.literal('committed'),
    effect: v.union(v.literal('created-draft'), v.literal('updated-draft'), v.literal('skipped')),
    resultId: v.string(),
    committedAt: v.number(),
  })
    .index('by_run_item', ['runId', 'itemKey'])
    .index('by_run', ['runId']),

  portableImportReceipts: defineTable({
    runId: v.string(),
    payloadSha256: v.string(),
    documentCount: v.number(),
    assetCount: v.number(),
    completedAt: v.number(),
  }).index('by_run', ['runId']),

  publicEntries: defineTable({
    entryId: v.id('entries'),
    collection: v.string(),
    locale: v.string(),
    revisionId: v.id('entryRevisions'),
    stableId: v.string(),
    parentEntryId: v.union(v.id('entries'), v.null()),
    orderKey: v.string(),
    slug: v.string(),
    title: v.string(),
    description: v.optional(v.union(v.string(), v.null())),
    data: jsonObjectValidator,
    bodyMdc: v.optional(v.string()),
    bodyAst: v.optional(v.string()),
    searchText: v.optional(v.string()),
    toc: v.optional(v.union(jsonValueValidator, v.null())),
    cacheTags: v.array(v.string()),
    assetFacts: v.optional(v.array(ginkoPublicAssetFactValidator)),
    navIncluded: v.boolean(),
    sitemapIncluded: v.optional(v.boolean()),
    searchIncluded: v.optional(v.boolean()),
    // Honest indexed sort fields (per Gate 0 findings):
    entryCreatedAt: v.number(),
    firstPublishedAt: v.number(),
    lastPublishedAt: v.number(),
  })
    .index('by_entry_locale', ['entryId', 'locale'])
    .index('by_collection_locale_orderKey', ['collection', 'locale', 'orderKey'])
    .index('by_collection_locale_orderKey_entry', ['collection', 'locale', 'orderKey', 'entryId'])
    .index('by_collection_locale_stableId', ['collection', 'locale', 'stableId'])
    .index('by_collection_locale_parent_slug', ['collection', 'locale', 'parentEntryId', 'slug'])
    .index('by_collection_locale_parent_orderKey', [
      'collection',
      'locale',
      'parentEntryId',
      'orderKey',
    ])
    .index('by_collection_locale_nav_orderKey', ['collection', 'locale', 'navIncluded', 'orderKey'])
    .index('by_collection_locale_sitemap_orderKey', [
      'collection',
      'locale',
      'sitemapIncluded',
      'orderKey',
    ])
    .index('by_collection_locale_lastPublishedAt', ['collection', 'locale', 'lastPublishedAt'])
    .index('by_collection_locale_lastPublishedAt_entry', [
      'collection',
      'locale',
      'lastPublishedAt',
      'entryId',
    ])
    .index('by_collection_locale_firstPublishedAt', ['collection', 'locale', 'firstPublishedAt'])
    .index('by_collection_locale_firstPublishedAt_entry', [
      'collection',
      'locale',
      'firstPublishedAt',
      'entryId',
    ])
    .index('by_collection_locale_entryCreatedAt', ['collection', 'locale', 'entryCreatedAt'])
    .index('by_collection_locale_entryCreatedAt_entry', [
      'collection',
      'locale',
      'entryCreatedAt',
      'entryId',
    ])
    .searchIndex('search_locale', {
      searchField: 'searchText',
      filterFields: ['locale', 'collection', 'searchIncluded'],
    }),

  assets: defineTable({
    storageId: v.id('_storage'),
    filename: v.string(),
    mimeType: v.string(),
    size: v.number(),
    sha256: v.string(),
    width: v.number(),
    height: v.number(),
    frames: v.number(),
    alt: v.optional(v.union(localeTextValidator, v.null())),
    caption: v.optional(v.union(localeTextValidator, v.null())),
    scope: v.union(v.literal('global'), v.literal('collection'), v.literal('entry')),
    entryId: v.optional(v.union(v.id('entries'), v.null())),
    collection: v.optional(v.union(v.string(), v.null())),
    tags: v.optional(v.array(v.string())),
    createdBy: v.string(),
    updatedBy: v.optional(v.union(v.string(), v.null())),
    createdAt: v.number(),
    updatedAt: v.optional(v.union(v.number(), v.null())),
    deletedAt: v.optional(v.union(v.number(), v.null())),
    deletedBy: v.optional(v.union(v.string(), v.null())),
  })
    .index('by_entry', ['entryId'])
    .index('by_collection', ['collection'])
    .index('by_scope', ['scope'])
    .index('by_sha256', ['sha256'])
    .index('by_storage', ['storageId'])
    .index('by_created', ['createdAt'])
    .index('by_created_storage', ['createdAt', 'storageId']),

  assetCleanupTasks: defineTable({
    storageId: v.id('_storage'),
    status: v.union(v.literal('cleanup-required'), v.literal('terminal-failure')),
    attempts: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_status', ['status', 'updatedAt'])
    .index('by_storage', ['storageId']),

  siteData: defineTable({
    key: v.string(),
    label: v.optional(v.union(localeTextValidator, v.null())),
    schemaType: v.optional(v.union(v.string(), v.null())),
    localized: v.boolean(),
    visibility: v.optional(v.union(v.literal('private'), v.literal('public'))),
    data: jsonValueValidator,
    updatedBy: v.optional(v.union(v.string(), v.null())),
    updatedAt: v.number(),
  }).index('by_key', ['key']),

  outboxEvents: defineTable({
    type: v.literal('content.revalidate'),
    status: v.union(
      v.literal('pending'),
      v.literal('delivering'),
      v.literal('delivered'),
      v.literal('dead'),
    ),
    idempotencyKey: v.string(),
    versionId: v.union(v.string(), v.null()),
    targetId: v.optional(v.union(v.id('revalidationTargets'), v.null())),
    tags: v.array(v.string()),
    paths: v.array(v.string()),
    payload: jsonObjectValidator,
    attempts: v.number(),
    deliveryGeneration: v.number(),
    leaseId: v.union(v.string(), v.null()),
    nextAttemptAt: v.number(),
    lastError: v.union(v.string(), v.null()),
    lockedAt: v.optional(v.union(v.number(), v.null())),
    lockExpiresAt: v.optional(v.union(v.number(), v.null())),
    deliveredAt: v.optional(v.union(v.number(), v.null())),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_status_nextAttemptAt', ['status', 'nextAttemptAt'])
    .index('by_status_lock_expiry', ['status', 'lockExpiresAt'])
    .index('by_status_updatedAt', ['status', 'updatedAt'])
    .index('by_idempotency_key', ['idempotencyKey'])
    .index('by_type_status', ['type', 'status']),

  revalidationTargets: defineTable({
    name: v.string(),
    environment: v.union(v.literal('production'), v.literal('preview'), v.literal('development')),
    endpoint: v.string(),
    secretEnv: v.string(),
    enabled: v.boolean(),
    createdBy: v.string(),
    updatedBy: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_enabled_environment', ['enabled', 'environment'])
    .index('by_environment', ['environment']),

  members: defineTable({
    userId: v.string(),
    displayName: v.optional(v.union(v.string(), v.null())),
    email: v.optional(v.union(v.string(), v.null())),
    role: v.union(
      v.literal('owner'),
      v.literal('publisher'),
      v.literal('editor'),
      v.literal('viewer'),
    ),
    createdAt: v.number(),
    updatedAt: v.optional(v.union(v.number(), v.null())),
    updatedBy: v.optional(v.union(v.string(), v.null())),
  })
    .index('by_userId', ['userId'])
    .index('by_role', ['role']),

  mcpCredentialSettings: defineTable({
    apiKeyId: v.string(),
    ownerUserId: v.string(),
    label: v.optional(v.union(v.string(), v.null())),
    scopes: v.array(v.string()),
    status: v.union(v.literal('active'), v.literal('revoked')),
    expiresAt: v.optional(v.union(v.number(), v.null())),
    createdBy: v.string(),
    createdAt: v.number(),
    updatedBy: v.string(),
    updatedAt: v.number(),
    revokedAt: v.optional(v.union(v.number(), v.null())),
  })
    .index('by_api_key_id', ['apiKeyId'])
    .index('by_owner_user', ['ownerUserId'])
    .index('by_status', ['status']),

  agentRuns: defineTable({
    credentialApiKeyId: v.string(),
    delegatedUserId: v.string(),
    scopeSnapshot: v.array(v.string()),
    taskName: v.string(),
    status: v.union(
      v.literal('active'),
      v.literal('completed'),
      v.literal('revoked'),
      v.literal('failed'),
    ),
    createdBy: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
    expiresAt: v.optional(v.union(v.number(), v.null())),
    endedAt: v.optional(v.union(v.number(), v.null())),
    lastWriteAt: v.optional(v.union(v.number(), v.null())),
    lastError: v.optional(v.union(v.string(), v.null())),
  })
    .index('by_credential', ['credentialApiKeyId'])
    .index('by_credential_status_expires_at', ['credentialApiKeyId', 'status', 'expiresAt'])
    .index('by_delegated_user', ['delegatedUserId'])
    .index('by_status', ['status'])
    .index('by_status_expires_at', ['status', 'expiresAt'])
    .index('by_status_updated_at', ['status', 'updatedAt']),

  mcpCreateEntryReceipts: defineTable({
    callerKey: v.string(),
    apiKeyId: v.string(),
    requestId: v.string(),
    argsHash: v.string(),
    entryId: v.id('entries'),
    createdAt: v.number(),
    expiresAt: v.number(),
  })
    .index('by_caller_request', ['callerKey', 'requestId'])
    .index('by_expires_at', ['expiresAt']),

  reviewRequests: defineTable({
    agentRunId: v.optional(v.union(v.id('agentRuns'), v.null())),
    entryId: v.string(),
    locales: v.array(v.string()),
    expectedVersion: v.number(),
    message: v.optional(v.union(v.string(), v.null())),
    title: v.string(),
    summary: v.string(),
    status: v.union(v.literal('pending'), v.literal('approved'), v.literal('rejected')),
    preview: jsonValueValidator,
    requestedBy: v.string(),
    reviewedBy: v.optional(v.union(v.string(), v.null())),
    createdAt: v.number(),
    updatedAt: v.number(),
    reviewedAt: v.optional(v.union(v.number(), v.null())),
    reviewFeedback: v.optional(v.union(v.string(), v.null())),
    versionHash: v.optional(v.union(v.string(), v.null())),
    previewHash: v.optional(v.string()),
  })
    .index('by_agent_run', ['agentRunId'])
    .index('by_status', ['status'])
    .index('by_status_updated_at', ['status', 'updatedAt'])
    .index('by_entry', ['entryId']),

  destructiveConfirmations: defineTable({
    tokenHash: v.string(),
    jti: v.string(),
    operationId: v.string(),
    executePath: v.string(),
    previewPath: v.string(),
    callerKey: v.string(),
    scopeKey: v.string(),
    argsHash: v.string(),
    argsFieldHashes: v.optional(v.record(v.string(), v.string())),
    previewHash: v.string(),
    versionHash: v.optional(v.string()),
    createdAt: v.number(),
    expiresAt: v.number(),
    redeemedAt: v.optional(v.number()),
  })
    .index('by_token_hash', ['tokenHash'])
    .index('by_jti', ['jti'])
    .index('by_expires_at', ['expiresAt']),

  destructiveAuditLog: defineTable({
    operationId: v.string(),
    jti: v.string(),
    callerKey: v.string(),
    scopeKey: v.string(),
    argsHash: v.string(),
    previewHash: v.string(),
    executedAt: v.number(),
    executePath: v.string(),
  }),

  activity: defineTable({
    kind: v.string(),
    summary: v.string(),
    entryId: v.optional(v.union(v.id('entries'), v.null())),
    collection: v.optional(v.union(v.string(), v.null())),
    locale: v.optional(v.union(v.string(), v.null())),
    detail: v.optional(v.union(jsonValueValidator, v.null())),
    appIdentityId: v.optional(v.string()),
    actorId: v.optional(v.string()),
    // Actor display name captured at WRITE time — display names on old rows
    // resolve at read time as a fallback, but new rows keep the name the
    // actor had when they acted (rename-stable audit trail).
    actorLabel: v.optional(v.union(v.string(), v.null())),
    createdAt: v.number(),
  })
    .index('by_time', ['createdAt'])
    .index('by_entry', ['entryId', 'createdAt'])
    .index('by_collection', ['collection', 'createdAt'])
    .index('by_appIdentity', ['appIdentityId', 'createdAt']),

  entryLocaleDrafts: defineTable({
    entryId: v.id('entries'),
    locale: v.string(),
    slug: v.union(v.string(), v.null()),
    values: jsonObjectValidator,
    bodyMdc: v.string(),
    version: v.number(),
    updatedBy: v.string(),
    updatedAt: v.number(),
  })
    .index('by_entry', ['entryId'])
    .index('by_entry_locale', ['entryId', 'locale']),

  entryRevisions: defineTable({
    entryId: v.id('entries'),
    collection: v.string(),
    revisionNumber: v.number(),
    operationId: v.string(),
    parentRevisionId: v.union(v.id('entryRevisions'), v.null()),
    kind: v.union(
      v.literal('publish'),
      v.literal('unpublish'),
      v.literal('rollback'),
      v.literal('archive'),
      v.literal('checkpoint'),
      v.literal('restore'),
    ),
    snapshots: v.record(
      v.string(),
      v.object({
        shared: jsonObjectValidator,
        values: jsonObjectValidator,
        bodyMdc: v.string(),
        bodyAst: v.optional(jsonValueValidator),
        searchText: v.optional(v.string()),
        toc: v.optional(v.union(jsonValueValidator, v.null())),
        slug: v.string(),
        parentEntryId: v.union(v.id('entries'), v.null()),
        orderRank: v.string(),
        sharedVersion: v.number(),
        localeVersion: v.number(),
      }),
    ),
    affectedLocales: v.array(v.string()),
    contentHash: v.string(),
    message: v.union(v.string(), v.null()),
    createdBy: v.string(),
    createdAt: v.number(),
  })
    .index('by_entry_createdAt', ['entryId', 'createdAt'])
    .index('by_entry_revisionNumber', ['entryId', 'revisionNumber'])
    .index('by_entry_kind', ['entryId', 'kind', 'createdAt']),

  contentAssetRefs: defineTable({
    sourceKind: v.union(v.literal('draft'), v.literal('revision'), v.literal('public')),
    // string id rather than v.id(...) since sourceKind discriminates the
    // table — the row points at one of three different doc types.
    sourceId: v.string(),
    assetId: v.string(),
    fieldPath: v.string(),
    locale: v.optional(v.union(v.string(), v.null())),
    entryId: v.id('entries'),
    collection: v.string(),
    updatedAt: v.number(),
  })
    .index('by_asset_source', ['assetId', 'sourceKind'])
    .index('by_source', ['sourceKind', 'sourceId'])
    .index('by_entry', ['entryId']),

  mcpAuthFailureBuckets: defineTable({
    bucketKey: v.string(),
    attempts: v.array(
      v.object({
        requestId: v.string(),
        timestamp: v.number(),
      }),
    ),
    expiresAt: v.number(),
  })
    .index('by_key', ['bucketKey'])
    .index('by_expires_at', ['expiresAt']),

  assetRecoveryArtifacts: defineTable({
    artifactId: v.string(),
    assetId: v.string(),
    collection: v.union(v.string(), v.null()),
    entryId: v.union(v.id('entries'), v.null()),
    checksum: v.string(),
    storageRef: v.string(),
    createdBy: v.string(),
    createdAt: v.number(),
  })
    .index('by_artifact', ['artifactId'])
    .index('by_storage', ['storageRef'])
    .index('by_asset_created', ['assetId', 'createdAt'])
    .index('by_created', ['createdAt']),
})
