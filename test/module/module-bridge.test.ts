import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { installBridge } from './bridge-helpers.js'

const addImportsDir = vi.fn()
const addComponentsDir = vi.fn()
const addLayout = vi.fn()
const addServerHandler = vi.fn()
const addServerPlugin = vi.fn()
const addTypeTemplate = vi.fn((template: { filename: string }) => ({
  dst: resolve(moduleDir, '.nuxt', template.filename),
}))
const extendPages = vi.fn()
const convexQuery = vi.fn()
const useLogger = vi.fn(() => ({
  success: vi.fn(),
}))

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const moduleDir = resolve(packageRoot, 'packages/cms/src')

vi.mock('@nuxt/kit', () => ({
  addComponentsDir,
  addImportsDir,
  addLayout,
  addServerHandler,
  addServerPlugin,
  addTypeTemplate,
  createResolver: () => ({
    resolve: (path: string) => resolve(moduleDir, path),
  }),
  defineNuxtModule: <T>(definition: T) => definition,
  extendPages,
  useLogger,
}))

vi.mock('convex/browser', () => ({
  ConvexHttpClient: vi.fn(function ConvexHttpClient() {
    return { query: convexQuery }
  }),
}))

vi.resetModules()

const moduleExports = await import('../../packages/cms/src/module')
const moduleDefinition = moduleExports.default as unknown as {
  (options: Record<string, unknown>, nuxt: Record<string, unknown>): Promise<void>
  setup: (options: Record<string, unknown>, nuxt: Record<string, unknown>) => Promise<void>
}
const { loadGinkoPrerenderRoutes } = moduleExports

async function setupModule(options: Record<string, unknown>, nuxt: Record<string, unknown>) {
  if (typeof moduleDefinition.setup === 'function') {
    return moduleDefinition.setup(options, nuxt)
  }
  const { runWithNuxtContext } = await vi.importActual<typeof import('@nuxt/kit')>('@nuxt/kit')
  return runWithNuxtContext(nuxt, () => moduleDefinition(options, nuxt))
}

function createNuxtMock(rootDir: string) {
  return {
    hook: vi.fn(),
    options: {
      i18n: {
        strategy: 'prefix_except_default',
        autoDetectLanguage: false,
        localeCookie: null,
      },
      modules: ['nuxt-i18n-micro'],
      rootDir,
      alias: {},
      build: {
        templates: [],
      },
      css: [] as string[],
      runtimeConfig: {
        public: {},
      },
      serverHandlers: [],
      nitro: {
        virtual: {},
      },
      vite: {
        plugins: [] as Array<{
          name: string
          transform?: (code: string, id: string) => { code: string; map: unknown } | string | null
        }>,
        vue: {},
      },
    },
  }
}

