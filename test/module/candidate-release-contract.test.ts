import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, 'utf8')) as T

describe('coordinated CMS candidate release contract', () => {
  it('[DEV-06] has one RC tuple authority and a deterministic pack command', () => {
    const workspace = readJson<{ scripts: Record<string, string> }>('package.json')
    const compatibility = readJson<{
      releaseStack: Record<string, string>
      releaseArtifacts: Record<
        string,
        { sourceCommit: string; sha256: string; runtimeFingerprint?: string }
      >
    }>('packages/cms/compatibility.json')

    expect(workspace.scripts['candidate:pack']).toBe('node scripts/candidate-pack.mjs')
    expect(workspace.scripts['candidate:live:materialize']).toBe(
      'node scripts/live-candidate.mjs materialize',
    )
    expect(workspace.scripts['candidate:live:serve']).toBe('node scripts/live-candidate.mjs serve')
    expect(workspace.scripts['dev:pack']).toBe('node scripts/dev-pack.mjs')
    expect(workspace.scripts['package:e2e:npm']).toBe(
      'node scripts/package-e2e.mjs --candidate --package-manager npm',
    )
    expect(workspace.scripts['release:verify:candidate']).toContain('pnpm run package:e2e:npm')
    expect(compatibility.releaseStack).toMatchObject({
      '@lupinum/ginko-cms': '0.2.0-rc.1',
      '@lupinum/ginko-cms-convex': '0.2.0-rc.1',
      '@lupinum/ginko-cms-contract': '0.2.0-rc.1',
      '@lupinum/ginko-content': '0.3.0-rc.5',
      '@better-convex/mcp': '0.1.0-beta.2',
      'better-convex-nuxt': '0.8.0-beta.11',
      'better-convex-vue': '0.8.0-beta.11',
    })
    expect(
      readJson<{ consumer: { dependencies: Record<string, string> } }>(
        'packages/cms/compatibility.json',
      ).consumer.dependencies,
    ).toMatchObject({
      convex: '1.42.2',
      kysely: '0.28.17',
    })
    expect(Object.keys(compatibility.releaseArtifacts).sort()).toEqual([
      '@better-convex/mcp',
      '@lupinum/ginko-content',
      'better-convex-nuxt',
      'better-convex-vue',
    ])
    expect(compatibility.releaseArtifacts['better-convex-nuxt']?.runtimeFingerprint).toBe(
      'bcn-release-v1-87e1cd2fabca08b63545102c041456e78fbfc4b166c0df0f06b583f228c1b8df',
    )
    expect(
      readJson<{ devDependencies: Record<string, string> }>('package.json').devDependencies,
    ).toMatchObject({
      'better-auth': '1.7.0-rc.1',
      'better-convex-nuxt': '0.8.0-beta.11',
      'better-convex-vue': '0.8.0-beta.11',
      convex: '1.42.2',
      kysely: '0.28.17',
      nuxt: '4.4.8',
    })

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
    expect(source).toContain('/api/_better-convex-nuxt/release-fingerprint')
    expect(source).toContain("resolve(packDir, 'candidate-artifact.json')")
    expect(source).toContain(': resolve(packDir, recorded.tarball)')
    expect(source).toContain(
      "'@better-convex/mcp': fileDependency(installedBetterConvexMcpTarball)",
    )
    expect(source).toContain("consumerPackageManager === 'npm'")
    expect(source).toContain("npm_config_legacy_peer_deps: 'false'")
    expect(source).toContain("`    mcp: ${liveConvex ? 'true' : 'false'},`")
    expect(source).toContain('trustedClientIpHeader: process.env.BCN_AUTH_TRUSTED_CLIENT_IP_HEADER')
    expect(source).toContain("consumerExec('ginko-cms', ['deploy'])")
    expect(source).toContain("assertPnpmDependencyVersion(consumerLockfile, 'kysely', '0.28.17')")
    expect(source).toContain('npm candidate lockfile must contain only kysely@0.28.17.')
    expect(source).toContain("'ginko-cms-candidate.json.get.ts'")
    expect(source).toContain('GINKO_PACKAGE_E2E_OUTPUT')
  })

  it('accepts upstream candidate bytes only through their immutable evidence manifests', () => {
    const source = readFileSync('scripts/candidate-pack.mjs', 'utf8')

    expect(source).toContain('GINKO_CONTENT_ARTIFACT_MANIFEST')
    expect(source).toContain('BETTER_CONVEX_CANDIDATE_SET')
    expect(source).toContain('BETTER_CONVEX_MCP_ARTIFACT_MANIFEST')
    expect(source).toContain('manifest.releaseEligible !== true')
    expect(source).toContain('manifest.reproduciblePacks !== 2')
    expect(source).toContain('set.schemaVersion !== 1')
    expect(source).toContain("const expectedIds = ['vue', 'nuxt']")
    expect(source).toContain('evidence.runtimeFingerprint !== expected.runtimeFingerprint')
    expect(source).toContain('actualHash !== expected.sha256')
    expect(source).not.toContain('GINKO_CONTENT_ROOT')
    expect(source).not.toContain('BETTER_CONVEX_NUXT_ROOT')
    expect(source).not.toContain('GINKO_CONTENT_TARBALL')
    expect(source).not.toContain('BETTER_CONVEX_NUXT_TARBALL')
    expect(source).not.toContain("['rev-parse', 'HEAD'], root")
    expect(source).not.toContain('assertClean(content')
    expect(source).not.toContain('assertClean(betterConvex')
  })

  it('retains an exact candidate consumer only through the explicit live command', () => {
    const source = readFileSync('scripts/live-candidate.mjs', 'utf8')

    expect(source).toContain("GINKO_KEEP_PACKAGE_E2E: '1'")
    expect(source).toContain('GINKO_PACKAGE_E2E_OUTPUT: manifestPath')
    expect(source).toContain("relativePath.startsWith('ginko-cms-package-e2e-')")
    expect(source).toContain(
      'Materialized consumer no longer matches the exact candidate artifact.',
    )
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

  it('keeps untrusted CI read-only, pinned, and free of upstream source substitution', () => {
    const workflow = readFileSync('.github/workflows/ci.yml', 'utf8')

    expect(workflow).toContain('permissions:\n  contents: read')
    expect(workflow).toContain('actions/checkout@9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0')
    expect(workflow).toContain('actions/setup-node@820762786026740c76f36085b0efc47a31fe5020')
    expect(workflow).toContain('actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a')
    expect(workflow).toContain('persist-credentials: false')
    expect(workflow).toContain("GINKO_COREPACK_VERSION: '0.34.5'")
    expect(workflow).toContain("GINKO_NODE_VERSION: '24.18.0'")
    expect(workflow).toContain('corepack@"$GINKO_COREPACK_VERSION"')
    expect(workflow).toContain('pnpm install --frozen-lockfile')
    expect(workflow).not.toMatch(/uses:\s+\S+@v\d/u)
    expect(workflow).not.toContain('corepack@latest')
    expect(workflow).not.toContain('LUPINUM_CI_REPO_READ_TOKEN')
    expect(workflow).not.toContain('secrets.')
    expect(workflow).not.toContain('repository:')
    expect(workflow).not.toContain('candidate:pack')
    expect(workflow).not.toContain('release:verify:candidate')
    expect(workflow).not.toContain('BETTER_CONVEX_NUXT_ROOT')
    expect(workflow).not.toContain('GINKO_CONTENT_ROOT')
  })
})
