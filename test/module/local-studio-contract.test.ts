import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

describe('local Studio consumer contract', () => {
  it('binds Better Convex auth and HTTP actions to the documented local origin', () => {
    const config = readFileSync('playground/nuxt.config.ts', 'utf8')

    expect(config).toContain("include: ['convex/server']")
    expect(config).toContain('siteUrl: process.env.CONVEX_SITE_URL')
    expect(config).toContain("origin: process.env.SITE_URL ?? 'http://localhost:3000'")
  })

  it('keeps source-linked Nuxt auth components independent of Lucide runtime injection', () => {
    for (const path of [
      'packages/cms/src/auth/components/CmsAuthRecover.vue',
      'packages/cms/src/auth/components/CmsAuthResetPassword.vue',
      'packages/cms/src/auth/components/CmsAuthSignIn.vue',
      'packages/cms/src/auth/components/CmsAuthSignUp.vue',
      'packages/cms/src/auth/components/CmsPasswordInput.vue',
    ]) {
      expect(readFileSync(path, 'utf8')).not.toContain('@lucide/vue')
    }

    const layout = readFileSync('packages/cms/src/auth/components/CmsAuthLayout.vue', 'utf8')
    expect(layout).toContain('border-right-color: transparent')
  })

  it('redirects authenticated users away from both public auth forms', () => {
    for (const path of [
      'packages/cms/src/auth/components/CmsAuthSignIn.vue',
      'packages/cms/src/auth/components/CmsAuthSignUp.vue',
    ]) {
      const component = readFileSync(path, 'utf8')
      expect(component).toContain('watch(')
      expect(component).toContain(
        'if (authenticated && !submitting) void redirectAuthenticatedUser()',
      )
      expect(component).toContain('await redirectAuthenticatedUser()')
    }
  })

  it('does not replace source-rehearsal dependencies while starting either dev server', () => {
    const launcher = readFileSync('scripts/dev-consumer-studio.mjs', 'utf8')

    expect(launcher.match(/--config\.verify-deps-before-run=warn/gu)).toHaveLength(2)
  })

  it('keeps Studio HMR assets on the Studio dev-server origin', () => {
    const config = readFileSync('packages/cms/studio-app/vite.config.ts', 'utf8')

    expect(config).toContain("origin: 'http://127.0.0.1:5252'")
    expect(config).toContain("new URL('../../..', import.meta.url)")
  })
})
