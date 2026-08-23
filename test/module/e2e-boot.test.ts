/**
 * E2E boot test for @lupinum/ginko-cms Nuxt module.
 *
 * Uses loadNuxt from @nuxt/kit to load a real Nuxt instance with the module
 * installed, then asserts on the resulting Nuxt options, hooks, and runtime
 * config — without needing a running Convex backend.
 *
 * We create a disposable fixture in a temp directory and pre-install the direct
 * Convex setup files so validation-only module setup can succeed without
 * mutating repo fixtures.
 */
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { buildResolvedContentContract } from '@lupinum/ginko-content/cms-contract'
import { loadNuxt } from '@nuxt/kit'
import { describe, it, expect, afterAll, beforeAll } from 'vitest'

import { installConvexSetup } from './convex-setup-helpers.js'

const projectRoot = fileURLToPath(new URL('../../', import.meta.url))
const modulePath = resolve(projectRoot, 'packages/cms/src/module')
type LoadedNuxt = Awaited<ReturnType<typeof loadNuxt>>
type ComponentDir = string | { path?: string }

function getNuxt(instance: LoadedNuxt | undefined): LoadedNuxt {
  if (!instance) throw new Error('Nuxt test instance was not loaded.')
  return instance
}

describe('ginko-cms module e2e boot', () => {
  let nuxt: LoadedNuxt | undefined
  let tempDir: string

  beforeAll(async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'ginko-cms-e2e-'))

    // Create a minimal nuxt.config.ts
    writeFileSync(
      join(tempDir, 'nuxt.config.ts'),
      [
        `import MyModule from '${modulePath}'`,
        ``,
        `export default defineNuxtConfig({`,
        `  modules: [MyModule],`,
        `  convex: {`,
        `    auth: { origin: 'http://localhost:3000' },`,
        `  },`,
        `})`,
      ].join('\n'),
      'utf-8',
    )

    // Create a minimal app.vue
    writeFileSync(join(tempDir, 'app.vue'), '<template><div>test</div></template>', 'utf-8')

    // Create package.json
    writeFileSync(
      join(tempDir, 'package.json'),
      JSON.stringify({
        private: true,
        name: 'e2e-boot-fixture',
        type: 'module',
        dependencies: {
          '@lupinum/ginko-cms-convex': 'workspace:*',
          'better-auth': '1.7.1',
          '@lupinum/better-convex-nuxt': '1.0.0-beta.1',
        },
      }),
      'utf-8',
    )

    await installConvexSetup(tempDir)
    mkdirSync(join(tempDir, '.ginko'))
    writeFileSync(
      join(tempDir, '.ginko/content-contract.json'),
      `${JSON.stringify(
        buildResolvedContentContract({ collections: {} }, { defaultLocale: 'en', locales: ['en'] }),
      )}\n`,
      'utf8',
    )

    // Symlink node_modules from project root so loadNuxt can resolve dependencies
    symlinkSync(resolve(projectRoot, 'node_modules'), join(tempDir, 'node_modules'))

    nuxt = await loadNuxt({
      cwd: tempDir,
      dev: false,
      ready: true,
    })
  })

  afterAll(async () => {
    await nuxt?.close()
    if (tempDir) {
      rmSync(tempDir, { force: true, recursive: true })
    }
  })

  it('module loads without errors via loadNuxt', () => {
    expect(nuxt).toBeDefined()
    expect(getNuxt(nuxt).options).toBeDefined()
  })

  it('does not install an i18n runtime into a locale-less host', () => {
    expect(getNuxt(nuxt).options.modules).not.toContain('nuxt-i18n-micro')
  })

  // --- Runtime config ---

  it('injects ginkoCms into public runtime config', () => {
    const publicConfig = getNuxt(nuxt).options.runtimeConfig.public
    expect(publicConfig.ginkoCms).toBeDefined()
    expect(publicConfig.ginkoCms.route).toBe('/studio')
    expect(publicConfig.ginkoCms.studio).toMatchObject({
      assetBase: expect.stringMatching(/^\/_ginko-cms-studio\/[a-f0-9]{12}$/),
      devServer: null,
    })
  })

  it('registers the shared module theme stylesheet once', () => {
    const cssEntries = getNuxt(nuxt).options.css.filter((entry: string) =>
      entry.endsWith('runtime/assets/css/cms-theme.css'),
    )

    expect(cssEntries).toHaveLength(0)
  })

  it('configures color mode to use the .dark class contract', () => {
    expect(getNuxt(nuxt).options.colorMode).toMatchObject({
      classSuffix: '',
    })
  })

  it('sets default locale in runtime config', () => {
    const cmsConfig = getNuxt(nuxt).options.runtimeConfig.public.ginkoCms
    expect(cmsConfig.defaultLocale).toBe('en')
  })

  it('does not force host app i18n locales when the app did not configure them', () => {
    expect(getNuxt(nuxt).options.i18n?.locales).toBeUndefined()
    expect(getNuxt(nuxt).options.i18n?.defaultLocale).toBeUndefined()
  })

  it('resolves the runtime alias from sibling source during module setup', () => {
    expect(getNuxt(nuxt).options.alias['#ginko-cms']).toBe(
      resolve(projectRoot, 'packages/cms/src/runtime'),
    )
  })

  // --- Components (components:dirs hook) ---

  it('registers components directory via components:dirs hook', async () => {
    const dirs: ComponentDir[] = []
    await getNuxt(nuxt).callHook('components:dirs', dirs)

    const hasComponentDir = dirs.some((entry) => {
      const path = typeof entry === 'string' ? entry : entry?.path
      return path?.includes('auth/components')
    })
    expect(hasComponentDir).toBe(true)
  })

  it('enables build-time Studio routes for page-less hosts', async () => {
    expect(getNuxt(nuxt).options.pages).toMatchObject({ enabled: true })

    const pages: Array<{ name?: string; path?: string; file?: string }> = []
    await getNuxt(nuxt).callHook('pages:extend', pages)

    expect(pages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'studio-auth-signin',
          path: '/studio/auth/signin',
          meta: { layout: false },
        }),
        expect.objectContaining({
          name: 'studio-auth-register',
          path: '/studio/auth/register',
          meta: { layout: false },
        }),
        expect.objectContaining({
          name: 'studio-host',
          path: '/studio/:slug(.*)*',
          meta: {
            layout: false,
            convexAuth: { redirectTo: '/studio/auth/signin' },
          },
        }),
      ]),
    )
  })

  // --- Convex module wiring ---

  it('wires studio route protection through @lupinum/better-convex-nuxt', () => {
    const options = getNuxt(nuxt).options as {
      convex?: { auth?: { redirectTo?: string }; permissions?: unknown }
      trellis?: unknown
    }
    expect(options.trellis).toBeUndefined()
    expect(options.convex?.auth?.redirectTo).toBe('/studio/auth/signin')
    // The removed `permissions` vocabulary (vNext §10.2 / decision 12) must
    // never reappear on the @lupinum/better-convex-nuxt dependency defaults.
    expect(options.convex).not.toHaveProperty('permissions')
  })
})
