import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

type PackageJson = {
  name: string
  bin?: Record<string, string>
  exports?: Record<string, string | { import?: string; types?: string }>
  files?: string[]
  dependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
}

function readPackageJson(relativePath: string): PackageJson {
  return JSON.parse(readFileSync(resolve(import.meta.dirname, '../..', relativePath), 'utf-8'))
}

function assertExportTargetsExist(packageRoot: string, packageJson: PackageJson) {
  for (const [name, entry] of Object.entries(packageJson.exports ?? {})) {
    if (typeof entry === 'string') {
      expect(existsSync(resolve(import.meta.dirname, '../..', packageRoot, entry)), name).toBe(true)
      continue
    }

    for (const target of [entry.import, entry.types]) {
      if (!target) continue
      expect(existsSync(resolve(import.meta.dirname, '../..', packageRoot, target)), name).toBe(
        true,
      )
    }
  }
}

const cmsPackage = readPackageJson('packages/cms/package.json')
const convexPackage = readPackageJson('packages/convex/package.json')
const contractPackage = readPackageJson('packages/contract/package.json')

describe('package exports', () => {
  it('keeps @lupinum/ginko-cms as the Nuxt module and bridge manifest package', () => {
    expect(cmsPackage.name).toBe('@lupinum/ginko-cms')
    expect(cmsPackage.bin).toEqual({
      'ginko-cms': './dist/cli/ginko-cms.js',
    })
    expect(cmsPackage.exports?.['.']).toEqual({
      types: './dist/types.d.mts',
      import: './dist/module.mjs',
    })
    expect(cmsPackage.exports?.['./convex/manifest']).toEqual({
      types: './convex/manifest.d.ts',
      import: './convex/manifest.js',
    })
    expect(cmsPackage.exports?.['./convex/config']).toBeUndefined()
    expect(cmsPackage.exports?.['./convex/better-auth']).toBeUndefined()
    expect(cmsPackage.exports?.['./convex/auth']).toEqual({
      types: './dist/convex/auth.d.ts',
      import: './dist/convex/auth.js',
    })
    expect(cmsPackage.exports?.['./convex/server']).toBeUndefined()
    expect(cmsPackage.exports?.['./convex/values']).toBeUndefined()
    expect(cmsPackage.exports?.['./convex/component-bridge']).toBeUndefined()
    expect(cmsPackage.exports?.['./shared/*.js']).toBeUndefined()
    expect(cmsPackage.exports?.['./shared/*']).toBeUndefined()
    expect(cmsPackage.exports?.['./shared/fields']).toBeUndefined()
    expect(cmsPackage.exports?.['./runtime/types']).toBeUndefined()
    expect(cmsPackage.files).toEqual(
      expect.arrayContaining(['convex/manifest.d.ts', 'convex/manifest.js', 'dist', 'templates']),
    )
  })

  it('does not expose legacy Convex component surfaces from the Nuxt package', () => {
    expect(cmsPackage.exports?.['./convex.config']).toBeUndefined()
    expect(cmsPackage.exports?.['./convex.auth']).toBeUndefined()
    expect(cmsPackage.exports?.['./component']).toBeUndefined()
    expect(cmsPackage.exports?.['./component-bridge']).toBeUndefined()
    expect(cmsPackage.exports?.['./convex/component']).toBeUndefined()
    expect(cmsPackage.exports?.['./test']).toBeUndefined()
  })

  it('loads the generated bridge manifest from the Nuxt package output', async () => {
    const manifestModule = await import('../../packages/cms/convex/manifest.js')

    expect(manifestModule.default).toBe(manifestModule.ginkoCmsBridgeManifest)
    expect(manifestModule.default.packageName).toBe('@lupinum/ginko-cms')
    expect(manifestModule.default.renderFiles).toBeTypeOf('function')
  })

  it('ships the Convex component as a dedicated package surface', () => {
    expect(convexPackage.name).toBe('@lupinum/ginko-cms-convex')
    expect(convexPackage.exports?.['./convex.config']).toEqual({
      types: './dist/component/convex.config.d.ts',
      import: './dist/component/convex.config.js',
    })
    expect(convexPackage.exports?.['./convex.auth']).toEqual({
      types: './dist/convex.auth.d.ts',
      import: './dist/convex.auth.js',
    })
    expect(convexPackage.exports?.['./component']).toEqual({
      types: './dist/_generated/component.d.ts',
      import: './dist/_generated/component.js',
    })
    expect(convexPackage.exports?.['./_generated/component.js']).toEqual({
      types: './dist/_generated/component.d.ts',
      import: './dist/_generated/component.js',
    })
    expect(convexPackage.exports?.['./component-bridge']).toEqual({
      types: './dist/componentBridge.d.ts',
      import: './dist/componentBridge.js',
    })
  })

  it('materializes Convex component modules through the slim component dist', () => {
    assertExportTargetsExist('packages/convex', convexPackage)

    for (const relativePath of [
      'packages/convex/dist/component/convex.config.js',
      'packages/convex/dist/component/schema.js',
      'packages/convex/dist/component/crons.js',
      'packages/convex/dist/component/assets.js',
      'packages/convex/dist/convex.auth.js',
      'packages/convex/dist/componentBridge.js',
      'packages/convex/dist/schema.js',
      'packages/convex/dist/_generated/server.js',
    ]) {
      expect(
        existsSync(resolve(import.meta.dirname, '../..', relativePath)),
        `${relativePath} must exist for Convex component bundling`,
      ).toBe(true)
    }
  })

  it('keeps the Convex package free of Nuxt/browser UI dependencies', () => {
    const dependencies = {
      ...convexPackage.dependencies,
      ...convexPackage.peerDependencies,
    }

    for (const forbidden of ['nuxt', '@nuxt/kit', 'vue', '@tiptap/vue-3', '@nuxt/module-builder']) {
      expect(dependencies[forbidden]).toBeUndefined()
    }
    expect(dependencies['@lupinum/ginko-cms-contract']).toBeDefined()
    expect(dependencies['@lupinum/trellis']).toBeDefined()
    expect(dependencies['@lupinum/trellis-bridge']).toBeDefined()
  })

  it('ships the domain contract as the shared stable package', () => {
    expect(contractPackage.name).toBe('@lupinum/ginko-cms-contract')
    expect(contractPackage.exports?.['./shared/fields']).toEqual({
      types: './dist/fields/index.d.ts',
      import: './dist/fields/index.js',
    })
    expect(contractPackage.exports?.['./shared/publicContent.js']).toEqual({
      types: './dist/publicContent.d.ts',
      import: './dist/publicContent.js',
    })
    expect(contractPackage.exports?.['./shared/publicContent']).toBeUndefined()
    expect(contractPackage.exports?.['./shared/types.js']).toEqual({
      types: './dist/types.d.ts',
      import: './dist/types.js',
    })
    expect(contractPackage.exports?.['./shared/types']).toBeUndefined()
    expect(contractPackage.exports?.['./convex/validators.js']).toEqual({
      types: './dist/validators.d.ts',
      import: './dist/validators.js',
    })
    expect(contractPackage.exports?.['./convex/validators']).toBeUndefined()
  })
})
