import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  defineNuxtModule,
  addServerHandler,
  createResolver,
  addComponentsDir,
  addTypeTemplate,
} from '@nuxt/kit'
import type { Nuxt, NuxtModule } from '@nuxt/schema'
import { ConvexHttpClient } from 'convex/browser'
import { anyApi } from 'convex/server'
import { defu } from 'defu'
import type { PluginOption } from 'vite'

import { resolveConfiguredCollections } from './module/collections.js'
import { loadGinkoContentProviderName } from './module/content-contract.js'
import { assertConvexBridgeInstalled } from './module/convex.js'
import {
  resolveLocaleSettings,
  assertI18nCompatibility,
  hasConfiguredI18nLocales,
  syncConfiguredI18nDefaults,
} from './module/i18n.js'
import type { I18nModuleOptions } from './module/i18n.js'
import type { ModuleOptions } from './module/options.js'
import { registerStudioPages } from './module/pages.js'
import { renderPublicContractTypes } from './module/public-contract.js'
import { buildPublicRuntimeCollections } from './module/runtime-config.js'
import { createTailwindPlugin } from './module/tailwind.js'

export type {
  FieldConfig,
  CollectionConfig,
  LocaleConfig,
  ModuleOptions,
} from './module/options.js'

interface NuxtOptionsExt {
  ginkoCms?: Partial<ModuleOptions> | false
  i18n?: I18nModuleOptions
  colorMode?: {
    classSuffix?: string
  }
  convex?: Record<string, unknown>
  content?: {
    i18n?: {
      defaultLocale?: string
      locales?: string[]
      fallback?: Record<string, string[]>
      translatedSlugs?: boolean
    }
    search?: false | { engine?: string }
  }
  runtimeConfig: {
    public: { ginkoCms?: Record<string, unknown> }
    ginkoCms?: Record<string, unknown>
  }
}

type GinkoCmsUserOptions = Partial<ModuleOptions>

interface NitroOptionsExt {
  scanDirs?: string[]
  experimental?: {
    asyncContext?: boolean
  }
  prerender?: {
    routes?: string[]
  }
  publicAssets?: Array<{ baseURL: string; dir: string; maxAge?: number }>
}

type PublicContentApiOption = NonNullable<ModuleOptions['publicContent']>['api']

const CMS_CONTENT_PROVIDER_NAME = 'cms'
const CMS_CONTENT_PROVIDER_MODULE = '@lupinum/ginko-cms/nuxt-provider'

function hasNuxtI18nModule(modules: unknown[] = []): boolean {
  return modules.some((entry) => {
    if (typeof entry === 'string') {
      return entry === '@nuxtjs/i18n'
    }

    if (Array.isArray(entry) && typeof entry[0] === 'string') {
      return entry[0] === '@nuxtjs/i18n'
    }

    return false
  })
}

function inferLocaleOptions(options: ModuleOptions, nuxtOptions: NuxtOptionsExt): ModuleOptions {
  if (options.locales.length > 0) return options

  const contentI18n = nuxtOptions.content?.i18n
  if (Array.isArray(contentI18n?.locales) && contentI18n.locales.length > 0) {
    const defaultLocale = contentI18n.defaultLocale ?? options.defaultLocale
    return {
      ...options,
      defaultLocale,
      locales: contentI18n.locales.map((code) => ({
        code,
        isDefault: code === defaultLocale,
        fallback: contentI18n.fallback?.[code]?.[0],
      })),
    }
  }

  const i18nLocales = nuxtOptions.i18n?.locales
  if (Array.isArray(i18nLocales) && i18nLocales.length > 0) {
    const defaultLocale = nuxtOptions.i18n?.defaultLocale ?? options.defaultLocale
    return {
      ...options,
      defaultLocale,
      locales: i18nLocales.map((locale) => ({
        code: locale.code,
        label: locale.label ?? locale.name,
        isDefault: locale.code === defaultLocale,
      })),
    }
  }

  return options
}

