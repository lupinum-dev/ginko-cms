import type {
  CollectionMode,
  CollectionType,
  FieldDefinition,
  JsonValue,
  LocaleText,
  SlugMode,
} from '@lupinum/ginko-cms-contract/shared/types.js'

export type FieldConfig = FieldDefinition

export type LocaleConfig = {
  code: string
  label?: string
  isDefault?: boolean
  fallback?: string
}

export interface CollectionConfig {
  /** Display label. Defaults to a titleized slug when omitted. */
  label?: LocaleText
  /** 'flat' for blog/legal, 'tree' for docs hierarchy */
  type: CollectionType
  /** Iconify icon name for sidebar */
  icon?: string
  /** Locale codes this collection supports */
  locales?: string[]
  /** Routing config */
  routing: {
    /**
     * Public content mode.
     * - route: entries can produce pages, nav, surround, sitemap URLs.
     * - none: entries are data-only and rejected by route-only public APIs.
     * @default 'route'
     */
    mode?: CollectionMode
    pathPrefix: string
    slugMode?: SlugMode
    rootSlug?: string | null
    singleton?: boolean
  }
  /** Code-defined field definitions synced into Studio as a read-only contract. */
  fields?: FieldConfig[]
  /** Collection settings */
  settings?: JsonValue
}

export interface SiteI18nEntry {
  name?: string
  description?: string
}

export interface CmsEditorialLayout {
  collections: Record<
    string,
    {
      label?: LocaleText
      icon?: string
      fields: Record<
        string,
        {
          label?: LocaleText
          description?: string | null
          hidden?: boolean
          width?: 'full' | 'half'
        }
      >
    }
  >
}

export interface ModuleOptions {
  /** Route where the studio admin UI is mounted (default: '/studio') */
  route: string
  /** Presentation-only Studio layout keyed by resolved Content collection and field IDs. */
  editorialLayout?: CmsEditorialLayout
  /** Enable client-side studio debug logging (defaults to dev only when unset) */
  debugStudio?: boolean
  /**
   * Per-locale overrides for nuxt-site-config i18n keys (`nuxtSiteConfig.name`,
   * `nuxtSiteConfig.description`). Falls back to `site.name` / `site.description`
   * from `nuxt.config.ts` when a locale has no entry here.
   *
   * @example
   * siteI18n: { de: { name: 'Acme', description: 'Schneller entwickeln.' } }
   */
  siteI18n?: Record<string, SiteI18nEntry>
  /** Studio sidebar appearance */
  sidebar?: {
    /**
     * Force a dark sidebar even in light mode.
     * In dark mode the sidebar is always dark regardless of this setting.
     * @default false
     */
    dark?: boolean
  }
  /**
   * Register MCP server routes for this app.
   *
   * MCP tables, bridge operations, generated types, and Studio settings are
   * part of the CMS core. Setting this to false only skips Nitro route
   * registration.
   */
  mcp?: boolean
}

/**
 * Resolved exclusively from ResolvedContentContractV1 during module setup.
 *
 * @internal
 */
export type ResolvedModuleOptions = ModuleOptions & {
  collections: Record<string, CollectionConfig>
  defaultLocale: string
  locales: LocaleConfig[]
}
