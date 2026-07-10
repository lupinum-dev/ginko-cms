import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

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
  createResolver: () => ({
    resolve: (path: string) => resolve(moduleDir, path),
  }),
  defineNuxtModule: <T>(definition: T) => definition,
  extendPages,
  useLogger,
}))

vi.resetModules()

const moduleDefinition = (await import('../../packages/cms/src/module')).default as unknown as {
  (options: Record<string, unknown>, nuxt: Record<string, unknown>): Promise<void>
  setup: (options: Record<string, unknown>, nuxt: Record<string, unknown>) => Promise<void>
  getModuleDependencies: (nuxt: Record<string, unknown>) => Record<string, Record<string, unknown>>
  moduleDependencies: (nuxt: Record<string, unknown>) => Record<string, Record<string, unknown>>
}

async function setupModule(options: Record<string, unknown>, nuxt: Record<string, unknown>) {
  if (typeof moduleDefinition.setup === 'function') {
    return moduleDefinition.setup(options, nuxt)
  }
  const { runWithNuxtContext } = await vi.importActual<typeof import('@nuxt/kit')>('@nuxt/kit')
  return runWithNuxtContext(nuxt, () => moduleDefinition(options, nuxt))
}

function getModuleDependencies(nuxt: Record<string, unknown>) {
  if (typeof moduleDefinition.moduleDependencies === 'function') {
    return moduleDefinition.moduleDependencies(nuxt)
  }
  return moduleDefinition.getModuleDependencies(nuxt)
}

function createNuxtMock(rootDir: string) {
  return {
    hook: vi.fn(),
    options: {
      alias: {},
      build: {
        templates: [],
      },
      css: [] as string[],
      i18n: {
        strategy: 'prefix_except_default',
        autoDetectLanguage: false,
        localeCookie: null,
      },
      modules: ['nuxt-i18n-micro'],
      rootDir,
      srcDir: rootDir,
      runtimeConfig: {
        public: {},
      },
      vite: {
        plugins: [{ name: 'tailwindcss-vite' }] as Array<{
          name: string
          transform?: (code: string, id: string) => { code: string; map: unknown } | string | null
        }>,
      },
    },
  }
}

