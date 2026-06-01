import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { loadNuxt } from '@nuxt/kit'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  cmsPackageRoot,
  contentPackageRoot,
  contractPackageRoot,
  convexPackageRoot,
  packPackage,
  projectRoot,
  readPackageJson,
} from './package-fixture'

type CompatibilityMatrix = {
  releaseStack?: Record<string, string>
}

const workspacePackageJson = readPackageJson(projectRoot)
const cmsPackageJson = readPackageJson(cmsPackageRoot)
const contentDependency = cmsPackageJson.peerDependencies?.['@lupinum/ginko-content']
const compatibilityMatrix = JSON.parse(
  readFileSync(join(projectRoot, 'packages/cms/compatibility.json'), 'utf8'),
) as CompatibilityMatrix
const trellisDependency = compatibilityMatrix.releaseStack?.['@lupinum/trellis']
const trellisBridgeDependency = compatibilityMatrix.releaseStack?.['@lupinum/trellis-bridge']

if (!contentDependency) {
  throw new Error('Missing @lupinum/ginko-content peer dependency in @lupinum/ginko-cms.')
}
if (!trellisDependency || !trellisBridgeDependency) {
  throw new Error('Missing Trellis release stack dependencies in packages/cms/compatibility.json.')
}

type LoadedNuxt = Awaited<ReturnType<typeof loadNuxt>>

function yamlQuote(value: string) {
  return `'${value.replaceAll("'", "''")}'`
}

function writeConsumerWorkspaceConfig(cwd: string, overrides: Record<string, string>) {
  const lines = [
    'packages:',
    '  - .',
    'minimumReleaseAge: 1440',
    'minimumReleaseAgeExclude:',
    "  - '@lupinum/*'",
    'overrides:',
  ]

  for (const [name, specifier] of Object.entries(overrides)) {
    lines.push(`  ${yamlQuote(name)}: ${yamlQuote(specifier)}`)
  }

  writeFileSync(join(cwd, 'pnpm-workspace.yaml'), `${lines.join('\n')}\n`, 'utf8')
}

describe('ginko-cms package-first consumer fixture', () => {
  let nuxt: LoadedNuxt | undefined
  let tempDir: string

  beforeAll(async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'ginko-cms-package-consumer-'))

    writeFileSync(
      join(tempDir, 'nuxt.config.ts'),
      [
        `export default defineNuxtConfig({`,
        `  modules: ['@lupinum/ginko-content', '@lupinum/ginko-cms'],`,
        `})`,
      ].join('\n'),
      'utf8',
    )

    writeFileSync(
      join(tempDir, 'content.config.ts'),
      [
        `import { defineCollection, defineContentConfig } from '@lupinum/ginko-content/config'`,
        ``,
        `const pages = defineCollection('pages', {`,
        `  type: 'page',`,
        `  source: '**/*.md',`,
        `})`,
        ``,
        `export default defineContentConfig({`,
        `  provider: 'cms',`,
        `  collections: { pages },`,
        `})`,
      ].join('\n'),
      'utf8',
    )

    writeFileSync(
      join(tempDir, 'app.vue'),
      '<template><div>package-consumer</div></template>',
      'utf8',
    )
    const contractTarball = packPackage(contractPackageRoot, tempDir)
    const convexTarball = packPackage(convexPackageRoot, tempDir)
    const contentTarball = packPackage(contentPackageRoot, tempDir)
    const cmsTarball = packPackage(cmsPackageRoot, tempDir)

    writeFileSync(
      join(tempDir, 'package.json'),
      JSON.stringify({
        private: true,
        name: 'ginko-cms-package-consumer-fixture',
        packageManager: workspacePackageJson.packageManager,
        type: 'module',
        dependencies: {
          nuxt: workspacePackageJson.devDependencies.nuxt,
          '@convex-dev/better-auth': cmsPackageJson.dependencies['@convex-dev/better-auth'],
          '@lupinum/ginko-content': `file:${contentTarball}`,
          '@lupinum/ginko-cms': `file:${cmsTarball}`,
          '@lupinum/ginko-cms-contract': `file:${contractTarball}`,
          '@lupinum/ginko-cms-convex': `file:${convexTarball}`,
          '@lupinum/trellis': trellisDependency,
          '@lupinum/trellis-bridge': trellisBridgeDependency,
          'better-auth': workspacePackageJson.devDependencies['better-auth'],
        },
      }),
      'utf8',
    )

    writeConsumerWorkspaceConfig(tempDir, {
      '@lupinum/ginko-cms': `file:${cmsTarball}`,
      '@lupinum/ginko-cms-contract': `file:${contractTarball}`,
      '@lupinum/ginko-cms-convex': `file:${convexTarball}`,
      '@lupinum/ginko-content': `file:${contentTarball}`,
      '@lupinum/trellis': trellisDependency,
      '@lupinum/trellis-bridge': trellisBridgeDependency,
    })

    execFileSync('pnpm', ['install'], { cwd: tempDir, stdio: 'inherit' })
    execFileSync('pnpm', ['exec', 'ginko-cms', 'init'], {
      cwd: tempDir,
      stdio: 'inherit',
    })

    nuxt = await loadNuxt({
      cwd: tempDir,
      dev: false,
      ready: true,
    })
  }, 240_000)

  afterAll(async () => {
    await nuxt?.close()
    if (tempDir) {
      rmSync(tempDir, { force: true, recursive: true })
    }
  })

  it('loads the published module entrypoint and validates host-owned bridge files', () => {
    expect(nuxt).toBeDefined()
    if (!nuxt) throw new Error('Nuxt test instance was not loaded.')
    expect(nuxt.options.runtimeConfig.public.ginkoCms.route).toBe('/studio')
    expect(nuxt.options.runtimeConfig.public.content.provider).toBe('cms')
    expect(nuxt.options.runtimeConfig.public.content.providers).toMatchObject({
      cms: '@lupinum/ginko-cms/nuxt-provider',
    })
    expect(existsSync(join(tempDir, 'convex/auth.config.ts'))).toBe(true)
    const convexConfig = readFileSync(join(tempDir, 'convex/convex.config.ts'), 'utf8')
    expect(convexConfig).toContain('@convex-dev/better-auth/convex.config')
    expect(convexConfig).toContain('@lupinum/ginko-cms-convex/convex.config')
    expect(convexConfig).not.toContain('@lupinum/ginko-cms/convex/config')
    expect(convexConfig).not.toContain('@lupinum/ginko-cms/convex/better-auth')
  })
})
