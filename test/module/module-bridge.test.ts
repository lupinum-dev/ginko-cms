import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  buildResolvedContentContract,
  hashCanonicalJson,
} from '@lupinum/ginko-content/cms-contract'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { installConvexSetup } from './convex-setup-helpers.js'

const addImportsDir = vi.fn()
const addComponentsDir = vi.fn()
const addLayout = vi.fn()
const addPlugin = vi.fn()
const addServerHandler = vi.fn()
const addServerPlugin = vi.fn()
const addTypeTemplate = vi.fn((template: { filename: string }) => ({
  dst: resolve(moduleDir, '.nuxt', template.filename),
}))
const addTemplate = addTypeTemplate
const extendPages = vi.fn()
const useLogger = vi.fn(() => ({
  success: vi.fn(),
}))

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const moduleDir = resolve(packageRoot, 'packages/cms/src')

vi.mock('@nuxt/kit', () => ({
  addComponentsDir,
  addImportsDir,
  addLayout,
  addPlugin,
  addServerHandler,
  addServerPlugin,
  addTypeTemplate,
  addTemplate,
  createResolver: () => ({
    resolve: (path: string) => resolve(moduleDir, path),
  }),
  defineNuxtModule: <T>(definition: T) => definition,
  extendPages,
  useLogger,
}))

vi.resetModules()

const moduleExports = await import('../../packages/cms/src/module')
const moduleDefinition = moduleExports.default as unknown as {
  (options: Record<string, unknown>, nuxt: Record<string, unknown>): Promise<void>
  setup: (options: Record<string, unknown>, nuxt: Record<string, unknown>) => Promise<void>
}

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
        content: {
          contract: buildResolvedContentContract(
            { collections: {} },
            { defaultLocale: 'en', locales: ['en'] },
          ),
        },
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

