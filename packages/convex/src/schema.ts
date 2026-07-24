import {
  activityOutcomeValidator,
  ginkoPublicAssetFactValidator,
  jsonObjectValidator,
  jsonValueValidator,
  localeTextValidator,
} from '@lupinum/ginko-cms-contract/convex/validators.js'
import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

const durableSha256StateValidator = v.object({
  words: v.array(v.number()),
  block: v.array(v.number()),
  bytesHashed: v.number(),
})

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
    writeGeneration: v.number(),
    transitionState: v.union(v.literal('ready'), v.literal('locked')),
    transitionRunId: v.union(v.string(), v.null()),
    installedAt: v.number(),
    installedBy: v.string(),
  }).index('by_key', ['key']),

  contractTransitionRuns: defineTable({
    runKey: v.string(),
    fromContentHash: v.string(),
    toContentHash: v.string(),
    fromPresentationHash: v.string(),
    toPresentationHash: v.string(),
    affectedCollections: v.array(v.string()),
    targetContent: jsonValueValidator,
    targetPresentation: jsonValueValidator,
    state: v.union(
      v.literal('staging'),
      v.literal('validating'),
      v.literal('ready'),
      v.literal('applying'),
      v.literal('complete'),
      v.literal('cancelled'),
    ),
    generation: v.number(),
    cursor: v.union(v.string(), v.null()),
    scannedCount: v.number(),
    stagedCount: v.number(),
    validatedCount: v.number(),
    appliedCount: v.number(),
    stagedHash: v.string(),
    validatedHash: v.string(),
    createdBy: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_run_key', ['runKey'])
    .index('by_state', ['state', 'updatedAt']),

  contractTransitionItems: defineTable({
    runId: v.id('contractTransitionRuns'),
    entryId: v.id('entries'),
    sequence: v.number(),
    collection: v.string(),
    stableId: v.string(),
    parentEntryId: v.union(v.id('entries'), v.null()),
    inputDraftVersion: v.number(),
    inputHash: v.string(),
    outputHash: v.string(),
    routeClaimsHash: v.string(),
    output: jsonObjectValidator,
    state: v.union(v.literal('staged'), v.literal('validated'), v.literal('applied')),
    validatedAt: v.union(v.number(), v.null()),
    appliedAt: v.union(v.number(), v.null()),
  })
    .index('by_run_entry', ['runId', 'entryId'])
    .index('by_run_sequence', ['runId', 'sequence'])
    .index('by_run_state', ['runId', 'state'])
    .index('by_entry', ['entryId']),

  contractTransitionRouteClaims: defineTable({
    runId: v.id('contractTransitionRuns'),
    entryId: v.id('entries'),
    collection: v.string(),
    locale: v.string(),
    parentEntryId: v.union(v.id('entries'), v.null()),
    segment: v.string(),
  })
    .index('by_run_entry', ['runId', 'entryId'])
    .index('by_run_route', ['runId', 'collection', 'locale', 'parentEntryId', 'segment']),

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
        firstPublishedAt: v.number(),
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
    .index('by_lifecycle_updatedAt', ['lifecycle', 'updatedAt'])
    .index('by_createdAt_collection_slug', ['createdAt', 'collection', 'slug'])
    .index('by_parent', ['collection', 'parentEntryId', 'orderRank'])
    .index('by_parent_lifecycle', ['collection', 'parentEntryId', 'lifecycle', 'orderRank']),

  redirects: defineTable({
    redirectId: v.string(),
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
    .index('by_redirect_id', ['redirectId'])
    .index('by_collection_locale_state_from', ['collection', 'locale', 'state', 'fromPath'])
    .index('by_collection_locale_state_updatedAt_redirectId', [
      'collection',
      'locale',
      'state',
      'updatedAt',
      'redirectId',
    ])
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

  portableRuns: defineTable(
    v.union(
      v.object({
        runId: v.string(),
        planId: v.string(),
        mode: v.literal('import'),
        state: v.union(
          v.literal('staging'),
          v.literal('sealing'),
          v.literal('planned'),
          v.literal('applying'),
          v.literal('verifying'),
          v.literal('complete'),
          v.literal('aborted'),
          v.literal('expired'),
        ),
        payload: jsonObjectValidator,
        payloadSha256: v.string(),
        callerId: v.string(),
        deploymentId: v.string(),
        scope: v.object({ collections: v.array(v.string()) }),
        targetContentHash: v.string(),
        sourceManifestSha256: v.string(),
        sourceContentHash: v.string(),
        stagedItemCount: v.number(),
        stagedAssetCount: v.number(),
        stagedLocales: v.array(v.string()),
        workPhase: v.union(
          v.literal('seal-items'),
          v.literal('seal-assets'),
          v.literal('apply'),
          v.literal('cleanup'),
          v.null(),
        ),
        workCursor: v.union(v.string(), v.null()),
        workGeneration: v.number(),
        workToken: v.union(v.string(), v.null()),
        workLeaseExpiresAt: v.union(v.number(), v.null()),
        workAttempts: v.number(),
        workNextAttemptAt: v.union(v.number(), v.null()),
        workLastError: v.union(v.string(), v.null()),
        workDeadLetteredAt: v.union(v.number(), v.null()),
        sealItemCount: v.number(),
        sealItemHash: durableSha256StateValidator,
        sealAssetCount: v.number(),
        sealAssetHash: durableSha256StateValidator,
        committedItemCount: v.number(),
        attachedAssetCount: v.number(),
        completedAt: v.union(v.number(), v.null()),
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
        sourceContentHash: v.string(),
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
        workPhase: v.union(v.literal('cleanup'), v.null()),
        workCursor: v.union(v.string(), v.null()),
        workGeneration: v.number(),
        workToken: v.union(v.string(), v.null()),
        workLeaseExpiresAt: v.union(v.number(), v.null()),
        workAttempts: v.number(),
        workNextAttemptAt: v.union(v.number(), v.null()),
        workLastError: v.union(v.string(), v.null()),
        workDeadLetteredAt: v.union(v.number(), v.null()),
        manifestSha256: v.union(v.string(), v.null()),
        completedAt: v.union(v.number(), v.null()),
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

  portableItems: defineTable(
    v.union(
      v.object({
        mode: v.literal('import'),
        runId: v.string(),
        index: v.number(),
        itemKey: v.string(),
        inputSha256: v.string(),
        payload: jsonObjectValidator,
        document: jsonObjectValidator,
        collection: v.string(),
        canonicalKey: v.string(),
        locale: v.string(),
        revisionId: v.null(),
        state: v.union(v.literal('staged'), v.literal('committed')),
        effect: v.union(
          v.literal('created-draft'),
          v.literal('updated-draft'),
          v.literal('skipped'),
          v.null(),
        ),
        resultId: v.union(v.string(), v.null()),
        committedAt: v.union(v.number(), v.null()),
      }),
      v.object({
        mode: v.literal('export'),
        runId: v.string(),
        index: v.number(),
        itemKey: v.string(),
        inputSha256: v.string(),
        payload: jsonObjectValidator,
        document: jsonObjectValidator,
        collection: v.string(),
        canonicalKey: v.string(),
        locale: v.string(),
        revisionId: v.id('entryRevisions'),
        state: v.literal('captured'),
        effect: v.null(),
        resultId: v.null(),
        committedAt: v.null(),
      }),
    ),
  )
    .index('by_run_index', ['runId', 'index'])
    .index('by_run_item', ['runId', 'itemKey'])
    .index('by_run_identity', ['runId', 'collection', 'canonicalKey', 'locale'])
    .index('by_collection_canonical', ['collection', 'canonicalKey'])
    .index('by_revision', ['revisionId'])
    .index('by_run', ['runId']),

  portableAssets: defineTable(
    v.union(
      v.object({
        mode: v.literal('import'),
        runId: v.string(),
        holdId: v.null(),
        callerId: v.string(),
        sha256: v.string(),
        inputSha256: v.string(),
        payload: jsonObjectValidator,
        byteLength: v.number(),
        mediaType: v.union(
          v.literal('image/png'),
          v.literal('image/jpeg'),
          v.literal('image/gif'),
          v.literal('image/webp'),
        ),
        state: v.union(
          v.literal('staged'),
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
        originalFilename: v.null(),
        expiresAt: v.number(),
        downloadTokenHash: v.null(),
        downloadGeneration: v.number(),
        downloadAttempts: v.number(),
        downloadExpiresAt: v.null(),
        createdAt: v.number(),
        updatedAt: v.number(),
      }),
      v.object({
        mode: v.literal('export'),
        runId: v.string(),
        holdId: v.string(),
        callerId: v.null(),
        sha256: v.string(),
        inputSha256: v.null(),
        payload: jsonObjectValidator,
        byteLength: v.number(),
        mediaType: v.union(
          v.literal('image/png'),
          v.literal('image/jpeg'),
          v.literal('image/gif'),
          v.literal('image/webp'),
        ),
        state: v.literal('held'),
        storageId: v.id('_storage'),
        assetId: v.null(),
        attemptTokenHash: v.null(),
        attemptGeneration: v.number(),
        leaseExpiresAt: v.null(),
        storageOrigin: v.null(),
        originalFilename: v.string(),
        expiresAt: v.number(),
        downloadTokenHash: v.union(v.string(), v.null()),
        downloadGeneration: v.number(),
        downloadAttempts: v.number(),
        downloadExpiresAt: v.union(v.number(), v.null()),
        createdAt: v.number(),
        updatedAt: v.number(),
      }),
    ),
  )
    .index('by_hold_id', ['holdId'])
    .index('by_run_sha256', ['runId', 'sha256'])
    .index('by_run', ['runId'])
    .index('by_storage', ['storageId'])
    .index('by_state', ['state', 'updatedAt'])
    .index('by_expires_at', ['expiresAt']),

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
    description: v.union(v.string(), v.null()),
    data: jsonObjectValidator,
    cacheTags: v.array(v.string()),
    assetFacts: v.array(ginkoPublicAssetFactValidator),
    navIncluded: v.boolean(),
    sitemapIncluded: v.boolean(),
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
    .index('by_collection_locale_parent_orderKey_entry', [
      'collection',
      'locale',
      'parentEntryId',
      'orderKey',
      'entryId',
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
    ]),

  publicSearchEntries: defineTable({
    entryId: v.id('entries'),
    collection: v.string(),
    locale: v.string(),
    revisionId: v.id('entryRevisions'),
    stableId: v.string(),
    searchShard: v.number(),
    searchText: v.string(),
    lastPublishedAt: v.number(),
  })
    .index('by_entry_locale', ['entryId', 'locale'])
    .index('by_revision_locale', ['revisionId', 'locale'])
    .searchIndex('search_locale', {
      searchField: 'searchText',
      filterFields: ['locale', 'collection', 'searchShard'],
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
    kind: v.union(v.literal('image'), v.literal('document')),
    filenameSort: v.string(),
    discoveryText: v.string(),
    effectiveUpdatedAt: v.number(),
    deletedState: v.union(v.literal('active'), v.literal('trashed')),
  })
    .index('by_entry', ['entryId'])
    .index('by_collection', ['collection'])
    .index('by_scope', ['scope'])
    .index('by_sha256', ['sha256'])
    .index('by_sha256_active_facts', ['sha256', 'deletedAt', 'size', 'mimeType'])
    .index('by_storage', ['storageId'])
    .index('by_created', ['createdAt'])
    .index('by_created_storage', ['createdAt', 'storageId'])
    .index('by_deleted_created_storage', ['deletedAt', 'createdAt', 'storageId'])
    .index('by_scope_deleted_created_storage', ['scope', 'deletedAt', 'createdAt', 'storageId'])
    .index('by_scope_collection_deleted_created_storage', [
      'scope',
      'collection',
      'deletedAt',
      'createdAt',
      'storageId',
    ])
    .index('by_scope_entry_deleted_created_storage', [
      'scope',
      'entryId',
      'deletedAt',
      'createdAt',
      'storageId',
    ])
    .index('by_filename', ['filenameSort'])
    .index('by_effective_updated', ['effectiveUpdatedAt'])
    .index('by_size', ['size'])
    .index('by_kind_filename', ['kind', 'filenameSort'])
    .searchIndex('search_discovery', {
      searchField: 'discoveryText',
      filterFields: ['kind', 'deletedState', 'scope', 'collection'],
    }),

  assetUploadSessions: defineTable({
    sessionId: v.string(),
    ownerId: v.string(),
    tokenHash: v.string(),
    state: v.union(
      v.literal('awaiting-upload'),
      v.literal('uploaded'),
      v.literal('verified-replacement'),
      v.literal('finalized'),
      v.literal('cleanup-queued'),
    ),
    generation: v.number(),
    storageId: v.optional(v.id('_storage')),
    assetId: v.optional(v.id('assets')),
    replacementAssetId: v.optional(v.id('assets')),
    replacementFilename: v.optional(v.string()),
    replacementMimeType: v.optional(
      v.union(
        v.literal('image/gif'),
        v.literal('image/jpeg'),
        v.literal('image/png'),
        v.literal('image/webp'),
      ),
    ),
    replacementSize: v.optional(v.number()),
    replacementSha256: v.optional(v.string()),
    replacementWidth: v.optional(v.number()),
    replacementHeight: v.optional(v.number()),
    replacementFrames: v.optional(v.number()),
    replacementRecoveryArtifactId: v.optional(v.string()),
    replacementVerifiedAt: v.optional(v.number()),
    createdAt: v.number(),
    expiresAt: v.number(),
    claimedAt: v.optional(v.number()),
    finalizedAt: v.optional(v.number()),
  })
    .index('by_session', ['sessionId'])
    .index('by_storage', ['storageId'])
    .index('by_state_expires_at', ['state', 'expiresAt']),

  assetCleanupTasks: defineTable({
    storageId: v.id('_storage'),
    uploadSessionId: v.optional(v.id('assetUploadSessions')),
    status: v.union(v.literal('cleanup-required'), v.literal('terminal-failure')),
    generation: v.number(),
    attempts: v.number(),
    lastError: v.union(v.string(), v.null()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_status', ['status', 'updatedAt'])
    .index('by_status_updatedAt_storage', ['status', 'updatedAt', 'storageId'])
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
    .index('by_email', ['email'])
    .index('by_role', ['role']),

  memberInvitations: defineTable({
    invitationId: v.string(),
    email: v.string(),
    role: v.union(
      v.literal('owner'),
      v.literal('publisher'),
      v.literal('editor'),
      v.literal('viewer'),
    ),
    tokenHash: v.string(),
    generation: v.number(),
    deliveryState: v.union(v.literal('prepared'), v.literal('delivered'), v.literal('failed')),
    expiresAt: v.number(),
    createdBy: v.string(),
    createdAt: v.number(),
    updatedBy: v.string(),
    updatedAt: v.number(),
    deliveredAt: v.union(v.number(), v.null()),
  })
    .index('by_invitation_id', ['invitationId'])
    .index('by_email', ['email'])
    .index('by_token_hash', ['tokenHash'])
    .index('by_expires_at', ['expiresAt']),

  mcpCredentialSettings: defineTable({
    apiKeyId: v.string(),
    secretHash: v.string(),
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
    .index('by_secret_hash', ['secretHash'])
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
    .index('by_created_at', ['createdAt'])
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
    .index('by_entry', ['entryId'])
    .index('by_expires_at', ['expiresAt']),

  reviewRequests: defineTable({
    agentRunId: v.optional(v.union(v.id('agentRuns'), v.null())),
    mcpOperationKey: v.optional(v.string()),
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
    .index('by_mcp_operation_key', ['mcpOperationKey'])
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
    previewHash: v.string(),
    versionHash: v.string(),
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
    status: v.union(v.literal('applied'), v.literal('blocked'), v.literal('stale')),
    code: v.union(v.string(), v.null()),
    message: v.union(v.string(), v.null()),
    recordedAt: v.number(),
    executePath: v.string(),
  }),

  activity: defineTable({
    kind: v.string(),
    outcome: activityOutcomeValidator,
    summary: v.string(),
    retention: v.union(v.literal('standard'), v.literal('legal')),
    entryId: v.union(v.id('entries'), v.null()),
    collection: v.union(v.string(), v.null()),
    locale: v.union(v.string(), v.null()),
    detail: v.union(jsonValueValidator, v.null()),
    subjectKey: v.optional(v.union(v.string(), v.null())),
    appIdentityId: v.string(),
    actorLabel: v.union(v.string(), v.null()),
    createdAt: v.number(),
  })
    .index('by_time', ['createdAt'])
    .index('by_retention_time', ['retention', 'createdAt'])
    .index('by_entry', ['entryId', 'createdAt'])
    .index('by_kind_subject', ['kind', 'subjectKey'])
    .index('by_kind_time', ['kind', 'createdAt'])
    .index('by_outcome_time', ['outcome', 'createdAt'])
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

  draftSearchEntries: defineTable({
    entryId: v.id('entries'),
    collection: v.string(),
    locale: v.string(),
    slug: v.string(),
    title: v.string(),
    searchText: v.string(),
    lifecycle: v.union(v.literal('active'), v.literal('archived')),
    status: v.union(v.literal('draft'), v.literal('published'), v.literal('archived')),
    updatedAt: v.number(),
    sourceDraftVersion: v.number(),
    sourceSharedVersion: v.number(),
    sourceLocaleVersion: v.number(),
    sourcePublicationHash: v.string(),
    hasUnpublishedChanges: v.boolean(),
    hasMissingTranslations: v.boolean(),
  })
    .index('by_entry_locale', ['entryId', 'locale'])
    .index('by_collection_locale_lifecycle_updatedAt', [
      'collection',
      'locale',
      'lifecycle',
      'updatedAt',
      'entryId',
    ])
    .index('by_collection_locale_status_updatedAt', [
      'collection',
      'locale',
      'status',
      'updatedAt',
      'entryId',
    ])
    .index('by_collection_locale_changes_lifecycle_updatedAt', [
      'collection',
      'locale',
      'hasUnpublishedChanges',
      'lifecycle',
      'updatedAt',
      'entryId',
    ])
    .index('by_collection_locale_changes_status_updatedAt', [
      'collection',
      'locale',
      'hasUnpublishedChanges',
      'status',
      'updatedAt',
      'entryId',
    ])
    .index('by_collection_locale_missing_lifecycle_updatedAt', [
      'collection',
      'locale',
      'hasMissingTranslations',
      'lifecycle',
      'updatedAt',
      'entryId',
    ])
    .index('by_collection_locale_missing_status_updatedAt', [
      'collection',
      'locale',
      'hasMissingTranslations',
      'status',
      'updatedAt',
      'entryId',
    ])
    .searchIndex('search_collection_locale', {
      searchField: 'searchText',
      filterFields: [
        'collection',
        'locale',
        'lifecycle',
        'status',
        'hasUnpublishedChanges',
        'hasMissingTranslations',
      ],
    }),

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

  projectionRepairRuns: defineTable({
    runId: v.string(),
    state: v.union(
      v.literal('running'),
      v.literal('complete'),
      v.literal('failed'),
      v.literal('dead'),
    ),
    phase: v.union(
      v.literal('entries'),
      v.literal('drafts'),
      v.literal('revisions'),
      v.literal('draftSearchRows'),
      v.literal('publicRows'),
      v.literal('publicSearchRows'),
      v.literal('assetRefs'),
      v.literal('verifyEntries'),
      v.literal('verifyDrafts'),
      v.literal('verifyRevisions'),
      v.literal('verifyDraftSearchRows'),
      v.literal('verifyPublicRows'),
      v.literal('verifyPublicSearchRows'),
      v.literal('verifyAssetRefs'),
    ),
    cursor: v.union(v.string(), v.null()),
    generation: v.number(),
    canonicalGeneration: v.number(),
    workGeneration: v.number(),
    workToken: v.union(v.string(), v.null()),
    workLeaseExpiresAt: v.union(v.number(), v.null()),
    workAttempts: v.number(),
    workNextAttemptAt: v.union(v.number(), v.null()),
    workLastError: v.union(v.string(), v.null()),
    workDeadLetteredAt: v.union(v.number(), v.null()),
    pageSize: v.number(),
    autoContinue: v.boolean(),
    processedEntries: v.number(),
    processedDrafts: v.number(),
    processedRevisions: v.number(),
    inspectedDraftSearchRows: v.number(),
    inspectedPublicRows: v.number(),
    inspectedAssetRefs: v.number(),
    referencedAssetIds: v.array(v.string()),
    repairedPublicRows: v.number(),
    repairedDraftSearchRows: v.number(),
    repairedAssetRefSources: v.number(),
    deletedOrphans: v.number(),
    issueCount: v.number(),
    lastIssue: v.union(v.string(), v.null()),
    createdBy: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
    completedAt: v.union(v.number(), v.null()),
  }).index('by_run_id', ['runId']),

  assetReferenceProofState: defineTable({
    key: v.literal('global'),
    canonicalGeneration: v.number(),
    verifiedRunId: v.union(v.string(), v.null()),
    verifiedAt: v.union(v.number(), v.null()),
  }).index('by_key', ['key']),

  contentAssetRefs: defineTable({
    sourceKind: v.union(v.literal('draft'), v.literal('revision'), v.literal('public')),
    // string id rather than v.id(...) since sourceKind discriminates the
    // table — the row points at one of three different doc types.
    sourceId: v.string(),
    sourceFence: v.union(
      v.object({ kind: v.literal('draftVersion'), version: v.number() }),
      v.object({
        kind: v.literal('revision'),
        revisionId: v.id('entryRevisions'),
        contentHash: v.string(),
      }),
      v.object({
        kind: v.literal('publicRevision'),
        revisionId: v.id('entryRevisions'),
      }),
    ),
    assetId: v.string(),
    fieldPath: v.string(),
    locale: v.optional(v.union(v.string(), v.null())),
    entryId: v.id('entries'),
    collection: v.string(),
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
    storageRef: v.id('_storage'),
    generation: v.number(),
    byteSize: v.number(),
    bytesSha256: v.string(),
    assetFactsHash: v.string(),
    assetUpdatedAt: v.number(),
    purgeFenceTokenHash: v.optional(v.string()),
    purgeFenceIssuedTo: v.optional(v.string()),
    purgeFenceExpiresAt: v.optional(v.number()),
    createdBy: v.string(),
    createdAt: v.number(),
  })
    .index('by_artifact', ['artifactId'])
    .index('by_storage', ['storageRef'])
    .index('by_entry', ['entryId'])
    .index('by_asset_created', ['assetId', 'createdAt'])
    .index('by_created', ['createdAt']),
})