async function assertGinkoContentSearchBoundary(rootDir: string, nuxtOptions: NuxtOptionsExt) {
  const provider = await loadGinkoContentProviderName(rootDir)
  if (provider === 'ginko') {
    throw new Error(
      'content.config.ts provider "ginko" is no longer supported. Use provider "cms" to read website content from Ginko CMS.',
    )
  }
  if (provider !== CMS_CONTENT_PROVIDER_NAME) return

  const search = nuxtOptions.content?.search
  if (search === false || search?.engine === 'cms') return

  throw new Error(
    `ginko-cms detected content.config.ts provider "${provider}", but content.search is not using the CMS search engine. Set \`content.search.engine\` to "cms" or set \`content.search\` to false. The default minisearch engine requires provider.searchSections, which the CMS provider intentionally does not expose.`,
  )
}

function registerCmsContentProvider(nuxt: Nuxt) {
  const hookContentProviders = nuxt.hook as unknown as (
    name: 'content:providers',
    callback: (providers: Record<string, string>) => void,
  ) => void

  hookContentProviders('content:providers', (providers) => {
    const existing = providers[CMS_CONTENT_PROVIDER_NAME]
    if (existing && existing !== CMS_CONTENT_PROVIDER_MODULE) {
      throw new Error(
        `@lupinum/ginko-cms cannot register content provider "cms" because it is already mapped to "${existing}". Remove the duplicate provider registration or use a different provider name.`,
      )
    }
    providers[CMS_CONTENT_PROVIDER_NAME] = CMS_CONTENT_PROVIDER_MODULE
  })
}

// Walk up from this module's URL to locate the @lupinum/ginko-cms package
// root so we can resolve `dist/studio-app/` from published package output.
function locatePackageRoot(): string {
  let current = dirname(fileURLToPath(import.meta.url))
  while (true) {
    const pkgPath = resolve(current, 'package.json')
    if (existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { name?: string }
        if (pkg.name === '@lupinum/ginko-cms') return current
      } catch {
        // ignore unparseable package.json on the way up
      }
    }
    const parent = dirname(current)
    if (parent === current) {
      throw new Error('Could not locate @lupinum/ginko-cms package root.')
    }
    current = parent
  }
}

function readStudioAssetVersion(studioBundleDir: string): string {
  const mainJsPath = resolve(studioBundleDir, 'assets', 'main.js')
  let mainJs: Buffer
  try {
    mainJs = readFileSync(mainJsPath)
  } catch (error) {
    throw new Error(
      `[ginko-cms] Studio bundle entry "${mainJsPath}" is missing. Run \`pnpm --filter @lupinum/ginko-cms build\` before using the CMS module.${
        error instanceof Error ? ` ${error.message}` : ''
      }`,
    )
  }

  return createHash('sha256').update(mainJs).digest('hex').slice(0, 12)
}

