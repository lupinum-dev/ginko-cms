import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, 'utf8')) as T

describe('coordinated CMS candidate release contract', () => {
  it('[DEV-06] has one RC tuple authority and a deterministic pack command', () => {
    const workspace = readJson<{ scripts: Record<string, string> }>('package.json')
    const compatibility = readJson<{
      releaseStack: Record<string, string>
      releaseArtifacts: Record<string, { sourceCommit: string; sha256: string }>
    }>('packages/cms/compatibility.json')

    expect(workspace.scripts['candidate:pack']).toBe('node scripts/candidate-pack.mjs')
    expect(workspace.scripts['dev:pack']).toBe('node scripts/dev-pack.mjs')
    expect(workspace.scripts['package:e2e:npm']).toBe(
      'node scripts/package-e2e.mjs --candidate --package-manager npm',
    )
    expect(workspace.scripts['release:verify:candidate']).toContain('pnpm run package:e2e:npm')
    expect(compatibility.releaseStack).toMatchObject({
      '@lupinum/ginko-cms': '0.2.0-rc.1',
      '@lupinum/ginko-cms-convex': '0.2.0-rc.1',
      '@lupinum/ginko-cms-contract': '0.2.0-rc.1',
      '@lupinum/ginko-content': '0.3.0-rc.1',
      'better-convex-nuxt': '0.6.1',
    })
    expect(
      readJson<{ consumer: { dependencies: Record<string, string> } }>(
        'packages/cms/compatibility.json',
      ).consumer.dependencies.convex,
    ).toBe('1.42.1')
    expect(Object.keys(compatibility.releaseArtifacts).sort()).toEqual([
      '@lupinum/ginko-content',
      'better-convex-nuxt',
    ])

    for (const path of [
      'packages/cms/package.json',
      'packages/contract/package.json',
      'packages/convex/package.json',
    ]) {
      expect(readJson<{ version: string }>(path).version).toBe('0.2.0-rc.1')
    }
  })

  it('keeps dirty development artifacts immutable and separate from candidates', () => {
    const source = readFileSync('scripts/dev-pack.mjs', 'utf8')

    expect(source).toContain("'.pack/dev'")
    expect(source).toContain('ginko-cms-development-artifact')
    expect(source).toContain('worktreeDirty')
    expect(source).toContain('Development artifact already exists')
    expect(source).not.toContain('compatibility.json')
    expect(source).not.toContain('release-evidence')
  })

  it('takes candidate hashes only from compatibility', () => {
    const source = readFileSync('scripts/package-e2e.mjs', 'utf8')

    expect(source).not.toContain('GINKO_CONTENT_SHA256')
    expect(source).not.toContain('BETTER_CONVEX_NUXT_SHA256')
    expect(source).toContain('compatibilityMatrix.releaseArtifacts')
    expect(source).toContain("consumerPackageManager === 'npm'")
    expect(source).toContain("npm_config_legacy_peer_deps: 'false'")
    expect(source).toContain("'    mcp: false,'")
  })

  it('keeps committed workspace resolution machine-independent', () => {
    const workspace = readFileSync('pnpm-workspace.yaml', 'utf8')
    const lockfile = readFileSync('pnpm-lock.yaml', 'utf8')

    expect(workspace).not.toMatch(/(?:@lupinum\/ginko-content|better-convex-nuxt): file:/)
    expect(lockfile).not.toMatch(/(?:ginko-content|better-convex-nuxt)@file:/)
    expect(lockfile).not.toContain('127.0.0.1')
    expect(lockfile).not.toContain('.pack/')
    expect(() => readFileSync('.npmrc', 'utf8')).toThrow()
  })

  it('keeps CI on immutable compatibility commits without legacy sibling setup', () => {
    const workflow = readFileSync('.github/workflows/ci.yml', 'utf8')

    expect(workflow).not.toContain('lupinum-dev/trellis')
    expect(workflow).not.toContain('TRELLIS_CI_REF')
    expect(workflow).not.toContain('GINKO_CONTENT_CI_REF')
    expect(workflow).not.toContain('--lockfile-only')
    expect(workflow).toContain('steps.compatibility.outputs.content_commit')
    expect(workflow).toContain('steps.compatibility.outputs.better_convex_nuxt_commit')
    expect(workflow).toContain('pnpm run candidate:pack')
    expect(workflow).toContain('pnpm run release:verify:candidate')
  })
})
