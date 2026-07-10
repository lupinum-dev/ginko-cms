import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterEach, describe, expect, it, vi } from 'vitest'

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const moduleDir = resolve(packageRoot, 'packages/cms/src')

// `defu` is a dependency of packages/cms (not the workspace root), and is the
// exact merge the Ginko module and Nuxt use. Resolve it from the cms package so
// the merge check exercises the real implementation.
const cmsRequire = createRequire(resolve(packageRoot, 'packages/cms/package.json'))
const { defu } = (await import(cmsRequire.resolve('defu'))) as typeof import('defu')

// The module reads these Nuxt Kit helpers at import/eval time. `createResolver`
// mirrors the real resolver: `resolve('./runtime/convex-auth')` yields an
// absolute path under the module's runtime dir.
vi.mock('@nuxt/kit', () => ({
  addComponentsDir: vi.fn(),
  addImportsDir: vi.fn(),
  addLayout: vi.fn(),
  addPlugin: vi.fn(),
  addServerHandler: vi.fn(),
  addServerPlugin: vi.fn(),
  addTypeTemplate: vi.fn((template: { filename: string }) => ({
    dst: resolve(moduleDir, '.nuxt', template.filename),
  })),
  createResolver: () => ({
    resolve: (path: string) => resolve(moduleDir, path),
  }),
  defineNuxtModule: <T>(definition: T) => definition,
  extendPages: vi.fn(),
  useLogger: vi.fn(() => ({ success: vi.fn() })),
}))

vi.resetModules()

const moduleDefinition = (await import('../../packages/cms/src/module')).default as unknown as {
  moduleDependencies: (
    nuxt: Record<string, unknown>,
  ) => Record<string, { defaults?: Record<string, unknown> }>
}

type ConvexOption = false | Record<string, unknown> | undefined

function nuxtWith(convex: ConvexOption, srcDir: string) {
  return {
    options: {
      convex,
      modules: ['nuxt-i18n-micro'],
      rootDir: srcDir,
      srcDir,
    },
  }
}

function convexDep(convex: ConvexOption, srcDir: string) {
  return moduleDefinition.moduleDependencies(nuxtWith(convex, srcDir))['better-convex-nuxt']
}

/**
 * Model Nuxt 4.4's dependency-defaults merge for a single dependency that
 * provides only `defaults` (no overrides): `defu(nuxt.options.convex, defaults)`.
 * When Ginko emits no entry, Nuxt applies no merge and the host value is kept.
 */
function applyNuxtMerge(
  convex: ConvexOption,
  dep: { defaults?: Record<string, unknown> } | undefined,
) {
  if (!dep) return convex
  return defu(convex, dep.defaults ?? {})
}

describe('ginko-cms better-convex-nuxt dependency defaults (vNext §10.2 / decision 12)', () => {
  const tempDirs: string[] = []

  function freshSrcDir() {
    const dir = mkdtempSync(join(tmpdir(), 'ginko-convex-defaults-'))
    tempDirs.push(dir)
    return dir
  }

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) rmSync(dir, { force: true, recursive: true })
  })

  it('supplies the Ginko fallback client and route protection when nothing overrides it', () => {
    const dep = convexDep(undefined, freshSrcDir())
    const auth = dep?.defaults?.auth as Record<string, unknown>
    expect(auth.client).toEqual(expect.stringContaining('convex-auth'))
    expect(auth.routeProtection).toEqual({ redirectTo: '/studio/auth/signin' })
    // Removed vocabulary must not reappear.
    expect(auth).not.toHaveProperty('enabled')
    expect(dep?.defaults).not.toHaveProperty('permissions')
  })

  it('does not supply the client fallback when the host configures auth.client, but still provides route protection', () => {
    const dep = convexDep({ auth: { client: '~/my-auth' } }, freshSrcDir())
    const auth = dep?.defaults?.auth as Record<string, unknown>
    expect(auth).not.toHaveProperty('client')
    expect(auth.routeProtection).toEqual({ redirectTo: '/studio/auth/signin' })
  })

  it('does not supply the client fallback when the host has a convex-auth.ts convention file', () => {
    const srcDir = freshSrcDir()
    writeFileSync(join(srcDir, 'convex-auth.ts'), 'export default {}\n')
    const dep = convexDep(undefined, srcDir)
    const auth = dep?.defaults?.auth as Record<string, unknown>
    expect(auth).not.toHaveProperty('client')
    expect(auth.routeProtection).toEqual({ redirectTo: '/studio/auth/signin' })
  })

  // ---- Decision 12: the executable merge check, both cases ----

  it('nested `auth: false` survives the Nuxt dependency merge', () => {
    const host = { auth: false as const }
    const dep = convexDep({ ...host }, freshSrcDir())
    // Ginko injects neither client nor route protection when auth is disabled.
    expect(dep?.defaults?.auth).toBeUndefined()
    // And after Nuxt merges whatever Ginko emitted, `auth: false` still holds.
    const merged = applyNuxtMerge({ ...host }, dep) as Record<string, unknown>
    expect(merged.auth).toBe(false)
  })

  it('top-level `convex: false` survives ONLY because Ginko supplies no defaults entry', () => {
    const dep = convexDep(false, freshSrcDir())
    // Decision 12: no better-convex-nuxt entry at all when convex === false.
    expect(dep).toBeUndefined()
    // With no entry, Nuxt applies no merge and the off switch is preserved.
    expect(applyNuxtMerge(false, dep)).toBe(false)
    // Pin the defeat mechanism this guards against: ANY defaults object (even
    // an empty one) merged onto the primitive `false` replaces it — which is
    // exactly why Ginko must emit nothing rather than an empty entry.
    expect(defu(false as unknown as Record<string, unknown>, {})).not.toBe(false)
    expect(
      defu(false as unknown as Record<string, unknown>, {
        auth: { routeProtection: { redirectTo: '/studio/auth/signin' } },
      }),
    ).toEqual({ auth: { routeProtection: { redirectTo: '/studio/auth/signin' } } })
  })
})