describe('ginko-cms Convex setup validation', () => {
  const tempDirs: string[] = []
  const staleMcpBridgeFile = ['convex', `ginkoCms${'Mcp.ts'}`].join('/')

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

  it('fails fast when direct Convex setup files are missing', async () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'ginko-cms-missing-setup-'))
    tempDirs.push(rootDir)

    await expect(setupModule({ route: '/studio' }, createNuxtMock(rootDir))).rejects.toThrow(
      'ginko-cms init',
    )
  })

  it('loads once direct Convex setup files are installed', async () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'ginko-cms-installed-setup-'))
    tempDirs.push(rootDir)
    await installConvexSetup(rootDir)
    const nuxt = createNuxtMock(rootDir)
    await setupModule({ route: '/studio' }, nuxt)

    expect((nuxt.options as { trellis?: unknown }).trellis).toBeUndefined()
    expect(nuxt.options.css).toEqual([])
    expect((nuxt.options as { colorMode: { classSuffix: string } }).colorMode).toEqual({
      classSuffix: '',
    })

    expect(readFileSync(resolve(rootDir, 'convex/convex.config.ts'), 'utf8')).toContain(
      'app.use(ginkoCms)',
    )
    expect(readFileSync(resolve(rootDir, 'convex/auth.ts'), 'utf8')).toContain('defineGinkoAuth')
    expect(readFileSync(resolve(rootDir, 'convex/auth.ts'), 'utf8')).toContain(
      'auth.jwksOperatorFunctions()',
    )
    expect(readFileSync(resolve(rootDir, 'convex/auth.ts'), 'utf8')).toContain(
      'sendGinkoPasswordResetEmail',
    )
    expect(existsSync(resolve(rootDir, 'convex/betterAuth/schema.ts'))).toBe(false)
    expect(existsSync(resolve(rootDir, 'convex/ginkoCms/collections.ts'))).toBe(true)
    expect(existsSync(resolve(rootDir, 'convex/ginkoCms/mcpOAuthDelegations.ts'))).toBe(true)
    expect(existsSync(resolve(rootDir, 'convex/ginkoCms/passwordRecovery.ts'))).toBe(true)
    expect(existsSync(resolve(rootDir, 'convex/ginkoCms/mcpKeys.ts'))).toBe(false)
    expect(addServerHandler).not.toHaveBeenCalledWith(
      expect.objectContaining({ route: '/api/_ginko/reviews/:reviewRequestId' }),
    )
    const extendWithoutMcp = extendPages.mock.calls.at(-1)?.[0] as
      | ((pages: Array<{ name?: string; path?: string }>) => void)
      | undefined
    const pagesWithoutMcp: Array<{ name?: string; path?: string }> = []
    extendWithoutMcp?.(pagesWithoutMcp)
    expect(pagesWithoutMcp.map((page) => page.path)).not.toContain('/oauth/login')
    expect(pagesWithoutMcp.map((page) => page.path)).not.toContain('/oauth/consent')
  })

  it('accepts the explicit Convex-native MCP setup without registering a Nuxt MCP route', async () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'ginko-cms-convex-mcp-'))
    tempDirs.push(rootDir)
    await installConvexSetup(rootDir, { mcp: true })
    const nuxt = createNuxtMock(rootDir)

    await setupModule({ route: '/studio', mcp: true }, nuxt)

    const httpSource = readFileSync(resolve(rootDir, 'convex/http.ts'), 'utf8')
    const mcpSource = readFileSync(resolve(rootDir, 'convex/ginkoCms/mcp.ts'), 'utf8')
    expect(httpSource).toContain("path: '/mcp'")
    expect(httpSource.match(/path: '\/mcp'/gu)).toHaveLength(3)
    expect(
      httpSource.match(/path: '\/\.well-known\/oauth-protected-resource\/mcp'/gu),
    ).toHaveLength(2)
    expect(httpSource).toContain("method: 'OPTIONS'")
    expect(httpSource).not.toContain("method: 'HEAD'")
    expect(mcpSource).toContain('handleGinkoMcpRequest(request, {')
    expect(mcpSource).toContain('auth.authComponent.validateOAuthAccess(ctx, access)')
    expect(mcpSource).toContain('components.ginkoCms.mcpOAuthDelegations.hasLiveDelegatedAccess')
    expect(mcpSource).not.toContain('adapter.findOne')
    expect(mcpSource).not.toContain('validateLiveProviderAccess')
    expect(existsSync(resolve(rootDir, 'convex/ginkoCms/mcp.ts'))).toBe(true)
    expect(existsSync(resolve(rootDir, 'convex/ginkoCms/mcpOperations.ts'))).toBe(true)
    expect(addServerHandler).not.toHaveBeenCalledWith(
      expect.objectContaining({ route: expect.stringContaining('/mcp') }),
    )
    expect(addServerHandler).toHaveBeenCalledWith(
      expect.objectContaining({
        route: '/api/_ginko/reviews/:reviewRequestId',
        method: 'get',
      }),
    )
    const extendWithMcp = extendPages.mock.calls.at(-1)?.[0] as
      | ((pages: Array<{ name?: string; path?: string }>) => void)
      | undefined
    const pagesWithMcp: Array<{ name?: string; path?: string }> = []
    extendWithMcp?.(pagesWithMcp)
    expect(pagesWithMcp).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'ginko-mcp-oauth-login', path: '/oauth/login' }),
        expect.objectContaining({ name: 'ginko-mcp-oauth-consent', path: '/oauth/consent' }),
      ]),
    )
  })

  it('blocks stale generated bridge files during Nuxt prepare', async () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'ginko-cms-prepare-stale-bridge-'))
    tempDirs.push(rootDir)
    await installConvexSetup(rootDir)

    writeFileSync(resolve(rootDir, staleMcpBridgeFile), '// stale generated output\n', 'utf8')

    const previousLifecycleEvent = process.env.npm_lifecycle_event
    process.env.npm_lifecycle_event = 'postinstall'

    try {
      await expect(setupModule({ route: '/studio' }, createNuxtMock(rootDir))).rejects.toThrow(
        `${staleMcpBridgeFile} is a stale generated bridge file`,
      )
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
    await installConvexSetup(rootDir)

    const previousDeployKey = process.env.CONVEX_DEPLOY_KEY
    process.env.CONVEX_DEPLOY_KEY = 'super-secret-test-value'
    try {
      const nuxt = createNuxtMock(rootDir)
      await setupModule({ route: '/studio' }, nuxt)

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

  it('injects trusted expected hashes from the resolved content and presentation contracts', async () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'ginko-cms-expected-contract-'))
    tempDirs.push(rootDir)
    await installConvexSetup(rootDir)
    const content = buildResolvedContentContract(
      {
        collections: {
          posts: {
            type: 'page',
            source: 'content/posts/**/*.md',
            route: '/posts',
          },
        },
      },
      { defaultLocale: 'en', locales: ['en'] },
    )
    const presentation = {
      collections: {
        posts: { label: 'Editorial posts', fields: {} },
      },
    }
    const nuxt = createNuxtMock(rootDir)
    ;(
      nuxt.options.runtimeConfig as typeof nuxt.options.runtimeConfig & {
        content: { contract: typeof content }
      }
    ).content = { contract: content }
    nuxt.options.runtimeConfig.public.ginkoCms = {
      contract: {
        expectedContentHash: 'host-config-must-not-override',
        expectedPresentationHash: 'host-config-must-not-override',
      },
    }

    await setupModule({ route: '/studio', editorialLayout: presentation }, nuxt)

    expect(nuxt.options.runtimeConfig.public.ginkoCms.contract).toEqual({
      expectedContentHash: await hashCanonicalJson(content),
      expectedPresentationHash: await hashCanonicalJson(presentation),
    })
  })

  it('rejects the removed CMS public facade and prerender options', async () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'ginko-cms-removed-public-delivery-'))
    tempDirs.push(rootDir)
    await installConvexSetup(rootDir)

    await expect(
      setupModule(
        {
          route: '/studio',
          publicContent: { api: true, prerender: true },
        },
        createNuxtMock(rootDir),
      ),
    ).rejects.toThrow('Unknown ginkoCms option "publicContent"')
  })

  it.each(['search', 'siteData', 'forms'])('rejects removed phantom option %s', async (key) => {
    const rootDir = mkdtempSync(join(tmpdir(), `ginko-cms-removed-${key}-`))
    tempDirs.push(rootDir)
    await installConvexSetup(rootDir)

    await expect(
      setupModule({ route: '/studio', [key]: { enabled: true } }, createNuxtMock(rootDir)),
    ).rejects.toThrow(`Unknown ginkoCms option "${key}"`)
  })

  it('registers the CLI-only portability asset transfer routes', async () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'ginko-cms-portability-routes-'))
    tempDirs.push(rootDir)
    await installConvexSetup(rootDir)

    await setupModule({ route: '/studio' }, createNuxtMock(rootDir))

    expect(addServerHandler.mock.calls.map(([handler]) => handler)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          route: '/api/_ginko/operator/convex-token',
          method: 'post',
        }),
        expect.objectContaining({
          route: '/api/_ginko/portability/assets/:sha256/attempt',
          method: 'post',
        }),
        expect.objectContaining({
          route: '/api/_ginko/portability/assets/:sha256',
          method: 'put',
        }),
      ]),
    )
  })

  it('treats stale managed convex config as invalid until cleaned up', async () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'ginko-cms-dirty-config-'))
    tempDirs.push(rootDir)
    await installConvexSetup(rootDir)

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

    await expect(setupModule({ route: '/studio' }, createNuxtMock(rootDir))).rejects.toThrow(
      'convex/convex.config.ts',
    )
  })
})
