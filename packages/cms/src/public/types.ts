import type {
  CollectionMode,
  CollectionType,
  FieldDefinition,
  JsonValue,
  LocaleConfig,
  LocaleText,
  SlugMode,
} from '@lupinum/ginko-cms-contract/shared/types.js'
import type { FunctionReference } from 'convex/server'

export interface GinkoCmsPublicConfig {
  route: string
  debugStudio?: boolean
  defaultLocale: string
  locales: Array<Pick<LocaleConfig, 'code' | 'label'>>
  collections?: Record<string, CmsCollectionConfig>
  sidebar?: { dark?: boolean }
  mcp?: { enabled: boolean }
  studio?: {
    assetBase?: string
    devServer?: string | null
  }
}

export interface GinkoCmsHostAuthEngine {
  token: { value: string | null | undefined }
  user: { value: unknown }
  pending: { value: boolean }
  isAuthenticated: { value: boolean }
  isAnonymous: { value: boolean }
  signOut: () => Promise<void> | void
  awaitAuthReady?: () => Promise<unknown>
}

type StudioQueryRef = FunctionReference<'query'>
type StudioMutationRef = FunctionReference<'mutation'>

export interface GinkoCmsStudioHostApi {
  ginkoCms: {
    assets: {
      attachAssetsToEntry: StudioMutationRef
      deleteAsset: StudioMutationRef
      generateUploadUrl: StudioMutationRef
      getAsset: StudioQueryRef
      getAssetManagerData: StudioQueryRef
      listColocatedAssets: StudioQueryRef
      moveAsset: StudioMutationRef
      previewDeleteAssetOperation: StudioMutationRef
      purgeAsset: StudioMutationRef
      registerAsset: StudioMutationRef
      resolveAssetUrls: StudioQueryRef
      restoreAsset: StudioMutationRef
      updateAsset: StudioMutationRef
    }
    collections: {
      getCollection: StudioQueryRef
      listCollections: StudioQueryRef
    }
    imports: {
      listImportRuns: StudioQueryRef
    }
    diagnostics: {
      validatePublicRoutes: StudioQueryRef
      explainPublicVisibility: StudioQueryRef
      previewPublishImpact: StudioQueryRef
      storageHygieneReport: StudioQueryRef
    }
    editor: {
      archiveEntry: StudioMutationRef
      createCheckpoint: StudioMutationRef
      createEntry: StudioMutationRef
      createLocaleVariant: StudioMutationRef
      deleteEntry: StudioMutationRef
      getDraftVsPublishedDiff: StudioQueryRef
      getEntry: StudioQueryRef
      getEntryActivity: StudioQueryRef
      getStudioOverview: StudioQueryRef
      getVersionDiff: StudioQueryRef
      getVersionSnapshot: StudioQueryRef
      listActivity: StudioQueryRef
      listEntrySummaries: StudioQueryRef
      listEntries: StudioQueryRef
      listEntriesForStudio: StudioQueryRef
      listVersions: StudioQueryRef
      previewArchiveEntryOperation: StudioMutationRef
      previewDeleteEntryOperation: StudioMutationRef
      previewPublishEntryOperation: StudioMutationRef
      previewRollbackVersionOperation: StudioMutationRef
      previewUnpublishEntryOperation: StudioMutationRef
      publishEntry: StudioMutationRef
      reparentEntry: StudioMutationRef
      reorderEntry: StudioMutationRef
      rollbackVersion: StudioMutationRef
      saveEntryDraft: StudioMutationRef
      unpublishEntry: StudioMutationRef
    }
    mcpKeys: {
      create: StudioMutationRef
      list: StudioQueryRef
      revoke: StudioMutationRef
    }
    members: {
      addMember: StudioMutationRef
      bootstrapCmsOwner: StudioMutationRef
      getAccessContext: StudioQueryRef
      listMembers: StudioQueryRef
      previewRemoveMemberOperation: StudioMutationRef
      removeMember: StudioMutationRef
      updateMemberRole: StudioMutationRef
    }
    public: {
      list: StudioQueryRef
      nav: StudioQueryRef
      page: StudioQueryRef
      search: StudioQueryRef
      singleton: StudioQueryRef
      sitemap: StudioQueryRef
      siteData: StudioQueryRef
      surround: StudioQueryRef
    }
    revalidation: {
      listRevalidationJobs: StudioQueryRef
      listRevalidationTargets: StudioQueryRef
      previewRetryRevalidationJobOperation: StudioMutationRef
      retryRevalidationJob: StudioMutationRef
      upsertRevalidationTarget: StudioMutationRef
    }
    settings: {
      getSettings: StudioQueryRef
      getStudioSettings: StudioQueryRef
      updateSettings: StudioMutationRef
    }
    siteData: {
      createSiteDataBlock: StudioMutationRef
      deleteSiteDataBlock: StudioMutationRef
      getSiteDataBlock: StudioQueryRef
      listSiteData: StudioQueryRef
      previewDeleteSiteDataBlockOperation: StudioMutationRef
      saveSiteData: StudioMutationRef
      updateSiteDataBlock: StudioMutationRef
    }
  }
}

export interface GinkoCmsStudioHostBridge {
  convexUrl: string
  config: GinkoCmsPublicConfig
  getAuthToken: () => string | null | Promise<string | null>
  onSignOut: () => void | Promise<void>
  nuxtApp?: Record<string, unknown>
  api?: GinkoCmsStudioHostApi
  auth?: Pick<
    GinkoCmsHostAuthEngine,
    'token' | 'user' | 'pending' | 'isAuthenticated' | 'isAnonymous'
  > | null
}

export interface CmsStudioSettingsQueryResult {
  locales?: LocaleConfig[]
}

export interface CmsCollectionRouting {
  routing?: Partial<{
    mode?: CollectionMode
    pathPrefix: string
    slugMode?: SlugMode
    rootSlug?: string | null
    singleton?: boolean
  }>
  pathPrefix?: string | null
  mode?: CollectionMode
  rootSlug?: string | null
  singleton?: boolean
  slugMode?: SlugMode
}

export interface CmsCollectionConfig extends CmsCollectionRouting {
  label?: LocaleText
  icon?: string | null
  type?: CollectionType
  locales?: string[]
  fields?: FieldDefinition[]
  settings?: JsonValue
}

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------

/** A navigation section (top-level sidebar partition / tab). */
export interface CmsNavSection {
  /** Slugified section id. */
  id: string
  /** Original section slug. */
  slug?: string
  /** Display title. */
  title: string
  /** First routable page within the section. */
  path?: string
  /** Optional icon string (e.g., `'lucide:rocket'`). */
  icon?: string
  /** Groups within this section. */
  groups: CmsNavGroup[]
}

/** A navigation group (section heading / separator). */
export interface CmsNavGroup {
  /** Slugified group id. */
  id: string
  /** Display title. `undefined` = ungrouped (no heading rendered). */
  title?: string
  /** Navigation items in this group. */
  items: CmsNavItem[]
}

/** A navigation item (page or folder). */
export interface CmsNavItem {
  /** Display title. */
  title: string
  /** Resolved URL path. `undefined` = not routable. */
  path?: string
  /** Item kind. 'folder' items are collapsible groups, not navigable links. */
  kind?: 'page' | 'folder'
  /** Optional icon string. */
  icon?: string
  /** Optional badge text. */
  badge?: string
  /** Child items (empty for leaf pages). */
  children: CmsNavItem[]
}

/** A previous or next page link in a hierarchy. */
export interface CmsSurroundItem {
  /** Display title. */
  title?: string
  /** Resolved URL path. */
  path: string
}
