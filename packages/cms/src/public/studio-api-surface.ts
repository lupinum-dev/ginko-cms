import type { FunctionReference } from 'convex/server'

/**
 * Ginko CMS Studio API allowlist (vNext §10.7).
 *
 * This descriptor is the single source of truth for the exact
 * `api.ginkoCms.*` functions the standalone Studio SPA is allowed to reach
 * across the host bridge. It drives two things:
 *
 *  1. {@link StudioApiFromSurface} derives the bridge type
 *     (`GinkoCmsStudioHostApi`) so Studio code can only reference functions
 *     named here, each with the declared operation kind.
 *  2. `buildStudioHostApi()` (in `runtime/pages/studio-host-api.ts`) iterates this
 *     descriptor to construct a *picked* runtime object — it copies only the
 *     references named here out of the generated `#convex/api`, and throws a
 *     `TypeError` if any is missing. A backend function that is not listed here
 *     is never handed to the SPA, even if it exists on `#convex/api`.
 *
 * The complementary consumer-build type test (`type-tests/studio-api-surface.ts`)
 * asserts, against the generated `#convex/api`, that every entry below exists
 * and has the declared kind, and that no function absent from this descriptor
 * leaks into the constructed bridge type.
 */
export type StudioOperationKind = 'query' | 'mutation' | 'action'

export type StudioApiEntry =
  | StudioOperationKind
  | {
      kind: StudioOperationKind
      component?: string
      componentGroup?: string
      confirmation?: true
      omitArgs?: readonly string[]
    }

export type StudioApiSurface = Record<string, Record<string, StudioApiEntry>>

/**
 * Every currently-allowed Studio group, function, and operation kind.
 *
 * `as const satisfies StudioApiSurface` pins each kind to a literal
 * `'query' | 'mutation' | 'action'`, so a misspelled kind fails to compile locally
 * (before the generated-api type test even runs).
 */
export const studioApiSurface = {
  agentRuns: {
    completeRun: 'mutation',
    listRuns: 'query',
    revokeRun: 'mutation',
  },
  assets: {
    claimAssetUploadSession: 'mutation',
    createAssetUploadSession: 'mutation',
    deleteAsset: {
      kind: 'mutation',
      component: 'deleteAssetOperationExecute',
      confirmation: true,
    },
    finalizeAssetUploadSession: 'action',
    getAsset: 'query',
    getAssetManagerData: 'query',
    getAssetManagerFacets: 'query',
    listAssetsByOwner: 'query',
    listAssetUsages: 'query',
    moveAsset: 'mutation',
    previewDeleteAssetOperation: 'mutation',
    previewPurgeAssetOperation: 'mutation',
    previewReplaceAssetOperation: 'mutation',
    purgeAsset: { kind: 'action', confirmation: true },
    replaceAsset: { kind: 'action', confirmation: true },
    resolveAssetUrls: 'query',
    restoreAsset: 'mutation',
    updateAsset: 'mutation',
    verifyAssetReplacementUpload: 'action',
  },
  collections: {
    getCollection: 'query',
    listCollections: 'query',
    searchStudioEntries: 'query',
  },
  contract: {
    getInstalledContractStatus: 'query',
  },
  mcpOAuthDelegations: {
    createDelegation: 'mutation',
    listDelegations: 'query',
    revokeDelegation: 'mutation',
  },
  diagnostics: {
    explainPublicVisibility: 'query',
  },
  editor: {
    archiveEntry: {
      kind: 'mutation',
      component: 'archiveEntryOperationExecute',
      confirmation: true,
    },
    createCheckpoint: 'mutation',
    createEntry: 'mutation',
    duplicateEntry: 'mutation',
    createLocaleVariant: 'mutation',
    getDraftVsPublishedDiff: 'query',
    getEntry: 'query',
    getEntryReadinessDetail: 'query',
    getEntryReadinessSummary: 'query',
    getEntryActivity: 'query',
    getStudioOverview: 'query',
    getVersionDiff: 'query',
    getVersionSnapshot: 'query',
    listActivity: 'query',
    listEntrySummaries: 'query',
    listEntriesForStudio: 'query',
    listPublishRouteImpactPage: 'query',
    listRedirects: 'query',
    listStudioWorkQueue: 'query',
    listVersions: 'query',
    previewArchiveEntryOperation: 'mutation',
    previewPermanentlyDeleteEntryOperation: 'mutation',
    previewPublishEntryOperation: 'mutation',
    previewReorderEntryOperation: 'mutation',
    previewReparentEntryOperation: 'mutation',
    previewRetireRedirectOperation: 'mutation',
    previewRestoreEntryOperation: 'mutation',
    previewRollbackVersionOperation: 'mutation',
    previewUnpublishEntryOperation: 'mutation',
    publishEntry: {
      kind: 'mutation',
      component: 'publishEntryOperationExecute',
      confirmation: true,
    },
    permanentlyDeleteEntry: {
      kind: 'mutation',
      component: 'permanentlyDeleteEntryOperationExecute',
      confirmation: true,
    },
    reparentEntry: {
      kind: 'mutation',
      component: 'reparentEntryOperationExecute',
      confirmation: true,
    },
    reorderEntry: {
      kind: 'mutation',
      component: 'reorderEntryOperationExecute',
      confirmation: true,
    },
    retireRedirect: {
      kind: 'mutation',
      component: 'retireRedirectOperationExecute',
      confirmation: true,
    },
    restoreEntry: {
      kind: 'mutation',
      component: 'restoreEntryOperationExecute',
      confirmation: true,
    },
    rollbackVersion: {
      kind: 'mutation',
      component: 'rollbackVersionOperationExecute',
      confirmation: true,
    },
    saveEntryDraft: 'mutation',
    unpublishEntry: {
      kind: 'mutation',
      component: 'unpublishEntryOperationExecute',
      confirmation: true,
    },
  },
  members: {
    acceptMemberInvitation: 'mutation',
    bootstrapCmsOwner: 'mutation',
    getAccessContext: 'query',
    listMemberInvitations: 'query',
    listMembers: 'query',
    previewRemoveMemberOperation: 'mutation',
    removeMember: {
      kind: 'mutation',
      component: 'removeMemberOperationExecute',
      confirmation: true,
    },
    resendMemberInvitation: {
      kind: 'action',
      component: 'prepareMemberInvitationResendDelivery',
      omitArgs: ['tokenHash', '_trustedCaller'],
    },
    revokeMemberInvitation: 'mutation',
    sendMemberInvitation: {
      kind: 'action',
      component: 'prepareMemberInvitationDelivery',
      omitArgs: ['tokenHash', '_trustedCaller'],
    },
    updateMemberRole: 'mutation',
  },
  maintenance: {
    getStorageHealth: {
      kind: 'query',
      componentGroup: 'storageMaintenance',
    },
    runStorageDiagnostic: {
      kind: 'mutation',
      componentGroup: 'storageMaintenance',
    },
  },
  public: {
    list: 'query',
    nav: 'query',
    page: 'query',
    search: 'query',
    singleton: 'query',
    sitemap: 'query',
    siteData: 'query',
    surround: 'query',
  },
  revalidation: {
    listRevalidationJobs: 'query',
    listRevalidationTargets: 'query',
    previewRetryRevalidationJobOperation: 'mutation',
    retryRevalidationJob: {
      kind: 'mutation',
      component: 'retryRevalidationJobOperationExecute',
      confirmation: true,
    },
    testRevalidationTarget: 'action',
    upsertRevalidationTarget: 'mutation',
  },
  reviewRequests: {
    approveReview: 'mutation',
    listPendingReviews: 'query',
    listRecentReviewOutcomes: 'query',
    listRecentReviewOutcomesForEntry: 'query',
    rejectReview: 'mutation',
    requestPublishReview: 'mutation',
  },
  settings: {
    getStudioSettings: 'query',
  },
  siteData: {
    createSiteDataBlock: 'mutation',
    deleteSiteDataBlock: {
      kind: 'mutation',
      component: 'deleteSiteDataBlockOperationExecute',
      confirmation: true,
    },
    getSiteDataBlock: 'query',
    listSiteData: 'query',
    previewDeleteSiteDataBlockOperation: 'mutation',
    saveSiteData: 'mutation',
    updateSiteDataBlock: 'mutation',
  },
} as const satisfies StudioApiSurface

