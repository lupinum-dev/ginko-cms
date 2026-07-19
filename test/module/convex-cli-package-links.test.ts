import { existsSync, mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { runNodeScript } from '../../packages/cms/src/cli/convex.js'

const workspaceRoot = resolve(import.meta.dirname, '../..')
const packageRoots = {
  convex: resolve(workspaceRoot, 'node_modules/convex'),
  'better-convex-nuxt': resolve(workspaceRoot, 'node_modules/better-convex-nuxt'),
  '@lupinum/ginko-cms-convex': resolve(workspaceRoot, 'packages/convex'),
} as const

describe('Convex CLI package links', () => {
  const tempDirs: string[] = []

  afterEach(() => {
    for (const directory of tempDirs.splice(0)) {
      rmSync(directory, { force: true, recursive: true })
    }
  })

  it('preserves package-manager links that existed before the Convex process', async () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'ginko-cms-convex-links-'))
    tempDirs.push(rootDir)
    const scriptPath = join(rootDir, 'noop.cjs')
    writeFileSync(scriptPath, '', 'utf8')

    for (const [packageName, packageRoot] of Object.entries(packageRoots)) {
      const linkPath = join(rootDir, 'node_modules', packageName)
      mkdirSync(dirname(linkPath), { recursive: true })
      symlinkSync(packageRoot, linkPath, 'dir')
    }

    expect(await runNodeScript(scriptPath, [], { cwd: rootDir })).toBe(0)

    for (const packageName of Object.keys(packageRoots)) {
      expect(existsSync(join(rootDir, 'node_modules', packageName))).toBe(true)
    }
  })
})
