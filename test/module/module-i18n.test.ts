import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

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
const useLogger = vi.fn(() => ({ success: vi.fn() }))
const moduleDir = resolve(import.meta.dirname, '../../packages/cms/src')

vi.mock('@nuxt/kit', () => ({
  addComponentsDir,
  addImportsDir,
  addLayout,
  addPlugin,
  addServerHandler,
  addServerPlugin,
  addTypeTemplate,
  addTemplate,
  createResolver: () => ({ resolve: (path: string) => resolve(moduleDir, path) }),
  defineNuxtModule: <T>(definition: T) => definition,
  extendPages,
  useLogger,
}))

vi.resetModules()

const moduleDefinition = (await import('../../packages/cms/src/module')).default as unknown as {
  setup: (options: Record<string, unknown>, nuxt: Record<string, unknown>) => Promise<void>
}

function createNuxtMock(rootDir: string, contentI18n: Record<string, unknown>) {
  return {
    hook: vi.fn(),
    options: {
      alias: {} as Record<string, string>,
      css: [] as string[],
      build: { templates: [] },
      content: { i18n: contentI18n },
      i18n: {
        strategy: 'prefix_except_default',
        autoDetectLanguage: false,
        localeCookie: null,
      } as Record<string, unknown>,
      modules: ['nuxt-i18n-micro'],
      rootDir,
      runtimeConfig: { public: {} as Record<string, unknown> },
      vite: { plugins: [] },
    },
  }
}

describe('ginko-cms i18n setup', () => {
  const tempDirs: string[] = []

  async function fixture(contentI18n: Record<string, unknown>) {
    const rootDir = mkdtempSync(join(tmpdir(), 'ginko-cms-i18n-'))
    tempDirs.push(rootDir)
    await installConvexSetup(rootDir)
    writeFileSync(join(rootDir, 'content.config.ts'), 'export default { collections: {} }\n')
    return createNuxtMock(rootDir, contentI18n)
  }

  afterEach(() => {
    vi.clearAllMocks()
    for (const dir of tempDirs.splice(0)) rmSync(dir, { force: true, recursive: true })
  })

  it('uses Content i18n as CMS policy without deriving host i18n configuration', async () => {
    const nuxt = await fixture({
      defaultLocale: 'fr',
      locales: ['fr', 'it'],
      fallback: { it: ['fr'] },
    })

    await moduleDefinition.setup({ route: '/studio' }, nuxt)

    expect(nuxt.options.i18n).toEqual({
      strategy: 'prefix_except_default',
      autoDetectLanguage: false,
      localeCookie: null,
    })
    expect(nuxt.options.runtimeConfig.public.ginkoCms).toMatchObject({
      defaultLocale: 'fr',
      locales: [
        { code: 'fr', isDefault: true },
        { code: 'it', isDefault: false, fallback: 'fr' },
      ],
    })
  })

  it('only fills compatible host i18n defaults from Content policy', async () => {
    const nuxt = await fixture({ defaultLocale: 'fr', locales: ['fr', 'it'] })
    nuxt.options.i18n.locales = [{ code: 'fr' }, { code: 'it' }]

    await moduleDefinition.setup({ route: '/studio' }, nuxt)

    expect(nuxt.options.i18n).toMatchObject({
      locales: [{ code: 'fr' }, { code: 'it' }],
      defaultLocale: 'fr',
      fallbackLocale: 'fr',
    })
  })

  it('rejects host i18n that disagrees with Content policy', async () => {
    const nuxt = await fixture({ defaultLocale: 'fr', locales: ['fr', 'it'] })
    nuxt.options.i18n.locales = [{ code: 'fr' }]

    await expect(moduleDefinition.setup({ route: '/studio' }, nuxt)).rejects.toThrow(
      'Missing locale "it" in i18n.locales',
    )
  })

  it('rejects removed CMS-owned collection and locale policy options', async () => {
    const nuxt = await fixture({ defaultLocale: 'fr', locales: ['fr'] })

    await expect(
      moduleDefinition.setup({ route: '/studio', collections: {} }, nuxt),
    ).rejects.toThrow('Unknown ginkoCms option "collections"')
    await expect(moduleDefinition.setup({ route: '/studio', siteI18n: {} }, nuxt)).rejects.toThrow(
      'Unknown ginkoCms option "siteI18n"',
    )
  })
})
