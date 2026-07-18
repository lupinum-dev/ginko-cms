import type {
  CollectionMode,
  CollectionType,
  FieldDefinition,
  JsonValue,
  LocaleConfig,
  LocaleText,
  SlugMode,
} from '@lupinum/ginko-cms-contract/shared/types.js'
import type { ComponentApi as GinkoCmsComponentApi } from '@lupinum/ginko-cms-convex/component'
import type { ConvexAuthStatus, ConvexClientHandle, ConvexUser } from 'better-convex-nuxt'
import type { ComputedRef, Ref } from 'vue'

import type { GinkoCmsExpectedContractHashes } from './contract-compatibility.js'
import type { StudioApiFromSurface, studioApiSurface } from './studio-api-surface.js'

export interface GinkoCmsPublicConfig {
  route: string
  debugStudio?: boolean
  defaultLocale: string
  locales: Array<Pick<LocaleConfig, 'code' | 'label'>>
  collections?: Record<string, CmsCollectionConfig>
  sidebar?: { dark?: boolean }
  mcp?: { enabled: boolean }
  /**
   * Build-time hashes of the Content contract and editorial presentation
   * resolved by the host module. Studio compares these trusted host values to
   * the installed contract before any write transport is allowed.
   */
  contract: GinkoCmsExpectedContractHashes
  /**
   * Draft preview route convention (EDT-10). Studio links "Preview draft" to
   * `<route>/[collection]/[entryId]?locale=<code>` on the host origin; the
   * host owns that page (session-guarded, noindex). `null` hides the links.
   */
  preview?: { route?: string | null }
  studio?: {
    assetBase?: string
    devServer?: string | null
  }
}

/**
 * The replacement-safe Convex client handle exposed by better-convex-nuxt's
 * `useConvex()` (vNext §5.4) — exactly `query | mutation | action | onUpdate`,
 * with a stable identity that survives primary-client replacement across
 * sign-in/sign-out. The Studio host bridge carries this handle so the SPA never
 * captures the raw, replaceable primary client.
 *
 * This public alias keeps Ginko's bridge vocabulary stable while using the
 * canonical handle exported by better-convex-nuxt.
 */
export type GinkoCmsConvexClientHandle = ConvexClientHandle

/**
 * The auth subset the Studio host bridge carries: the
 * `status | isPending | isAuthenticated | user` slice of better-convex-nuxt's
 * `UseConvexAuthReturn` (vNext §5.3, §10.6). No Convex JWT crosses the bridge.
 *
 * Built from library-exported primitives (`ConvexAuthStatus`, `ConvexUser`) so
 * it stays assignable from the real `useConvexAuth()` return.
 */
export interface GinkoCmsStudioHostBridgeAuth {
  status: ComputedRef<ConvexAuthStatus>
  isPending: ComputedRef<boolean>
  isAuthenticated: ComputedRef<boolean>
  user: Readonly<Ref<ConvexUser | null>>
}

/**
 * The Studio host API allowlist, derived mechanically from the single
 * {@link studioApiSurface} descriptor (vNext §10.7). Every group / function /
 * operation kind lives in `studio-api-surface.ts`; this type is only its
 * projection into `FunctionReference`s. `buildStudioHostApi()` constructs a
 * picked runtime object from the same descriptor, so the bridge type and the
 * runtime object can never drift, and no un-listed backend function can appear
 * on either.
 */
export type GinkoCmsStudioHostApi = StudioApiFromSurface<
  typeof studioApiSurface,
  GinkoCmsComponentApi
>

export interface GinkoCmsStudioHostBridge {
  /** The stable, replacement-safe Convex client handle from `useConvex()`. */
  convexClient: GinkoCmsConvexClientHandle
  config: GinkoCmsPublicConfig
  api: GinkoCmsStudioHostApi
  auth: GinkoCmsStudioHostBridgeAuth | null
  onSignOut: () => void | Promise<void>
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
