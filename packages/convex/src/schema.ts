import {
  fieldValidator,
  ginkoPublicAssetFactValidator,
  jsonObjectValidator,
  jsonValueValidator,
  localeTextValidator,
  slugModeValidator,
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
 * Collection configuration (fields, routing, labels, public profile, etc.)
 * is code-defined by the host project. The `collections` table stores a
 * synced read-only contract snapshot used by content operations, Studio,
 * MCP, and public projection builders.
 *
 * Studio and MCP may inspect the collection contract, but they must not
 * create, edit, or delete schema. Contract changes happen in code and flow
 * into Convex through deploy-key authenticated internal component functions.
 */
export default defineSchema({
  cmsPolicies: defineTable({
    key: v.literal('active'),
    contract: jsonValueValidator,
    contractSha256: v.string(),
    installedAt: v.number(),
    installedBy: v.string(),
  }).index('by_key', ['key']),

  collections: defineTable({
    slug: v.string(),
    label: localeTextValidator,
    icon: v.optional(v.union(v.string(), v.null())),
    type: v.union(v.literal('flat'), v.literal('tree')),
    routing: v.object({
      mode: v.optional(v.union(v.literal('route'), v.literal('none'))),
      pathPrefix: v.string(),
      slugMode: v.optional(slugModeValidator),
      rootSlug: v.optional(v.union(v.string(), v.null())),
      singleton: v.optional(v.boolean()),
    }),
    locales: v.array(v.string()),
    fields: v.array(fieldValidator),
    settings: v.optional(jsonValueValidator),
    contract: v.optional(
      v.object({
        source: v.literal('code'),
        version: v.string(),
      }),
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
    updatedBy: v.string(),
  }).index('by_slug', ['slug']),

  collectionReindexJobs: defineTable({
    collectionId: v.id('collections'),
    requestedGeneration: v.string(),
    appliedGeneration: v.union(v.string(), v.null()),
    phase: v.union(
      v.literal('draft'),
      v.literal('published'),
      v.literal('archived'),
      v.literal('verify'),
    ),
    cursor: v.union(v.string(), v.null()),
    requestedBy: v.string(),
    requestedAt: v.number(),
    updatedAt: v.number(),
  }).index('by_collection', ['collectionId']),

  contentMigrationRuns: defineTable({
    migrationId: v.string(),
    sourceHash: v.string(),
    fromContractHash: v.string(),
    toContractHash: v.string(),
    status: v.union(
      v.literal('planned'),
      v.literal('applying'),
      v.literal('validating'),
      v.literal('ready'),
      v.literal('activated'),
      v.literal('failed'),
    ),
    cursor: v.union(v.string(), v.null()),
    startedAt: v.number(),
    completedAt: v.union(v.number(), v.null()),
  }).index('by_migration_id', ['migrationId']),

  contentMigrationEntryReceipts: defineTable({
    runId: v.id('contentMigrationRuns'),
    entryId: v.id('entries'),
    inputHash: v.string(),
    outputHash: v.string(),
    appliedDraftVersion: v.number(),
    appliedAt: v.number(),
  })
    .index('by_run_entry', ['runId', 'entryId'])
    .index('by_run', ['runId']),

  contentMigrationValidationReceipts: defineTable({
    runId: v.id('contentMigrationRuns'),
    entryId: v.id('entries'),
    entryHash: v.string(),
    draftVersion: v.number(),
    validatedAt: v.number(),
  })
    .index('by_run_entry', ['runId', 'entryId'])
    .index('by_run', ['runId']),

  contractTransitionApprovals: defineTable({
    runId: v.id('contentMigrationRuns'),
    migrationId: v.string(),
    sourceHash: v.string(),
    fromContractHash: v.string(),
    toContractHash: v.string(),
    publicStrategy: v.union(v.literal('preserve'), v.literal('rebuild'), v.literal('unpublish')),
    validatedEntryCount: v.number(),
    expiresAt: v.number(),
    consumedAt: v.union(v.number(), v.null()),
  }).index('by_run', ['runId']),

  entries: defineTable({
    collectionId: v.id('collections'),
    baseSlug: v.string(),
    stableId: v.optional(v.union(v.string(), v.null())),
    status: v.union(v.literal('draft'), v.literal('published'), v.literal('archived')),
    dirtyLocales: v.array(v.string()),
    parentEntryId: v.optional(v.union(v.id('entries'), v.null())),
    orderRank: v.optional(v.union(v.string(), v.null())),
    nodeKind: v.optional(
      v.union(
        v.literal('page'),
        v.literal('folder'),
        v.literal('group'),
        v.literal('section'),
        v.null(),
      ),
    ),
    sortCache: v.optional(jsonObjectValidator),
    draftVersion: v.number(),
    // Pointer to the latest meaningful event in `entryRevisions`.
    latestRevisionId: v.optional(v.union(v.id('entryRevisions'), v.null())),
    createdBy: v.string(),
    updatedBy: v.string(),
    publishedBy: v.optional(v.union(v.string(), v.null())),
    createdAt: v.number(),
    updatedAt: v.number(),
    publishedAt: v.optional(v.union(v.number(), v.null())),
    // Immutable first successful publish time. This lives on the entry, not
    // the public projection row, because unpublish deletes public rows.
    firstPublishedAt: v.optional(v.union(v.number(), v.null())),
  })
    .index('by_collection_status', ['collectionId', 'status'])
    .index('by_collection_status_createdAt_slug', [
      'collectionId',
      'status',
      'createdAt',
      'baseSlug',
    ])
    .index('by_collection_slug', ['collectionId', 'baseSlug'])
    .index('by_collection_stableId', ['collectionId', 'stableId'])
    .index('by_collection_published', ['collectionId', 'status', 'publishedAt'])
    .index('by_createdAt_collection_slug', ['createdAt', 'collectionId', 'baseSlug'])
    .index('by_parent', ['collectionId', 'parentEntryId']),

  redirects: defineTable({
    locale: v.string(),
    from: v.string(),
    to: v.string(),
    statusCode: v.number(),
    source: v.union(v.literal('manual'), v.literal('publish'), v.literal('import')),
    collectionId: v.optional(v.union(v.id('collections'), v.null())),
    entryId: v.optional(v.union(v.id('entries'), v.null())),
    createdBy: v.string(),
    updatedBy: v.optional(v.union(v.string(), v.null())),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_locale_from', ['locale', 'from'])
    .index('by_locale_to', ['locale', 'to'])
    .index('by_entry', ['entryId'])
    .index('by_collection', ['collectionId']),

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
    stagedFieldValueCount: v.number(),
    stagedRelationEdgeCount: v.number(),
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
    collectionId: v.id('collections'),
    locale: v.string(),
    revisionId: v.id('entryRevisions'),
    stableId: v.optional(v.union(v.string(), v.null())),
    parentEntryId: v.optional(v.union(v.id('entries'), v.null())),
    orderKey: v.string(),
    slug: v.string(),
    path: v.string(),
    href: v.string(),
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
    .index('by_collection_locale_orderKey', ['collectionId', 'locale', 'orderKey'])
    .index('by_collection_locale_orderKey_entry', ['collectionId', 'locale', 'orderKey', 'entryId'])
    .index('by_collection_locale_path_entry', ['collectionId', 'locale', 'path', 'entryId'])
    .index('by_collection_locale_stableId', ['collectionId', 'locale', 'stableId'])
    .index('by_collection_locale_parent_orderKey', [
      'collectionId',
      'locale',
      'parentEntryId',
      'orderKey',
    ])
    .index('by_collection_locale_lastPublishedAt', ['collectionId', 'locale', 'lastPublishedAt'])
    .index('by_collection_locale_lastPublishedAt_entry', [
      'collectionId',
      'locale',
      'lastPublishedAt',
      'entryId',
    ])
    .index('by_collection_locale_firstPublishedAt', ['collectionId', 'locale', 'firstPublishedAt'])
    .index('by_collection_locale_firstPublishedAt_entry', [
      'collectionId',
      'locale',
      'firstPublishedAt',
      'entryId',
    ])
    .index('by_collection_locale_entryCreatedAt', ['collectionId', 'locale', 'entryCreatedAt'])
    .index('by_collection_locale_entryCreatedAt_entry', [
      'collectionId',
      'locale',
      'entryCreatedAt',
      'entryId',
    ])
    .searchIndex('search_locale', {
      searchField: 'searchText',
      filterFields: ['locale', 'collectionId'],
    }),

  publicRoutes: defineTable({
    entryId: v.id('entries'),
    collectionId: v.id('collections'),
    locale: v.string(),
    path: v.string(),
    href: v.string(),
    revisionId: v.id('entryRevisions'),
  })
    .index('by_locale_path', ['locale', 'path'])
    .index('by_entry_locale', ['entryId', 'locale']),

  publicProjectionState: defineTable({
    key: v.literal('global'),
    generation: v.number(),
    updatedAt: v.number(),
  }).index('by_key', ['key']),

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
    collectionId: v.optional(v.union(v.id('collections'), v.null())),
    tags: v.optional(v.array(v.string())),
    createdBy: v.string(),
    updatedBy: v.optional(v.union(v.string(), v.null())),
    createdAt: v.number(),
    updatedAt: v.optional(v.union(v.number(), v.null())),
    deletedAt: v.optional(v.union(v.number(), v.null())),
    deletedBy: v.optional(v.union(v.string(), v.null())),
  })
    .index('by_entry', ['entryId'])
    .index('by_collection', ['collectionId'])
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

  cmsSettings: defineTable({
    key: v.literal('site'),
    locales: v.array(
      v.object({
        code: v.string(),
        label: v.optional(v.string()),
        isDefault: v.optional(v.boolean()),
        fallback: v.optional(v.string()),
      }),
    ),
    updatedBy: v.optional(v.union(v.string(), v.null())),
    updatedAt: v.number(),
  }).index('by_key', ['key']),

  outboxEvents: defineTable({
    type: v.literal('content.revalidate'),
    status: v.union(
      v.literal('pending'),
      v.literal('delivering'),
      v.literal('delivered'),
      v.literal('failed'),
    ),
    idempotencyKey: v.string(),
    versionId: v.union(v.string(), v.null()),
    targetId: v.optional(v.union(v.id('revalidationTargets'), v.null())),
    tags: v.array(v.string()),
    paths: v.array(v.string()),
    payload: jsonObjectValidator,
    attempts: v.number(),
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

  legacyCredentialCutovers: defineTable({
    key: v.literal('mcpKeys-v0.1.3'),
    deletedCount: v.number(),
    activeCount: v.number(),
    revokedCount: v.number(),
    performedAt: v.number(),
  }).index('by_key', ['key']),

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
    collectionId: v.optional(v.union(v.id('collections'), v.null())),
    locale: v.optional(v.union(v.string(), v.null())),
    detail: v.optional(v.union(jsonValueValidator, v.null())),
    appIdentityId: v.optional(v.string()),
    actorId: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index('by_time', ['createdAt'])
    .index('by_entry', ['entryId', 'createdAt'])
    .index('by_collection', ['collectionId', 'createdAt'])
    .index('by_appIdentity', ['appIdentityId', 'createdAt']),

  // ─────────────────────────────────────────────────────────────────────
  // Gate 1 — canonical editorial storage. The old locale table and public
  // projection tables are gone; publicEntries and publicRoutes are the only
  // public read model. contentAssetRefs is the only asset-reference read model.
  //
  // Conceptual mapping:
  //   entryDrafts        — current mutable draft state per (entryId, locale)
  //                        plus a shared row with locale=null.
  //   entryRevisions     — append-only, meaningful events only:
  //                        publish/unpublish/rollback/archive/checkpoint/
  //                        route_rebuild.
  //                        Replaces the old published-version and draft
  //                        autosave-history models.
  //   contentAssetRefs   — derived asset usage cache, covers drafts +
  //                        revisions + public projections.
  //   backupArtifacts    — records of completed exports; required to gate
  //                        any future `purgeEntry` / `purgeAsset`.
  // ─────────────────────────────────────────────────────────────────────

  entryDrafts: defineTable({
    entryId: v.id('entries'),
    // null = the per-entry shared row (slug, parent, orderRank, shared values)
    locale: v.union(v.string(), v.null()),
    // The meaningful revision the draft started from. Null on a brand-new
    // entry that has never been published or checkpointed.
    baseRevisionId: v.optional(v.union(v.id('entryRevisions'), v.null())),
    // Shared row only (locale === null):
    parentEntryId: v.optional(v.union(v.id('entries'), v.null())),
    orderRank: v.optional(v.union(v.string(), v.null())),
    slug: v.optional(v.union(v.string(), v.null())),
    shared: v.optional(jsonObjectValidator),
    // Locale rows only (locale !== null):
    localeSlug: v.optional(v.union(v.string(), v.null())),
    values: v.optional(jsonObjectValidator),
    bodyMdc: v.optional(v.union(v.string(), v.null())),
    // Updated by every successful saveEntryDraft:
    updatedBy: v.string(),
    updatedAt: v.number(),
  })
    .index('by_entry', ['entryId'])
    .index('by_entry_locale', ['entryId', 'locale']),

  entryRevisions: defineTable({
    entryId: v.id('entries'),
    collectionId: v.id('collections'),
    // Monotonic per-entry sequence number. `createdAt` is still useful for
    // time queries, but this is the deterministic editorial version number.
    revisionNumber: v.optional(v.number()),
    parentRevisionId: v.optional(v.union(v.id('entryRevisions'), v.null())),
    kind: v.union(
      v.literal('publish'),
      v.literal('unpublish'),
      v.literal('rollback'),
      v.literal('archive'),
      v.literal('checkpoint'),
      v.literal('route_rebuild'),
    ),
    snapshot: v.object({
      parentEntryId: v.optional(v.union(v.id('entries'), v.null())),
      orderRank: v.optional(v.union(v.string(), v.null())),
      slug: v.optional(v.union(v.string(), v.null())),
      shared: jsonObjectValidator,
      // Per-locale revision snapshot. Keep bodyMdc as the immutable authoring
      // source; publicEntries store the parsed bodyAst used by the provider.
      // bodyAst remains optional only so old revision rows can still rebuild
      // public projections after upgrades.
      locales: v.record(
        v.string(),
        v.union(
          v.object({
            slug: v.union(v.string(), v.null()),
            path: v.string(),
            values: jsonObjectValidator,
            bodyMdc: v.optional(v.string()),
            bodyAst: v.optional(jsonValueValidator),
            searchText: v.optional(v.string()),
            toc: v.optional(v.union(jsonValueValidator, v.null())),
          }),
          v.null(),
        ),
      ),
    }),
    // Locales actually in scope for this revision (publish target, rollback
    // affected, etc.).
    affectedLocales: v.array(v.string()),
    // Schema version the snapshot was validated against, tied to
    // CmsContract.contractVersion. Lets future migrations detect old
    // revisions that need re-validation.
    schemaVersion: v.optional(v.string()),
    message: v.optional(v.union(v.string(), v.null())),
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
    collectionId: v.id('collections'),
    updatedAt: v.number(),
  })
    .index('by_asset_source', ['assetId', 'sourceKind'])
    .index('by_source', ['sourceKind', 'sourceId'])
    .index('by_entry', ['entryId']),

  backupArtifacts: defineTable({
    artifactId: v.string(),
    scope: v.union(
      v.literal('snapshot'),
      v.literal('collection'),
      v.literal('entry'),
      v.literal('asset'),
    ),
    // For scope='collection' / 'entry' / 'asset', the targeted ids.
    collectionId: v.optional(v.union(v.id('collections'), v.null())),
    entryId: v.optional(v.union(v.id('entries'), v.null())),
    assetId: v.optional(v.union(v.string(), v.null())),
    // Hex SHA-256 of the archive bytes.
    checksum: v.string(),
    // Storage location. v1 uses Convex `_storage`; future S3/etc. backends
    // record their own driver-specific id here.
    driver: v.string(),
    storageRef: v.string(),
    // Counts captured in the manifest, for sanity-checking restore.
    counts: v.object({
      entries: v.number(),
      revisions: v.number(),
      assets: v.number(),
      members: v.number(),
    }),
    createdBy: v.string(),
    createdAt: v.number(),
  })
    .index('by_artifact', ['artifactId'])
    .index('by_driver_storage', ['driver', 'storageRef'])
    .index('by_scope_target', ['scope', 'collectionId', 'entryId'])
    .index('by_created', ['createdAt']),
})
