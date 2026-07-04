/**
 * E2E boot test for @lupinum/ginko-cms Nuxt module.
 *
 * Uses loadNuxt from @nuxt/kit to load a real Nuxt instance with the module
 * installed, then asserts on the resulting Nuxt options, hooks, and runtime
 * config — without needing a running Convex backend.
 *
 * We create a disposable fixture in a temp directory and pre-install the
 * generated bridge files so validation-only module setup can succeed without
 * mutating repo fixtures.
 */
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  renderComponentBridgeFile,
  renderComponentBridgeFiles,
} from '@lupinum/trellis-bridge/manifest'
import { loadNuxt } from '@nuxt/kit'
import { describe, it, expect, afterAll, beforeAll } from 'vitest'

import { ginkoCmsBridgeManifest } from '../../packages/cms/src/module/bridge-manifest.js'

const projectRoot = fileURLToPath(new URL('../../', import.meta.url))
const modulePath = resolve(projectRoot, 'packages/cms/src/module')
type LoadedNuxt = Awaited<ReturnType<typeof loadNuxt>>
type ComponentDir = string | { path?: string }
type NuxtPage = { name?: string; path: string }

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
          '@convex-dev/better-auth': '^0.12.2',
          '@lupinum/ginko-cms-convex': 'workspace:*',
          'better-auth': '1.6.11',
        },
      }),
      'utf-8',
    )

    for (const file of await renderComponentBridgeFiles(ginkoCmsBridgeManifest)) {
      const target = join(tempDir, file.relativePath)
      mkdirSync(dirname(target), { recursive: true })
      writeFileSync(target, renderComponentBridgeFile(ginkoCmsBridgeManifest, file), 'utf8')
    }

    const edits =
      typeof ginkoCmsBridgeManifest.managedEdits === 'function'
        ? await ginkoCmsBridgeManifest.managedEdits()
        : (ginkoCmsBridgeManifest.managedEdits ?? [])
    for (const edit of edits) {
      const target = join(tempDir, edit.relativePath)
      mkdirSync(dirname(target), { recursive: true })
      writeFileSync(target, edit.apply(null), 'utf8')
    }

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

  // --- Composables (imports:dirs hook) ---

  it('registers composables via imports:dirs hook', async () => {
    const dirs: string[] = []
    await getNuxt(nuxt).callHook('imports:dirs', dirs)

    const hasComposables = dirs.some((dir: string) => dir.includes('runtime/composables'))
    expect(hasComposables).toBe(true)
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
      return path?.includes('runtime/components')
    })
    expect(hasComponentDir).toBe(true)
  })

  // --- Studio pages (pages:extend hook) ---

  it('registers studio pages at the configured /studio route', async () => {
    const pages: NuxtPage[] = []
    await getNuxt(nuxt).callHook('pages:extend', pages)

    const pageNames = pages.map((page) => page.name)
    expect(pageNames).toContain('studio-auth-signin')
    expect(pageNames).toContain('studio-auth-register')
    expect(pageNames).toContain('studio-host')

    // Verify paths are rooted at /studio
    const studioPaths = pages.filter((page) => page.path.startsWith('/studio'))
    expect(studioPaths.length).toBe(pages.length)
  })

  // --- Convex module wiring ---

  it('wires studio route protection through better-convex-nuxt', () => {
    const options = getNuxt(nuxt).options as {
      convex?: { auth?: { routeProtection?: { redirectTo?: string } }; permissions?: unknown }
      trellis?: unknown
    }
    expect(options.trellis).toBeUndefined()
    expect(options.convex?.auth?.routeProtection?.redirectTo).toBe('/studio/auth/signin')
    expect(options.convex?.permissions).toBe(false)
  })
})