const ginkoCmsModule: NuxtModule<ModuleOptions> = defineNuxtModule<ModuleOptions>({
  meta: {
    name: '@lupinum/ginko-cms',
    configKey: 'ginkoCms',
  },
  defaults: {
    route: '/studio',
    debugStudio: undefined,
    collections: {},
    defaultLocale: 'en',
    locales: [],
    search: { enabled: false },
    siteData: { enabled: false },
    publicContent: {
      api: false,
      prerender: false,
      prerenderFailure: 'error',
    },
    forms: { enabled: false },
    mcp: false,
  },
  async setup(options, nuxt) {
    const { resolve: moduleResolve } = createResolver(import.meta.url)
    const moduleOptions = nuxt.options as unknown as NuxtOptionsExt
    registerCmsContentProvider(nuxt)
    options = inferLocaleOptions(options, moduleOptions)
    options.contentTranslatedSlugs = moduleOptions.content?.i18n?.translatedSlugs === true
    const localeSettings = resolveLocaleSettings(options)
    const cmsRuntimeDir = moduleResolve('./runtime')
    const cmsPublicDir = moduleResolve('./public')
    const cmsServerDir = moduleResolve('./server')
    const cmsAuthDir = moduleResolve('./auth')
    const cmsPackageRoot = locatePackageRoot()
    const cmsStudioUiDir = resolve(cmsPackageRoot, 'studio-app/src/components/ui')
    const studioRoute = options.route.replace(/\/$/, '')
    const mcpEnabled = options.mcp === true
    options.collections = await resolveConfiguredCollections({
      rootDir: nuxt.options.rootDir,
      moduleOptions: options,
      defaultLocale: localeSettings.defaultLocale,
      locales: localeSettings.locales,
    })
    await assertGinkoContentSearchBoundary(nuxt.options.rootDir, moduleOptions)

    nuxt.options.alias ??= {}
    nuxt.options.alias['#ginko-cms'] = cmsRuntimeDir
    nuxt.options.alias['#ginko-cms/editor'] = resolve(cmsRuntimeDir, 'editor')
    nuxt.options.alias['#ginko-cms-public'] = cmsPublicDir

    const publicContractTemplate = addTypeTemplate({
      filename: 'types/ginko-cms-public-contract.d.ts',
      getContents: () => renderPublicContractTypes(options),
    })
    nuxt.options.alias['#ginko-cms-public-contract'] = publicContractTemplate.dst

    // i18n integration
    const i18nOptions = (moduleOptions.i18n ??= {})
    const appHasConfiguredLocales = hasConfiguredI18nLocales(i18nOptions)
    const convexOptions = defu(moduleOptions.convex ?? {}, {
      auth: {
        enabled: true,
        routeProtection: {
          redirectTo: `${studioRoute}/auth/signin`,
        },
      },
    }) as Record<string, unknown>
    moduleOptions.convex = convexOptions

    if (appHasConfiguredLocales) {
      assertI18nCompatibility(i18nOptions, localeSettings)
      syncConfiguredI18nDefaults(i18nOptions, localeSettings)
    }

    // Convex backend wiring
    await assertConvexBridgeInstalled(nuxt.options.rootDir, { repair: isNuxtPrepare() })

    const colorModeOptions = (moduleOptions.colorMode ??= {}) as { classSuffix?: string }
    if (typeof colorModeOptions.classSuffix === 'string' && colorModeOptions.classSuffix !== '') {
      throw new Error(
        'ginko-cms requires colorMode.classSuffix to be "" so Tailwind dark utilities target the ".dark" class.',
      )
    }
    colorModeOptions.classSuffix = ''

    // Runtime config injection
    const studioDevServer = process.env.GINKO_STUDIO_DEV_SERVER ?? null
    const packageRoot = locatePackageRoot()
    const studioBundleDir = resolve(packageRoot, 'dist', 'studio-app')
    const studioAssetVersion = studioDevServer ? null : readStudioAssetVersion(studioBundleDir)
    const studioAssetBase = studioAssetVersion
      ? `/_ginko-cms-studio/${studioAssetVersion}`
      : '/_ginko-cms-studio'
    nuxt.options.runtimeConfig.public.ginkoCms = defu(moduleOptions.runtimeConfig.public.ginkoCms, {
      route: options.route,
      debugStudio: options.debugStudio,
      defaultLocale: localeSettings.defaultLocale,
      locales: localeSettings.locales,
      sidebar: {
        dark: options.sidebar?.dark ?? false,
      },
      mcp: {
        enabled: mcpEnabled,
      },
      collections: buildPublicRuntimeCollections(options, localeSettings),
      // Where the host page (src/runtime/pages/studio-host.vue) loads the
      // SPA bundle from. Production uses a content-hashed asset base so the
      // entry and lazy chunks share one module URL graph while still breaking
      // stale browser caches. devServer overrides it when an external
      // `pnpm studio:dev` process is running for HMR.
      studio: {
        assetBase: studioAssetBase,
        devServer: studioDevServer,
      },
    }) as typeof nuxt.options.runtimeConfig.public.ginkoCms

    // Serve the SPA bundle (built by `pnpm studio:build`) as a Nitro public
    // asset under a versioned /_ginko-cms-studio/<hash> base. The host page
    // references <assetBase>/assets/main.js + main.css from there.
    const nitroOptions = ((nuxt.options as { nitro?: NitroOptionsExt }).nitro ??= {})
    const publicAssets = (nitroOptions.publicAssets ??= [])
    if (!publicAssets.some((entry) => entry.baseURL === studioAssetBase)) {
      publicAssets.push({
        baseURL: studioAssetBase,
        dir: studioBundleDir,
        maxAge: nuxt.options.dev ? 0 : 60 * 60 * 24 * 30,
      })
    }

    const publicApiBase = resolvePublicApiRoute(options.publicContent?.api)
    if (publicApiBase) {
      for (const endpoint of [
        'page',
        'list',
        'nav',
        'surround',
        'search',
        'sitemap',
        'singleton',
        'site-data',
      ]) {
        addServerHandler({
          route: `${publicApiBase}/${endpoint}`,
          handler: resolve(cmsServerDir, 'routes/public-api'),
        })
      }
    }

    if (options.publicContent?.prerender && !isTypecheck() && !isNuxtPrepare()) {
      const hookNitroConfig = nuxt.hook as unknown as (
        name: 'nitro:config',
        callback: (
          nitro: NitroOptionsExt & { prerender?: { routes?: string[] } },
        ) => void | Promise<void>,
      ) => void
      hookNitroConfig('nitro:config', async (nitro) => {
        const routes = await loadGinkoPrerenderRoutes({
          isDev: nuxt.options.dev,
          defaultLocale: localeSettings.defaultLocale,
          collections: routeBackedCollectionNames(options.collections ?? {}),
          collectionLocales: Object.fromEntries(
            Object.entries(buildPublicRuntimeCollections(options, localeSettings)).map(
              ([collection, config]) => [collection, config.locales],
            ),
          ),
        }).catch((error) => {
          if (options.publicContent?.prerenderFailure === 'warn') {
            console.warn(
              `[ginko-cms] failed to load CMS prerender routes: ${error instanceof Error ? error.message : String(error)}`,
            )
            return []
          }
          throw error
        })
        nitro.prerender ??= {}
        nitro.prerender.routes = Array.from(new Set([...(nitro.prerender.routes ?? []), ...routes]))
      })
    }

    // Tailwind source injection
    nuxt.options.vite ??= {}
    nuxt.options.vite.plugins ??= []
    if (
      !nuxt.options.vite.plugins.some(
        (plugin) =>
          plugin &&
          typeof plugin === 'object' &&
          'name' in plugin &&
          plugin.name === 'ginko-cms:tailwind-source-injection',
      )
    ) {
      nuxt.options.vite.plugins.unshift(
        createTailwindPlugin([cmsRuntimeDir, cmsAuthDir, cmsStudioUiDir]) as PluginOption,
      )
    }

    // The cms-theme.css moved into the studio SPA bundle in stage 4. The
    // auth pages still ship from this Nuxt module but they reuse the
    // consumer's own theme tokens, so nothing needs to be pushed onto
    // nuxt.options.css here.

    if (mcpEnabled) {
      addServerHandler({
        middleware: true,
        handler: resolve(cmsServerDir, 'middleware/mcp-auth'),
      })

      const mcpDiscoveryRoot = resolve(cmsServerDir, 'mcp')
      ;(
        nuxt as {
          hook: (
            name: string,
            handler: (paths: {
              tools: string[]
              resources: string[]
              prompts: string[]
              handlers?: string[]
            }) => void,
          ) => void
        }
      ).hook(
        'mcp:definitions:paths',
        (paths: {
          tools: string[]
          resources: string[]
          prompts: string[]
          handlers?: string[]
        }) => {
          const handlers = (paths.handlers ??= [])
          const toolDir = resolve(mcpDiscoveryRoot, 'tools')
          const resourceDir = resolve(mcpDiscoveryRoot, 'resources')
          const promptDir = resolve(mcpDiscoveryRoot, 'prompts')

          if (!paths.tools.includes(toolDir)) {
            paths.tools.push(toolDir)
          }
          if (!paths.resources.includes(resourceDir)) {
            paths.resources.push(resourceDir)
          }
          if (!paths.prompts.includes(promptDir)) {
            paths.prompts.push(promptDir)
          }
          if (!handlers.includes(mcpDiscoveryRoot)) {
            handlers.push(mcpDiscoveryRoot)
          }
        },
      )
      const nitroOptions = ((nuxt.options as { nitro?: NitroOptionsExt }).nitro ??= {})
      nitroOptions.experimental ??= {}
      nitroOptions.experimental.asyncContext = true
    }

    // The website read API is provided by @lupinum/ginko through the active
    // content provider. ginko-cms does not auto-import public website-reader
    // composables into host apps.
    addComponentsDir({
      path: resolve(cmsAuthDir, 'components'),
      global: true,
      pathPrefix: false,
    })

    // Register auth pages + the catchall studio host page. The host page
    // mounts the SPA bundle served from /_ginko-cms-studio/ above; vue-router
    // inside the SPA handles internal navigation, so Nuxt stays on this same
    // catchall route as the user moves around the studio.
    registerStudioPages(studioRoute, cmsAuthDir, cmsRuntimeDir)

    // Only inject site-level i18n defaults when the host app already opted into
    // translated site locales and explicitly provided CMS siteI18n overrides.
    // The CMS should not turn a monolingual site into a translated app by default.
    type SiteOpts = { name?: string; description?: string }
    const nuxtOptsUnknown: unknown = nuxt.options
    const nuxtSite = (nuxtOptsUnknown as Record<string, unknown>).site as SiteOpts | undefined
    const defaultSiteName = nuxtSite?.name ?? ''
    const defaultSiteDesc = nuxtSite?.description ?? ''
    const siteI18nOverrides = options.siteI18n ?? {}

    const shouldInjectSiteI18nDefaults =
      appHasConfiguredLocales && Object.keys(siteI18nOverrides).length > 0

    if (shouldInjectSiteI18nDefaults) {
      nuxt.hook('build:before', () => {
        const localesDir = join(nuxt.options.buildDir, 'ginko-cms', 'locales')
        mkdirSync(localesDir, { recursive: true })

        for (const locale of localeSettings.locales) {
          const override = siteI18nOverrides[locale.code] ?? {}
          const name = override.name ?? defaultSiteName
          const description = override.description ?? defaultSiteDesc
          if (!name && !description) continue
          const messages: Record<string, string> = {}
          if (name) messages.name = name
          if (description) messages.description = description
          writeFileSync(
            join(localesDir, `${locale.code}.json`),
            JSON.stringify({ nuxtSiteConfig: messages }, null, 2),
          )
        }

        // Push as lowest-priority layer so app locale files always win.
        // nuxt-i18n-micro reverses _layers before merging, so push() = lowest priority.
        type MutableLayer = {
          config: { rootDir: string }
          configFile: string
          cwd: string
        }
        const layersUnknown: unknown = nuxt.options._layers
        const layers = layersUnknown as MutableLayer[]
        const ginkoDefaultsDir = join(nuxt.options.buildDir, 'ginko-cms')
        if (!layers.some((l) => l.config.rootDir === ginkoDefaultsDir)) {
          layers.push({
            config: { rootDir: ginkoDefaultsDir },
            configFile: '',
            cwd: ginkoDefaultsDir,
          })
        }
      })
    }
  },
  moduleDependencies(nuxt) {
    const nuxtOptions = nuxt.options as unknown as NuxtOptionsExt
    const userOptions: GinkoCmsUserOptions =
      nuxtOptions.ginkoCms && typeof nuxtOptions.ginkoCms === 'object' ? nuxtOptions.ginkoCms : {}
    const studioRoute = (userOptions.route ?? '/studio').replace(/\/$/, '')
    const convexOptions = defu(nuxtOptions.convex ?? {}, {
      auth: {
        enabled: true,
        routeProtection: {
          redirectTo: `${studioRoute}/auth/signin`,
        },
      },
    }) as Record<string, unknown>

    const dependencies: Record<
      string,
      {
        version?: string
        defaults?: Record<string, unknown>
      }
    > = {
      'better-convex-nuxt': {
        defaults: convexOptions,
      },
      '@nuxtjs/color-mode': {
        version: '>=4.0.0',
        defaults: {
          classSuffix: '',
        },
      },
    }
    if (!hasNuxtI18nModule(nuxt.options.modules)) {
      dependencies['nuxt-i18n-micro'] = {
        version: '>=3.17.0',
        defaults: {
          autoDetectLanguage: false,
          disablePageLocales: true,
          localeCookie: null,
          redirects: false,
          translationDir: 'node_modules/.cache/ginko-cms/i18n-micro',
        },
      }
    }
    if (userOptions.mcp === true) {
      dependencies['@nuxtjs/mcp-toolkit'] = {
        version: '>=0.16.1',
        defaults: {},
      }
    }
    return dependencies
  },
})