describe('ginko-cms tailwind registration', () => {
  const tempDirs: string[] = []

  afterEach(() => {
    addImportsDir.mockClear()
    addComponentsDir.mockClear()
    addLayout.mockClear()
    addPlugin.mockClear()
    extendPages.mockClear()
    useLogger.mockClear()

    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { force: true, recursive: true })
    }
  })

  it('registers the cms content provider implementation through the content hook', async () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'ginko-cms-provider-'))
    tempDirs.push(rootDir)
    await installConvexSetup(rootDir)
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

    const providerHook = nuxt.hook.mock.calls.find(([name]) => name === 'content:providers')?.[1]
    expect(providerHook).toBeTypeOf('function')

    const providers: Record<string, string> = {}
    providerHook?.(providers)

    expect(providers).toEqual({
      cms: '@lupinum/ginko-cms/nuxt-provider',
    })
  })

  it('injects its runtime sources into the consumer Tailwind entry CSS', async () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'ginko-cms-tailwind-'))
    tempDirs.push(rootDir)
    await installConvexSetup(rootDir)
    const nuxt = createNuxtMock(rootDir)
    const options = {
      collections: {},
      defaultLocale: 'en',
      locales: [{ code: 'en', isDefault: true }],
      route: '/studio',
    }

    await setupModule(options, nuxt)
    await setupModule(options, nuxt)

    const matchingPlugins = nuxt.options.vite.plugins.filter(
      (entry) => entry.name === 'ginko-cms:tailwind-source-injection',
    )
    const plugin = matchingPlugins[0]

    expect(matchingPlugins).toHaveLength(1)
    expect(plugin).toBeDefined()
    expect(nuxt.options.vite.plugins[0]).toBe(plugin)
    expect(nuxt.options.css).toEqual([])
    expect(nuxt.options.colorMode).toEqual({
      classSuffix: '',
    })
    const moduleDependencies = getModuleDependencies(nuxt)
    const convexDependency = moduleDependencies['better-convex-nuxt']

    // vNext §10.2: `auth.enabled` and top-level `permissions` are removed
    // vocabulary. With no host auth-client and no convention file, Ginko
    // supplies its fallback client plus route protection.
    expect(convexDependency).toMatchObject({
      defaults: {
        auth: {
          routeProtection: {
            redirectTo: '/studio/auth/signin',
          },
          client: expect.stringContaining('convex-auth') as unknown as string,
        },
      },
    })
    expect(
      (convexDependency.defaults as { auth: Record<string, unknown> }).auth,
    ).not.toHaveProperty('enabled')
    expect(convexDependency.defaults).not.toHaveProperty('permissions')

    expect(moduleDependencies).toMatchObject({
      '@nuxtjs/color-mode': {
        version: '>=4.0.0',
        defaults: {
          classSuffix: '',
        },
      },
      'nuxt-i18n-micro': {
        version: '>=3.17.0',
        defaults: {
          autoDetectLanguage: false,
          disablePageLocales: true,
          localeCookie: null,
          redirects: false,
          translationDir: 'node_modules/.cache/ginko-cms/i18n-micro',
        },
      },
    })
    const consumerCssPath = resolve(rootDir, 'app/assets/css/tailwind.css')
    const expectedSource = relative(
      dirname(consumerCssPath),
      resolve(packageRoot, 'packages/cms/src/runtime'),
    ).replaceAll('\\', '/')

    const transformed = plugin?.transform?.(
      '@import "tailwindcss";\n@import "tw-animate-css";\n',
      consumerCssPath,
    )

    expect(transformed).toMatchObject({
      code: expect.any(String),
    })
    expect(transformed?.code).toContain(
      '@import "tailwindcss";\n@custom-variant dark (&:where(.dark, .dark *));',
    )
    expect(transformed?.code).toContain(`@source "${expectedSource}";`)
  })

  it('initializes css registration when the nuxt mock omits css', async () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'ginko-cms-tailwind-no-css-'))
    tempDirs.push(rootDir)
    await installConvexSetup(rootDir)
    const nuxt = createNuxtMock(rootDir)
    delete nuxt.options.css

    await setupModule(
      {
        collections: {},
        defaultLocale: 'en',
        locales: [{ code: 'en', isDefault: true }],
        route: '/studio',
      },
      nuxt,
    )

    expect(nuxt.options.css).toBeUndefined()
  })

  it('does not duplicate the dark variant when the consumer stylesheet already defines it', async () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'ginko-cms-tailwind-dark-variant-'))
    tempDirs.push(rootDir)
    await installConvexSetup(rootDir)
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

    const plugin = nuxt.options.vite.plugins.find(
      (entry) => entry.name === 'ginko-cms:tailwind-source-injection',
    )

    const transformed = plugin?.transform?.(
      '@import "tailwindcss";\n@custom-variant dark (&:is(.dark *));\n',
      resolve(rootDir, 'app/assets/css/tailwind.css'),
    )

    expect(transformed).toMatchObject({
      code: expect.any(String),
    })
    expect(transformed?.code.match(/@custom-variant\s+dark/g)).toHaveLength(1)
  })

  it('warns when a Tailwind stylesheet cannot receive CMS sources', async () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'ginko-cms-tailwind-missing-import-'))
    tempDirs.push(rootDir)
    await installConvexSetup(rootDir)
    const nuxt = createNuxtMock(rootDir)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    try {
      await setupModule(
        {
          collections: {},
          defaultLocale: 'en',
          locales: [{ code: 'en', isDefault: true }],
          route: '/studio',
        },
        nuxt,
      )

      const plugin = nuxt.options.vite.plugins.find(
        (entry) => entry.name === 'ginko-cms:tailwind-source-injection',
      )

      const transformed = plugin?.transform?.(
        '@tailwind utilities;\n',
        resolve(rootDir, 'app/assets/css/tailwind.css'),
      )

      expect(transformed).toBeNull()
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('Expected @import "tailwindcss";'))
    } finally {
      warn.mockRestore()
    }
  })

  it('rejects a non-empty color mode class suffix', async () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'ginko-cms-tailwind-invalid-color-mode-'))
    tempDirs.push(rootDir)
    await installConvexSetup(rootDir)
    const nuxt = createNuxtMock(rootDir)
    nuxt.options.colorMode = { classSuffix: '-mode' }

    await expect(
      setupModule(
        {
          collections: {},
          defaultLocale: 'en',
          locales: [{ code: 'en', isDefault: true }],
          route: '/studio',
        },
        nuxt,
      ),
    ).rejects.toThrow('ginko-cms requires colorMode.classSuffix to be ""')
  })
})
