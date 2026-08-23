import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  assertResolvedContentContract,
  hashCanonicalJson,
  type JsonValue,
  type ResolvedContentContractV1,
} from '@lupinum/ginko-content/cms-contract'
import {
  defineNuxtModule,
  addServerHandler,
  createResolver,
  addComponentsDir,
  extendPages,
} from '@nuxt/kit'
import type { Nuxt, NuxtModule } from '@nuxt/schema'
import { defu } from 'defu'

import {
  loadGinkoContentContract,
  loadGinkoContentProviderName,
  projectContractCollections,
} from './module/content-contract.js'
import { assertConvexSetupInstalled } from './module/convex.js'
import {
  resolveLocaleSettings,
  assertI18nCompatibility,
  hasConfiguredI18nLocales,
  syncConfiguredI18nDefaults,
} from './module/i18n.js'
import type { I18nModuleOptions } from './module/i18n.js'
import type { ModuleOptions, ResolvedModuleOptions } from './module/options.js'
import { buildPublicRuntimeCollections } from './module/runtime-config.js'
import { createTailwindPlugin } from './module/tailwind.js'
import { OPERATOR_CONVEX_TOKEN_ROUTE } from './server/utils/operator-token-contract.js'

export type {
  FieldConfig,
  CollectionConfig,
  LocaleConfig,
  ModuleOptions,
} from './module/options.js'

interface NuxtOptionsExt {
  ginkoCms?: Partial<ModuleOptions> | false
  i18n?: I18nModuleOptions
  convex?:
    | false
    | (Record<string, unknown> & {
        auth?:
          | false
          | (Record<string, unknown> & {
              origin?: unknown
            })
      })
  colorMode?: {
    classSuffix?: string
  }
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
    content?: { contract?: ResolvedContentContractV1 }
  }
}

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

const CMS_CONTENT_PROVIDER_NAME = 'cms'
const CMS_CONTENT_PROVIDER_MODULE = '@lupinum/ginko-cms/nuxt-provider'
const MODULE_OPTION_KEYS = new Set([
  'route',
  'editorialLayout',
  'debugStudio',
  'sidebar',
  'mcp',
  'preview',
])

