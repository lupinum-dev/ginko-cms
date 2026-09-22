import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { describe, expect, it } from 'vitest'

import {
  protectPrivateRoutes,
  resolvePrivateRouteRoot,
} from '../../packages/cms/src/module/private-route-rules.js'

// Exercise the installed Nitro normalization and matching dependencies, without
// adding those transitive packages to the workspace's public dependencies.
const require = createRequire(import.meta.url)
const cmsRequire = createRequire(resolve('packages/cms/package.json'))
const nitroRoot = dirname(cmsRequire.resolve('nitropack/package.json'))
const nitroRequire = createRequire(resolve(nitroRoot, 'package.json'))
const { loadOptions } = await import(pathToFileURL(resolve(nitroRoot, 'dist/core/index.mjs')).href)
const { createRouter, toRouteMatcher } = require(nitroRequire.resolve('radix3'))
const { defu } = require(nitroRequire.resolve('defu'))

describe('private Studio and draft-preview routes', () => {
  it('defeats inherited and child ISR/SWR after real Nitro normalization and route matching', async () => {
    const rules = {
      '/**': {
        isr: 600,
        swr: 600,
        prerender: true,
        headers: {
          'Cache-Control': 'public, max-age=600',
          'Vercel-CDN-Cache-Control': 'public, s-maxage=600',
          'X-Robots-Tag': 'index',
          'x-host-header': 'preserved',
        },
      },
      '/studio/content/**': { cache: { maxAge: 900 }, swr: 900, isr: 900 },
      '/drafts/landing/example': { cache: { maxAge: 900 }, headers: { 'x-page': 'preserved' } },
      '/blog/**': { isr: 1200 },
    }
    const publicBefore = structuredClone(rules['/blog/**'])
    protectPrivateRoutes(rules, ['/studio', '/drafts'])
    const normalized = await loadOptions({
      rootDir: process.cwd(),
      preset: 'node-server',
      routeRules: rules,
    })
    const matcher = toRouteMatcher(createRouter({ routes: normalized.routeRules }))
    const resolveRules = (path: string) => defu({}, ...matcher.matchAll(path).reverse())
    for (const path of [
      '/studio',
      '/studio/auth/signin',
      '/studio/content/blog/one',
      '/drafts',
      '/drafts/landing/example',
      '/drafts/blog/one',
    ]) {
      const resolved = resolveRules(path)
      expect(resolved, path).toMatchObject({
        cache: false,
        isr: false,
        swr: false,
        prerender: false,
        robots: false,
        sitemap: false,
      })
      for (const [name, value] of Object.entries(resolved.headers)) {
        if (name.toLowerCase().includes('cache-control')) expect(value).toBe('private, no-store')
        if (name.toLowerCase() === 'x-robots-tag') expect(value).toBe('noindex, nofollow')
      }
      expect(resolved.headers['x-host-header']).toBe('preserved')
    }
    expect(resolveRules('/drafts/landing/example').headers['x-page']).toBe('preserved')
    expect(rules['/blog/**']).toEqual(publicBefore)
    expect(resolveRules('/blog/one')).toMatchObject({
      isr: 1200,
      cache: { swr: true, maxAge: 600 },
    })
    expect(resolveRules('/studio-tour')).toMatchObject({ isr: 600, cache: { swr: true } })
  })

  it('allows an explicitly configured Studio root and protects its whole host', () => {
    const rules = { '/blog/**': { isr: 1200 } }
    const root = resolvePrivateRouteRoot('/', 'route', true)
    protectPrivateRoutes(rules, [root])
    expect(rules).toMatchObject({
      '/': { cache: false },
      '/**': { cache: false },
      '/blog/**': { cache: false, isr: false },
    })
  })

  it('normalizes static nested roots and rejects ambiguous preview locations', () => {
    expect(resolvePrivateRouteRoot('/internal/drafts/', 'preview.route')).toBe('/internal/drafts')
    for (const route of [
      '/',
      '',
      'https://example.com/preview',
      '/preview/**',
      '/preview?draft=1',
      '/preview#draft',
      '/preview/:slug',
      '/preview/../blog',
      '/preview//blog',
      '/preview%2fblog',
    ]) {
      expect(() => resolvePrivateRouteRoot(route, 'preview.route')).toThrow('static, non-root path')
    }
  })
})
