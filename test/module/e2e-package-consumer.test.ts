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
const pnpmBin = process.env.npm_execpath ?? 'pnpm'
const fixtureEnv = {
  ...process.env,
  npm_config_dangerously_allow_all_builds: 'true',
  npm_config_verify_deps_before_run: 'false',
}
const compatibilityMatrix = JSON.parse(
  readFileSync(join(projectRoot, 'packages/cms/compatibility.json'), 'utf8'),
) as CompatibilityMatrix
const betterConvexNuxtDependency = compatibilityMatrix.releaseStack?.['better-convex-nuxt']

if (!contentDependency) {
  throw new Error('Missing @lupinum/ginko-content peer dependency in @lupinum/ginko-cms.')
}
if (!betterConvexNuxtDependency) {
  throw new Error(
    'Missing better-convex-nuxt release stack dependency in packages/cms/compatibility.json.',
  )
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
    'strictPeerDependencies: true',
    'allowBuilds:',
    "  '@parcel/watcher': true",
    '  better-sqlite3: true',
    '  cbor-extract: true',
    '  esbuild: true',
    '  unrs-resolver: true',
    '  vue-demi: true',
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
        `  content: {`,
        `    search: { engine: 'provider' },`,
        `  },`,
        `})`,
      ].join('\n'),
      'utf8',
    )

    writeFileSync(
      join(tempDir, 'content.config.ts'),
      [
        `import { defineCollection, defineContentConfig } from '@lupinum/ginko-content/config'`,
        ``,
        `const pages = defineCollection({`,
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
          '@lupinum/ginko-content': `file:${contentTarball}`,
          '@lupinum/ginko-cms': `file:${cmsTarball}`,
          '@lupinum/ginko-cms-contract': `file:${contractTarball}`,
          '@lupinum/ginko-cms-convex': `file:${convexTarball}`,
          'better-auth': workspacePackageJson.devDependencies['better-auth'],
          'better-convex-nuxt': betterConvexNuxtDependency,
          kysely: workspacePackageJson.devDependencies.kysely,
        },
      }),
      'utf8',
    )

    writeConsumerWorkspaceConfig(tempDir, {
      '@lupinum/ginko-cms': `file:${cmsTarball}`,
      '@lupinum/ginko-cms-contract': `file:${contractTarball}`,
      '@lupinum/ginko-cms-convex': `file:${convexTarball}`,
      '@lupinum/ginko-content': `file:${contentTarball}`,
      'better-convex-nuxt': betterConvexNuxtDependency,
      kysely: workspacePackageJson.devDependencies.kysely,
    })

    execFileSync(pnpmBin, ['install'], { cwd: tempDir, env: fixtureEnv, stdio: 'inherit' })
    execFileSync(pnpmBin, ['exec', 'ginko-cms', 'init'], {
      cwd: tempDir,
      env: fixtureEnv,
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

  it('[DEV-01] loads the published module entrypoint and validates host-owned setup files', () => {
    expect(nuxt).toBeDefined()
    if (!nuxt) throw new Error('Nuxt test instance was not loaded.')
    expect(nuxt.options.runtimeConfig.public.ginkoCms.route).toBe('/studio')
    expect(nuxt.options.runtimeConfig.public.ginkoCms.studio).toMatchObject({
      assetBase: expect.stringMatching(/^\/_ginko-cms-studio\/[a-f0-9]{12}$/),
      devServer: null,
    })
    expect(nuxt.options.runtimeConfig.public.content.provider).toBe('cms')
    expect(nuxt.options.runtimeConfig.public.content.providers).toMatchObject({
      cms: '@lupinum/ginko-cms/nuxt-provider',
    })
    expect(existsSync(join(tempDir, 'convex/auth.config.ts'))).toBe(true)
    expect(existsSync(join(tempDir, 'convex', 'ginkoCms', 'collections.ts'))).toBe(true)
    expect(existsSync(join(tempDir, 'convex', 'ginkoCms', 'mcpOAuthDelegations.ts'))).toBe(true)
    expect(existsSync(join(tempDir, 'convex', 'ginkoCms', 'mcp.ts'))).toBe(false)
    expect(existsSync(join(tempDir, 'convex', 'ginkoCms', 'mcpOperations.ts'))).toBe(false)
    expect(readFileSync(join(tempDir, 'convex/http.ts'), 'utf8')).not.toContain('/mcp')
    expect(existsSync(join(tempDir, 'convex', 'ginkoCms.ts'))).toBe(false)
    expect(existsSync(join(tempDir, 'convex', `ginkoCms${'Mcp.ts'}`))).toBe(false)
    const convexConfig = readFileSync(join(tempDir, 'convex/convex.config.ts'), 'utf8')
    expect(convexConfig).toContain('better-convex-nuxt/convex-auth/convex.config')
    expect(convexConfig).not.toContain('./betterAuth/convex.config')
    expect(convexConfig).toContain('@lupinum/ginko-cms-convex/convex.config')
    expect(existsSync(join(tempDir, 'convex/betterAuth'))).toBe(false)
    expect(convexConfig).not.toContain('@lupinum/ginko-cms/convex/config')
    expect(convexConfig).not.toContain('@lupinum/ginko-cms/convex/better-auth')
  })
})