/**
 * The mapped bridge type derived from a {@link StudioApiSurface} descriptor
 * (vNext §10.7). Each descriptor kind becomes the matching
 * `FunctionReference<'query' | 'mutation' | 'action'>`. Because the bridge type is built
 * *only* from the descriptor, a backend function absent from the descriptor can
 * never appear on it.
 */
export type StudioApiFromSurface<Surface extends StudioApiSurface, ComponentApi> = {
  ginkoCms: {
    [Group in keyof Surface]: {
      [Name in keyof Surface[Group]]: StudioFunctionReference<
        ComponentApi,
        Group,
        Name,
        Surface[Group][Name]
      >
    }
  }
}

type StudioFunctionReference<ComponentApi, Group, Name, Entry extends StudioApiEntry> =
  StudioComponentGroup<Entry, Group> extends keyof ComponentApi
    ? StudioComponentName<Entry, Name> extends keyof ComponentApi[StudioComponentGroup<
        Entry,
        Group
      >]
      ? ComponentApi[StudioComponentGroup<Entry, Group>][StudioComponentName<
          Entry,
          Name
        >] extends FunctionReference<
          infer Kind,
          infer _Visibility,
          infer Args,
          infer Return,
          infer ComponentPath
        >
        ? FunctionReference<Kind, 'public', StudioArgs<Entry, Args>, Return, ComponentPath>
        : never
      : never
    : never

export type StudioEntryKind<Entry> = Entry extends {
  kind: infer Kind extends StudioOperationKind
}
  ? Kind
  : Entry extends StudioOperationKind
    ? Entry
    : never

type StudioComponentName<Entry extends StudioApiEntry, Name> = Entry extends {
  component: infer ComponentName
}
  ? ComponentName
  : Name

type StudioComponentGroup<Entry extends StudioApiEntry, Group> = Entry extends {
  componentGroup: infer ComponentGroup
}
  ? ComponentGroup
  : Group

type StudioArgs<Entry extends StudioApiEntry, Args> = StudioConfirmationArgs<
  Entry,
  StudioOmittedArgs<Entry, Args>
>

type StudioOmittedArgs<Entry extends StudioApiEntry, Args> =
  Args extends Record<string, unknown>
    ? Omit<
        Args,
        | '_expectedContentHash'
        | '_expectedPresentationHash'
        | '_trustedCaller'
        | (Entry extends { omitArgs: readonly (infer Key extends string)[] } ? Key : never)
      >
    : Args

type StudioConfirmationArgs<Entry extends StudioApiEntry, Args> = Entry extends {
  confirmation: true
}
  ? Args extends Record<string, unknown>
    ? Omit<Args, '_confirmationToken'> & { _confirmationToken: string }
    : Args
  : Args
