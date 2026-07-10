import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
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

const moduleDefinition = (await import('../../packages/cms/src/module')).default as unknown as {
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
      css: [] as string[],
      build: {
        templates: [],
      },
      i18n: {
        strategy: 'prefix_except_default',
        autoDetectLanguage: false,
        localeCookie: null,
      },
      modules: ['nuxt-i18n-micro'],
      rootDir,
      runtimeConfig: {
        public: {},
      },
      vite: {
        plugins: [] as Array<{
          name: string
          transform?: (code: string, id: string) => { code: string; map: unknown } | string | null
        }>,
      },
    },
  }
}

describe('ginko-cms i18n setup', () => {
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

  it('does not derive host Nuxt i18n defaults when the app has no i18n locale config', async () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'ginko-cms-i18n-'))
    tempDirs.push(rootDir)
    await installConvexSetup(rootDir)
    const nuxt = createNuxtMock(rootDir)

    await setupModule(
      {
        collections: {},
        defaultLocale: 'fr',
        locales: [
          { code: 'fr', label: 'Français', isDefault: true },
          { code: 'it', label: 'Italiano' },
        ],
        route: '/studio',
      },
      nuxt,
    )

    expect(nuxt.options.i18n).toEqual({
      strategy: 'prefix_except_default',
      autoDetectLanguage: false,
      localeCookie: null,
    })
    expect((nuxt.options as { colorMode: { classSuffix: string } }).colorMode).toEqual({
      classSuffix: '',
    })
    expect(nuxt.options.runtimeConfig.public.ginkoCms).toMatchObject({
      defaultLocale: 'fr',
      locales: [
        { code: 'fr', label: 'Français', isDefault: true },
        { code: 'it', label: 'Italiano', isDefault: false },
      ],
    })
  })

  it('only syncs defaultLocale and fallbackLocale when the app already declared i18n locales', async () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'ginko-cms-i18n-configured-'))
    tempDirs.push(rootDir)
    await installConvexSetup(rootDir)
    const nuxt = createNuxtMock(rootDir) as ReturnType<typeof createNuxtMock> & {
      options: { i18n: Record<string, unknown> }
    }

    nuxt.options.i18n = {
      locales: [
        { code: 'fr', name: 'Français' },
        { code: 'it', name: 'Italiano' },
      ],
      strategy: 'prefix_except_default',
      autoDetectLanguage: false,
      localeCookie: null,
    }

    await setupModule(
      {
        collections: {},
        defaultLocale: 'fr',
        locales: [
          { code: 'fr', label: 'Français', isDefault: true },
          { code: 'it', label: 'Italiano' },
        ],
        route: '/studio',
      },
      nuxt,
    )

    expect(nuxt.options.i18n).toMatchObject({
      locales: [
        { code: 'fr', name: 'Français' },
        { code: 'it', name: 'Italiano' },
      ],
      defaultLocale: 'fr',
      fallbackLocale: 'fr',
      strategy: 'prefix_except_default',
      autoDetectLanguage: false,
      localeCookie: null,
    })
    expect((nuxt.options as { colorMode: { classSuffix: string } }).colorMode).toEqual({
      classSuffix: '',
    })
  })

  it('rejects a default locale that is not declared in ginkoCms.locales', async () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'ginko-cms-i18n-invalid-'))
    tempDirs.push(rootDir)
    await installConvexSetup(rootDir)
    const nuxt = createNuxtMock(rootDir)

    await expect(
      setupModule(
        {
          collections: {},
          defaultLocale: 'fr',
          locales: [{ code: 'de', label: 'Deutsch' }],
          route: '/studio',
        },
        nuxt,
      ),
    ).rejects.toThrow('ginkoCms.defaultLocale "fr" must exist in ginkoCms.locales')
  })
})