function isTypecheck() {
  return (
    process.argv.some((arg) => arg.includes('typecheck')) ||
    process.env.npm_lifecycle_event === 'typecheck'
  )
}

function isNuxtPrepare() {
  return (
    process.argv.some((arg) => arg === 'prepare' || arg.endsWith('/prepare')) ||
    process.env.npm_lifecycle_event === 'postinstall'
  )
}

function resolvePublicApiRoute(api: PublicContentApiOption) {
  if (!api) return null
  const route = api === true ? '/api/ginko/v1' : (api.route ?? '/api/ginko/v1')
  const normalized = route.startsWith('/') ? route : `/${route}`
  return normalized.replace(/\/+$/, '')
}

function routeBackedCollectionNames(collections: ModuleOptions['collections']) {
  return Object.entries(collections)
    .filter(([, collection]) => (collection.routing?.mode ?? 'route') === 'route')
    .map(([name]) => name)
}

export async function loadGinkoPrerenderRoutes(args: {
  isDev: boolean
  defaultLocale: string
  collections: string[]
  collectionLocales: Record<string, string[]>
}) {
  if (args.isDev) return []
  const convexUrl = process.env.NUXT_PUBLIC_CONVEX_URL ?? process.env.CONVEX_URL
  if (!convexUrl) {
    throw new Error('Convex URL is not configured for Ginko prerender route generation.')
  }
  const client = new ConvexHttpClient(convexUrl)
  const urls: Array<{
    collection?: string
    route?: { locale?: string; path?: string }
  }> = []
  for (const collection of args.collections) {
    for (const locale of args.collectionLocales[collection] ?? [args.defaultLocale]) {
      let cursor: string | null = null
      do {
        const sitemapRef = (anyApi as unknown as { ginkoCms: { public: { sitemap: unknown } } })
          .ginkoCms.public.sitemap
        const sitemap = (await client.query(sitemapRef as Parameters<ConvexHttpClient['query']>[0], {
          collection,
          locale,
          cursor,
        })) as {
          urls?: Array<{ collection?: string; route?: { locale?: string; path?: string } }>
          pageInfo?: { endCursor: string | null }
        }
        urls.push(...(sitemap.urls ?? []))
        cursor = sitemap.pageInfo?.endCursor ?? null
      } while (cursor)
    }
  }

  return urls
    .filter((entry) => {
      const collection = entry.collection
      const locale = entry.route?.locale
      if (!collection || !locale) return false
      const allowedLocales = args.collectionLocales[collection]
      return !allowedLocales || allowedLocales.includes(locale)
    })
    .map((entry) => {
      const route = entry.route
      if (!route?.path) return null
      const prefix = route.locale && route.locale !== args.defaultLocale ? `/${route.locale}` : ''
      const routePath = route.path === '/' ? '' : route.path.replace(/\/+$/, '')
      return `${prefix}${routePath}` || '/'
    })
    .filter((route): route is string => !!route)
}

export default ginkoCmsModule