function assertModuleOptionKeys(input: object) {
  for (const key of Object.keys(input)) {
    if (MODULE_OPTION_KEYS.has(key)) continue
    throw new Error(
      `[ginko-cms] Unknown ginkoCms option "${key}". Collection, route, field, and locale policy must come from the resolved Ginko Content contract.`,
    )
  }
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
  if (search === false || search?.engine === 'provider') return

  throw new Error(
    `ginko-cms detected content.config.ts provider "${provider}", but content.search is not using the provider search engine. Set \`content.search.engine\` to "provider" or set \`content.search\` to false.`,
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
      { cause: error },
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
    mcp: false,
  },
  async setup(moduleInput, nuxt) {
    assertModuleOptionKeys(moduleInput)
    const options = { ...moduleInput } as ResolvedModuleOptions
    const { resolve: moduleResolve } = createResolver(import.meta.url)
    const moduleOptions = nuxt.options as typeof nuxt.options & NuxtOptionsExt
    registerCmsContentProvider(nuxt)
    const contentContract = moduleOptions.runtimeConfig.content?.contract
      ? assertResolvedContentContract(moduleOptions.runtimeConfig.content.contract)
      : await loadGinkoContentContract({
          rootDir: nuxt.options.rootDir,
        })
    options.defaultLocale = contentContract.defaultLocale
    options.locales = contentContract.locales.map((code) => ({
      code,
      isDefault: code === contentContract.defaultLocale,
      fallback: contentContract.localeFallbacks[code]?.[0],
    }))
    options.collections = projectContractCollections(contentContract, options.editorialLayout)
    const presentationContract = (options.editorialLayout ?? {
      collections: {},
    }) as unknown as JsonValue
    const expectedContentHash = await hashCanonicalJson(contentContract as unknown as JsonValue)
    const expectedPresentationHash = await hashCanonicalJson(presentationContract)
    const localeSettings = resolveLocaleSettings(options)
    const cmsRuntimeDir = moduleResolve('./runtime')
    const cmsPublicDir = moduleResolve('./public')
    const cmsServerDir = moduleResolve('./server')
    const cmsAuthDir = moduleResolve('./auth')
    const cmsPackageRoot = locatePackageRoot()
    const cmsStudioUiDir = resolve(cmsPackageRoot, 'studio-app/src/components/ui')
    const mcpEnabled = options.mcp === true
    const studioRoute = options.route.replace(/\/$/u, '') || '/studio'
    await assertGinkoContentSearchBoundary(nuxt.options.rootDir, moduleOptions)

    // Studio and its auth pages are identity-dependent. A prerendered anonymous
    // shell bypasses Better Convex's request-scoped SSR auth and then shifts to
    // the authenticated application after hydration.
    nuxt.options.routeRules[studioRoute] = {
      ...nuxt.options.routeRules[studioRoute],
      prerender: false,
    }
    nuxt.options.routeRules[`${studioRoute}/**`] = {
      ...nuxt.options.routeRules[`${studioRoute}/**`],
      prerender: false,
    }

    nuxt.options.alias ??= {}
    nuxt.options.alias['#ginko-cms'] = cmsRuntimeDir
    nuxt.options.alias['#ginko-cms/editor'] = resolve(cmsRuntimeDir, 'editor')
    nuxt.options.alias['#ginko-cms-public'] = cmsPublicDir

    // i18n integration
    const i18nOptions = (moduleOptions.i18n ??= {})
    const appHasConfiguredLocales = hasConfiguredI18nLocales(i18nOptions)
    if (appHasConfiguredLocales) {
      assertI18nCompatibility(i18nOptions, localeSettings)
      syncConfiguredI18nDefaults(i18nOptions, localeSettings)
    }

    // Convex backend wiring
    assertConvexSetupInstalled(nuxt.options.rootDir, { mcp: mcpEnabled })

    const colorModeOptions =
      typeof moduleOptions.colorMode === 'object' && moduleOptions.colorMode !== null
        ? (moduleOptions.colorMode as { classSuffix?: string })
        : {}
    ;(moduleOptions as NuxtOptionsExt).colorMode = colorModeOptions
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
    const publicCmsConfig = defu(moduleOptions.runtimeConfig.public.ginkoCms, {
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
      // Draft preview convention (EDT-10): the host page renders guarded draft
      // data at `<route>/[collection]/[entryId]?locale=…`; Studio builds its
      // "Preview draft" links from this. `route: null` hides those links.
      preview: {
        route: options.preview?.route === undefined ? '/preview' : options.preview.route,
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
    }) as Record<string, unknown>
    // These hashes must describe the contract resolved above. Public runtime
    // config may customize presentation-independent host settings, but it may
    // not replace the write-gate identity with a second source of truth.
    publicCmsConfig.contract = {
      expectedContentHash,
      expectedPresentationHash,
    }
    nuxt.options.runtimeConfig.public.ginkoCms = publicCmsConfig

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

    addServerHandler({
      route: OPERATOR_CONVEX_TOKEN_ROUTE,
      method: 'post',
      handler: resolve(cmsServerDir, 'routes/operator-convex-token'),
    })
    addServerHandler({
      route: '/api/_ginko/portability/assets/:sha256/attempt',
      method: 'post',
      handler: resolve(cmsServerDir, 'routes/portability-asset-attempt'),
    })
    addServerHandler({
      route: '/api/_ginko/portability/assets/:sha256',
      method: 'put',
      handler: resolve(cmsServerDir, 'routes/portability-asset-upload'),
    })
    addServerHandler({
      route: '/api/_ginko/portability/assets/:holdId/download-attempt',
      method: 'post',
      handler: resolve(cmsServerDir, 'routes/portability-asset-download-attempt'),
    })
    addServerHandler({
      route: '/api/_ginko/portability/assets/:holdId',
      method: 'get',
      handler: resolve(cmsServerDir, 'routes/portability-asset-download'),
    })
    if (mcpEnabled) {
      addServerHandler({
        route: '/api/_ginko/reviews/:reviewRequestId',
        method: 'get',
        handler: resolve(cmsServerDir, 'routes/review-interaction'),
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
        createTailwindPlugin([cmsRuntimeDir, cmsAuthDir, cmsStudioUiDir]),
      )
    }

    // The cms-theme.css moved into the studio SPA bundle in stage 4. The
    // auth pages still ship from this Nuxt module but they reuse the
    // consumer's own theme tokens, so nothing needs to be pushed onto
    // nuxt.options.css here.

    // The website read API is provided by @lupinum/ginko-content through the active
    // content provider. ginko-cms does not auto-import public website-reader
    // composables into host apps.
    addComponentsDir({
      path: resolve(cmsAuthDir, 'components'),
      global: true,
      pathPrefix: false,
    })

    // Ginko owns application pages even when the host has no pages directory.
    // Force Nuxt's pages system on before extending its build-time route table;
    // registering routes from a runtime plugin can deadlock initial SSR routing.
    nuxt.options.pages = true
    extendPages((pages) => {
      const routes = [
        ...(mcpEnabled
          ? [
              {
                name: 'ginko-mcp-oauth-login',
                path: '/oauth/login',
                file: resolve(cmsAuthDir, 'pages/oauth-login.vue'),
                meta: { layout: false },
              },
              {
                name: 'ginko-mcp-oauth-consent',
                path: '/oauth/consent',
                file: resolve(cmsAuthDir, 'pages/oauth-consent.vue'),
                meta: { layout: false },
              },
            ]
          : []),
        {
          name: 'studio-auth-signin',
          path: `${options.route.replace(/\/$/, '')}/auth/signin`,
          file: resolve(cmsAuthDir, 'pages/signin.vue'),
          meta: { layout: false },
        },
        {
          name: 'studio-auth-register',
          path: `${options.route.replace(/\/$/, '')}/auth/register`,
          file: resolve(cmsAuthDir, 'pages/register.vue'),
          meta: { layout: false },
        },
        {
          name: 'studio-auth-recover',
          path: `${options.route.replace(/\/$/, '')}/auth/recover`,
          file: resolve(cmsAuthDir, 'pages/recover.vue'),
          meta: { layout: false },
        },
        {
          name: 'studio-auth-reset-password',
          path: `${options.route.replace(/\/$/, '')}/auth/reset-password`,
          file: resolve(cmsAuthDir, 'pages/reset-password.vue'),
          meta: { layout: false },
        },
        {
          name: 'studio-host',
          path: `${options.route.replace(/\/$/, '')}/:slug(.*)*`,
          file: resolve(cmsRuntimeDir, 'pages/studio-host.vue'),
          meta: {
            layout: false,
            convexAuth: { redirectTo: `${options.route.replace(/\/$/, '')}/auth/signin` },
          },
        },
      ]

      for (const route of routes) {
        if (pages.some((page) => page.name === route.name)) {
          throw new Error(
            `@lupinum/ginko-cms cannot register route "${route.name}" because the host already uses that route name.`,
          )
        }
        pages.push(route)
      }
    })
  },
  moduleDependencies(nuxt) {
    const nuxtOptions = nuxt.options as typeof nuxt.options & NuxtOptionsExt
    const userOptions: Partial<ModuleOptions> =
      nuxtOptions.ginkoCms && typeof nuxtOptions.ginkoCms === 'object' ? nuxtOptions.ginkoCms : {}
    const studioRoute = (userOptions.route ?? '/studio').replace(/\/$/, '')

    // Better Convex auth is off by default. Ginko cannot safely infer the
    // deployment's public origin, so the host must opt in explicitly.
    const hostConvex = nuxtOptions.convex
    if (hostConvex === false) {
      throw new Error(
        'ginko-cms requires @lupinum/better-convex-nuxt. Remove the top-level `convex: false` option.',
      )
    }
    const hostAuth = hostConvex && typeof hostConvex === 'object' ? hostConvex.auth : undefined
    if (!hostAuth || typeof hostAuth !== 'object') {
      throw new Error(
        'Ginko CMS Studio requires an explicit `convex.auth` object with the public Nuxt `origin`.',
      )
    }
    if (typeof hostAuth.origin !== 'string' || hostAuth.origin.trim().length === 0) {
      throw new Error(
        'Ginko CMS Studio requires `convex.auth.origin` to be the exact public Nuxt origin.',
      )
    }

    const dependencies: Record<
      string,
      {
        version?: string
        defaults?: Record<string, unknown>
      }
    > = {
      '@nuxtjs/color-mode': {
        version: '>=4.0.0',
        defaults: {
          classSuffix: '',
        },
      },
    }

    dependencies['@lupinum/better-convex-nuxt'] = {
      defaults: {
        auth: {
          redirectTo: `${studioRoute}/auth/signin`,
        },
      },
    }

    return dependencies
  },
})

export default ginkoCmsModule
