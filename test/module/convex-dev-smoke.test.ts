import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  cmsPackageRoot,
  contentPackageRoot,
  contractPackageRoot,
  convexPackageRoot,
  packPackage,
  projectRoot,
  readPackageJson,
  trellisBridgeRoot,
  trellisRoot,
} from './package-fixture'

const shouldRun = process.env.GINKO_CMS_RUN_CONVEX_DEV_SMOKE === '1'

const workspacePackageJson = readPackageJson(projectRoot)
const cmsPackageJson = readPackageJson(cmsPackageRoot)

describe.skipIf(!shouldRun)('ginko-cms real Convex discovery smoke', () => {
  let tempDir = ''

  beforeAll(() => {
    if (!process.env.CONVEX_DEPLOYMENT) {
      throw new Error(
        'GINKO_CMS_RUN_CONVEX_DEV_SMOKE=1 requires CONVEX_DEPLOYMENT for the smoke fixture.',
      )
    }
    tempDir = mkdtempSync(join(tmpdir(), 'ginko-cms-convex-dev-smoke-'))
  })

  afterAll(() => {
    if (tempDir) rmSync(tempDir, { recursive: true, force: true })
  })

  it('runs convex dev --once with betterAuth and ginkoCms mounted directly', () => {
    const contentTarball = packPackage(contentPackageRoot, tempDir)
    const contractTarball = packPackage(contractPackageRoot, tempDir)
    const convexTarball = packPackage(convexPackageRoot, tempDir)
    const cmsTarball = packPackage(cmsPackageRoot, tempDir)
    const trellisBridgeTarball = packPackage(trellisBridgeRoot, tempDir)

    writeFileSync(
      join(tempDir, 'package.json'),
      JSON.stringify({
        private: true,
        name: 'ginko-cms-convex-dev-smoke',
        type: 'module',
        dependencies: {
          '@convex-dev/better-auth': cmsPackageJson.dependencies['@convex-dev/better-auth'],
          '@lupinum/ginko-content': `file:${contentTarball}`,
          '@lupinum/ginko-cms': `file:${cmsTarball}`,
          '@lupinum/ginko-cms-convex': `file:${convexTarball}`,
          '@lupinum/trellis-bridge': `file:${trellisBridgeTarball}`,
          'better-auth': workspacePackageJson.devDependencies['better-auth'],
          nuxt: workspacePackageJson.devDependencies.nuxt,
        },
        pnpm: {
          overrides: {
            '@lupinum/ginko-cms-contract': `file:${contractTarball}`,
            '@lupinum/ginko-cms-convex': `file:${convexTarball}`,
            '@lupinum/trellis-bridge': `file:${trellisBridgeTarball}`,
            '@lupinum/trellis': `file:${trellisRoot}`,
          },
        },
      }),
      'utf8',
    )
    writeFileSync(
      join(tempDir, 'nuxt.config.ts'),
      "export default defineNuxtConfig({ modules: ['@lupinum/ginko-cms'] })\n",
    )
    writeFileSync(
      join(tempDir, '.env.local'),
      `CONVEX_DEPLOYMENT=${process.env.CONVEX_DEPLOYMENT}\n`,
    )

    execFileSync('pnpm', ['install', '--force'], { cwd: tempDir, stdio: 'inherit' })
    execFileSync('pnpm', ['exec', 'ginko-cms', 'init'], { cwd: tempDir, stdio: 'inherit' })
    execFileSync(
      'pnpm',
      ['exec', 'convex', 'dev', '--once', '--typecheck', 'disable', '--tail-logs', 'disable'],
      { cwd: tempDir, stdio: 'inherit' },
    )

    const convexConfig = readFileSync(join(tempDir, 'convex/convex.config.ts'), 'utf8')
    expect(convexConfig).toContain('@convex-dev/better-auth/convex.config')
    expect(convexConfig).toContain('@lupinum/ginko-cms-convex/convex.config')
  })
})