describe('ginko-cms bridge validation', () => {
  const tempDirs: string[] = []

  afterEach(() => {
    addImportsDir.mockClear()
    addComponentsDir.mockClear()
    addLayout.mockClear()
    addServerHandler.mockClear()
    extendPages.mockClear()
    useLogger.mockClear()

    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { force: true, recursive: true })
    }
  })

  it('fails fast when generated bridge files are missing', async () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'ginko-cms-missing-bridge-'))
    tempDirs.push(rootDir)

    await expect(
      setupModule(
        {
          collections: {},
          defaultLocale: 'en',
          locales: [{ code: 'en', isDefault: true }],
          route: '/studio',
        },
        createNuxtMock(rootDir),
      ),
    ).rejects.toThrow('ginko-cms init')
  })

  it('loads once generated bridge files and managed convex config are installed', async () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'ginko-cms-installed-bridge-'))
    tempDirs.push(rootDir)
    await installBridge(rootDir)

    const nuxt = createNuxtMock(rootDir)
    await setupModule(
      {
        collections: {},
        defaultLocale: 'en',
        locales: [{ code: 'en', isDefault: true }],
        route: '/studio',
      },
      nuxt,
    )

    expect(
      (nuxt.options as { trellis: { permissions: { query: string } } }).trellis.permissions.query,
    ).toBe('ginkoCms/members.getAccessContext')
    expect(nuxt.options.css).toEqual([])
    expect((nuxt.options as { colorMode: { classSuffix: string } }).colorMode).toEqual({
      classSuffix: '',
    })

    const collectionsBridge = readFileSync(
      resolve(rootDir, 'convex/ginkoCms/collections.ts'),
      'utf8',
    )
    expect(collectionsBridge).not.toContain('installCollectionContractSnapshots')
    expect(collectionsBridge).not.toContain('syncCodeDefinedCollections')
    expect(collectionsBridge).not.toContain('cleanupMissingCodeDefinedCollections')
    expect(collectionsBridge).toContain('checkCollectionContracts')
    expect(collectionsBridge).toContain('installCollectionContracts')
    expect(collectionsBridge).not.toContain('checkCollectionContractsAuthed')
    expect(collectionsBridge).not.toContain('installCollectionContractsAuthed')
    expect(collectionsBridge).toContain('listCollections')
  })

  it('repairs generated bridge drift during Nuxt prepare', async () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'ginko-cms-prepare-bridge-'))
    tempDirs.push(rootDir)
    await installBridge(rootDir)

    const target = resolve(rootDir, 'convex/ginkoCmsMcp.ts')
    writeFileSync(target, `${readFileSync(target, 'utf8')}\n// stale generated output\n`, 'utf8')

    const previousLifecycleEvent = process.env.npm_lifecycle_event
    process.env.npm_lifecycle_event = 'postinstall'

    try {
      await setupModule(
        {
          collections: {},
          defaultLocale: 'en',
          locales: [{ code: 'en', isDefault: true }],
          route: '/studio',
        },
        createNuxtMock(rootDir),
      )

      expect(readFileSync(target, 'utf8')).not.toContain('stale generated output')
    } finally {
      if (previousLifecycleEvent === undefined) {
        delete process.env.npm_lifecycle_event
      } else {
        process.env.npm_lifecycle_event = previousLifecycleEvent
      }
    }
  })

  it('does not leak deploy admin auth into runtime config', async () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'ginko-cms-deploy-key-'))
    tempDirs.push(rootDir)
    await installBridge(rootDir)

    const previousDeployKey = process.env.CONVEX_DEPLOY_KEY
    process.env.CONVEX_DEPLOY_KEY = 'super-secret-test-value'
    try {
      const nuxt = createNuxtMock(rootDir)
      await setupModule(
        {
          collections: {},
          defaultLocale: 'en',
          locales: [{ code: 'en', isDefault: true }],
          route: '/studio',
        },
        nuxt,
      )

      expect(JSON.stringify(nuxt.options.runtimeConfig.public)).not.toContain(
        'super-secret-test-value',
      )
      expect(JSON.stringify(nuxt.options.runtimeConfig)).not.toContain('super-secret-test-value')
    } finally {
      if (previousDeployKey === undefined) {
        delete process.env.CONVEX_DEPLOY_KEY
      } else {
        process.env.CONVEX_DEPLOY_KEY = previousDeployKey
      }
    }
  })

  it('registers the optional public HTTP API facade', async () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'ginko-cms-public-api-'))
    tempDirs.push(rootDir)
    await installBridge(rootDir)

    const nuxt = createNuxtMock(rootDir)
    await setupModule(
      {
        collections: {},
        defaultLocale: 'en',
        locales: [{ code: 'en', isDefault: true }],
        route: '/studio',
        publicContent: {
          api: {
            route: '/content-api',
          },
        },
      },
      nuxt,
    )

    const routes = [
      ...addServerHandler.mock.calls.map(([handler]) => handler.route),
      ...((nuxt.options as { serverHandlers?: Array<{ route: string }> }).serverHandlers ?? []).map(
        (handler: { route: string }) => handler.route,
      ),
    ]
    expect(routes).toEqual(
      expect.arrayContaining([
        '/content-api/page',
        '/content-api/list',
        '/content-api/nav',
        '/content-api/surround',
        '/content-api/search',
        '/content-api/sitemap',
        '/content-api/singleton',
        '/content-api/site-data',
      ]),
    )
  })

  it('normalizes localized root prerender routes without trailing slash', async () => {
    const previousConvexUrl = process.env.NUXT_PUBLIC_CONVEX_URL
    process.env.NUXT_PUBLIC_CONVEX_URL = 'https://example.convex.cloud'
    convexQuery.mockImplementation(async (_ref, args: { locale: string }) => ({
      urls: [{ collection: 'index', route: { locale: args.locale, path: '/' } }],
      pageInfo: { endCursor: null },
    }))

    try {
      const routes = await loadGinkoPrerenderRoutes({
        isDev: false,
        defaultLocale: 'en',
        collections: ['index'],
        collectionLocales: { index: ['en', 'de'] },
      })

      expect(routes).toContain('/')
      expect(routes).toContain('/de')
      expect(routes).not.toContain('/de/')
    } finally {
      convexQuery.mockReset()
      if (previousConvexUrl === undefined) {
        delete process.env.NUXT_PUBLIC_CONVEX_URL
      } else {
        process.env.NUXT_PUBLIC_CONVEX_URL = previousConvexUrl
      }
    }
  })

  it('does not fetch prerender routes during Nuxt prepare', async () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'ginko-cms-prepare-prerender-'))
    tempDirs.push(rootDir)
    await installBridge(rootDir)

    const previousLifecycleEvent = process.env.npm_lifecycle_event
    const previousConvexUrl = process.env.CONVEX_URL
    const previousPublicConvexUrl = process.env.NUXT_PUBLIC_CONVEX_URL
    process.env.npm_lifecycle_event = 'postinstall'
    delete process.env.CONVEX_URL
    delete process.env.NUXT_PUBLIC_CONVEX_URL

    try {
      const nuxt = createNuxtMock(rootDir)
      await setupModule(
        {
          collections: {
            index: {},
          },
          defaultLocale: 'en',
          locales: [{ code: 'en', isDefault: true }, { code: 'de' }],
          publicContent: {
            prerender: true,
          },
          route: '/studio',
        },
        nuxt,
      )

      expect(nuxt.hook.mock.calls.some(([name]: [string]) => name === 'nitro:config')).toBe(false)
      expect(convexQuery).not.toHaveBeenCalled()
    } finally {
      convexQuery.mockReset()
      if (previousLifecycleEvent === undefined) {
        delete process.env.npm_lifecycle_event
      } else {
        process.env.npm_lifecycle_event = previousLifecycleEvent
      }
      if (previousConvexUrl === undefined) {
        delete process.env.CONVEX_URL
      } else {
        process.env.CONVEX_URL = previousConvexUrl
      }
      if (previousPublicConvexUrl === undefined) {
        delete process.env.NUXT_PUBLIC_CONVEX_URL
      } else {
        process.env.NUXT_PUBLIC_CONVEX_URL = previousPublicConvexUrl
      }
    }
  })

  it('treats modified generated files as invalid until regenerated', async () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'ginko-cms-dirty-bridge-'))
    tempDirs.push(rootDir)
    await installBridge(rootDir)

    const target = resolve(rootDir, 'convex/ginkoCms/members.ts')
    writeFileSync(target, `${readFileSync(target, 'utf8')}\n// local edit\n`, 'utf8')

    await expect(
      setupModule(
        {
          collections: {},
          defaultLocale: 'en',
          locales: [{ code: 'en', isDefault: true }],
          route: '/studio',
        },
        createNuxtMock(rootDir),
      ),
    ).rejects.toThrow('convex/ginkoCms/members.ts')
  })

  it('treats stale managed convex config as invalid until regenerated', async () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'ginko-cms-dirty-config-'))
    tempDirs.push(rootDir)
    await installBridge(rootDir)

    const target = resolve(rootDir, 'convex/convex.config.ts')
    writeFileSync(
      target,
      readFileSync(target, 'utf8').replace(
        'app.use(ginkoCms)',
        [
          '// @trellis-managed-start: @lupinum/ginko-cms convex-component',
          'app.use(ginkoCms)',
          '// @trellis-managed-end: @lupinum/ginko-cms convex-component',
        ].join('\n'),
      ),
      'utf8',
    )

    await expect(
      setupModule(
        {
          collections: {},
          defaultLocale: 'en',
          locales: [{ code: 'en', isDefault: true }],
          route: '/studio',
        },
        createNuxtMock(rootDir),
      ),
    ).rejects.toThrow('convex/convex.config.ts')
  })
})
