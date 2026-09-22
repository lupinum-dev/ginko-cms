import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { buildResolvedContentContract } from '@lupinum/ginko-content/cms-contract'
import { loadNuxt } from '@nuxt/kit'
import { expect, it } from 'vitest'

import { installConvexSetup } from './convex-setup-helpers.js'

it('inherits private cache restrictions on actual i18n-localized preview and Studio routes', async () => {
  const root = process.cwd()
  const tempDir = mkdtempSync(join(tmpdir(), 'ginko-private-i18n-'))
  let nuxt: Awaited<ReturnType<typeof loadNuxt>> | undefined
  try {
    const cmsModule = resolve(root, 'packages/cms/src/module.ts')
    const i18nModule = resolve(root, 'playground/node_modules/nuxt-i18n-micro/dist/module.mjs')
    writeFileSync(
      join(tempDir, 'package.json'),
      JSON.stringify({
        private: true,
        type: 'module',
        dependencies: {
          '@lupinum/ginko-cms-convex': 'workspace:*',
          'better-auth': '1.7.2',
          '@lupinum/better-convex-nuxt': '1.0.0-beta.5',
        },
      }),
    )
    symlinkSync(resolve(root, 'node_modules'), join(tempDir, 'node_modules'))
    mkdirSync(join(tempDir, 'locales'))
    for (const locale of ['en', 'de']) writeFileSync(join(tempDir, `locales/${locale}.json`), '{}')
    mkdirSync(join(tempDir, 'app/pages/preview'), { recursive: true })
    writeFileSync(
      join(tempDir, 'app/pages/preview/[id].vue'),
      '<template><div>Preview</div></template>',
    )
    writeFileSync(
      join(tempDir, 'nuxt.config.ts'),
      `
      import cms from ${JSON.stringify(cmsModule)}
      export default defineNuxtConfig({
        modules: [${JSON.stringify(i18nModule)}, cms],
        convex: { auth: { origin: 'http://localhost:3000' } },
        i18n: {
          locales: [{ code: 'en', iso: 'en-US' }, { code: 'de', iso: 'de-DE' }],
          defaultLocale: 'en', strategy: 'prefix_except_default',
          disablePageLocales: true, disableWatcher: true, autoDetectLanguage: false,
          redirects: false, localeCookie: null, translationDir: 'locales'
        },
        routeRules: { '/**': { isr: 300, swr: 300 } }
      })
    `,
    )
    await installConvexSetup(tempDir)
    mkdirSync(join(tempDir, '.ginko'))
    writeFileSync(
      join(tempDir, '.ginko/content-contract.json'),
      JSON.stringify(
        buildResolvedContentContract(
          { collections: {} },
          { defaultLocale: 'en', locales: ['en', 'de'] },
        ),
      ),
    )
    nuxt = await loadNuxt({ cwd: tempDir, dev: false, ready: true })
    const config = { ...nuxt.options.nitro }
    await nuxt.callHook('nitro:config', config)
    for (const path of [
      '/studio',
      '/studio/**',
      '/preview',
      '/preview/**',
      '/de/studio',
      '/de/studio/**',
      '/de/preview',
      '/de/preview/**',
    ]) {
      expect(config.routeRules?.[path], path).toMatchObject({
        cache: false,
        isr: false,
        swr: false,
        prerender: false,
        headers: { 'cache-control': 'private, no-store', 'x-robots-tag': 'noindex, nofollow' },
      })
    }
    expect(config.routeRules?.['/**']).toMatchObject({ isr: 300, swr: 300 })
  } finally {
    await nuxt?.close()
    rmSync(tempDir, { recursive: true, force: true })
  }
}, 30000)
