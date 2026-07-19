import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterEach, describe, expect, it, vi } from 'vitest'

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const moduleDir = resolve(packageRoot, 'packages/cms/src')

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
    expect(auth.routeProtection).toEqual({
      redirectTo: '/studio/auth/signin',
      preserveReturnTo: true,
    })
    // Removed vocabulary must not reappear.
    expect(auth).not.toHaveProperty('enabled')
    expect(dep?.defaults).not.toHaveProperty('permissions')
  })

  it('does not supply the client fallback when the host configures auth.client, but still provides route protection', () => {
    const dep = convexDep({ auth: { client: '~/my-auth' } }, freshSrcDir())
    const auth = dep?.defaults?.auth as Record<string, unknown>
    expect(auth).not.toHaveProperty('client')
    expect(auth.routeProtection).toEqual({
      redirectTo: '/studio/auth/signin',
      preserveReturnTo: true,
    })
  })

  it('does not supply the client fallback when the host has a convex-auth.ts convention file', () => {
    const srcDir = freshSrcDir()
    writeFileSync(join(srcDir, 'convex-auth.ts'), 'export default {}\n')
    const dep = convexDep(undefined, srcDir)
    const auth = dep?.defaults?.auth as Record<string, unknown>
    expect(auth).not.toHaveProperty('client')
    expect(auth.routeProtection).toEqual({
      redirectTo: '/studio/auth/signin',
      preserveReturnTo: true,
    })
  })

  // ---- Decision 12: the executable merge check, both cases ----

  it('rejects nested `auth: false` because Studio requires authentication', () => {
    expect(() => convexDep({ auth: false }, freshSrcDir())).toThrow(
      'Ginko CMS Studio requires authentication',
    )
  })

  it('rejects top-level `convex: false` because Ginko requires Convex', () => {
    expect(() => convexDep(false, freshSrcDir())).toThrow('ginko-cms requires better-convex-nuxt')
  })
})
