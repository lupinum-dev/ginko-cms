import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterEach, describe, expect, it, vi } from 'vitest'

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const moduleDir = resolve(packageRoot, 'packages/cms/src')

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

describe('ginko-cms better-convex-nuxt dependency defaults', () => {
  const tempDirs: string[] = []

  function freshSrcDir() {
    const dir = mkdtempSync(join(tmpdir(), 'ginko-convex-defaults-'))
    tempDirs.push(dir)
    return dir
  }

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) rmSync(dir, { force: true, recursive: true })
  })

  it('rejects omitted auth because Better Convex authentication is default-off', () => {
    expect(() => convexDep(undefined, freshSrcDir())).toThrow(
      'requires an explicit `convex.auth` object',
    )
  })

  it('requires the exact public origin even when the host configures a client', () => {
    expect(() => convexDep({ auth: { client: '~/my-auth' } }, freshSrcDir())).toThrow(
      'requires `convex.auth.origin`',
    )
  })

  it('supplies only the Studio redirect default for explicit host auth', () => {
    const dep = convexDep(
      { auth: { origin: 'http://localhost:3000', client: '~/my-auth' } },
      freshSrcDir(),
    )
    const auth = dep?.defaults?.auth as Record<string, unknown>
    expect(auth).not.toHaveProperty('client')
    expect(auth).toEqual({ redirectTo: '/studio/auth/signin' })
    expect(dep?.defaults).not.toHaveProperty('permissions')
  })

  // ---- Decision 12: the executable merge check, both cases ----

  it('rejects nested `auth: false` because Studio requires authentication', () => {
    expect(() => convexDep({ auth: false }, freshSrcDir())).toThrow(
      'requires an explicit `convex.auth` object',
    )
  })

  it('rejects top-level `convex: false` because Ginko requires Convex', () => {
    expect(() => convexDep(false, freshSrcDir())).toThrow('ginko-cms requires better-convex-nuxt')
  })
})
