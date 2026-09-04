import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import {
  buildResolvedContentContract,
  hashCanonicalJson,
} from '@lupinum/ginko-content/cms-contract'
import type { JsonValue } from '@lupinum/ginko-content/cms-contract'
import { defineCollection } from '@lupinum/ginko-content/config'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { ConvexClientFactory } from '../../packages/cms/src/cli/args.js'
import { runGinkoCmsCli } from '../../packages/cms/src/cli/ginko-cms.js'
import { loadContentConfig } from '../../packages/cms/src/cli/push.js'
import { loadGinkoContentContract } from '../../packages/cms/src/module/content-contract.js'
import { writeExpectedContractBinding } from '../../packages/cms/src/module/convex.js'

const temporaryDirectories: string[] = []

afterEach(() => {
  vi.unstubAllGlobals()
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

function output() {
  let value = ''
  return {
    stream: { write: (chunk: string | Uint8Array) => void (value += String(chunk)) },
    read: () => value,
  }
}

async function run(root: string, args: string[], convexClientFactory?: ConvexClientFactory) {
  const stdout = output()
  const stderr = output()
  const code = await runGinkoCmsCli(args, {
    cwd: root,
    io: { stdout: stdout.stream, stderr: stderr.stream },
    convexClientFactory,
  })
  return { code, stdout: stdout.read(), stderr: stderr.read() }
}

function createRoot() {
  const root = mkdtempSync(join(tmpdir(), 'ginko-cms-doctor-'))
  temporaryDirectories.push(root)
  return root
}

async function completeFixture(
  options: {
    provider?: string | null
    bindContract?: boolean
  } = {},
) {
  const root = createRoot()
  expect((await run(root, ['init'])).code).toBe(0)
  const provider = options.provider === null ? '' : `provider: '${options.provider ?? 'cms'}',`
  writeFileSync(
    resolve(root, 'content.config.ts'),
    `export default { ${provider} collections: { pages: { type: 'page', source: 'content/pages/**/*.md', route: '/' } } }\n`,
    'utf8',
  )
  writeFileSync(resolve(root, 'nuxt.config.ts'), 'export default {}\n', 'utf8')
  mkdirSync(resolve(root, '.ginko'), { recursive: true })
  writeFileSync(
    resolve(root, '.ginko/content-contract.json'),
    `${JSON.stringify(
      buildResolvedContentContract(
        {
          collections: {
            pages: defineCollection({
              type: 'page',
              source: 'content/pages/**/*.md',
              route: '/',
            }),
          },
        },
        { defaultLocale: 'en', locales: ['en'] },
      ),
    )}\n`,
    'utf8',
  )
  if (options.bindContract !== false) {
    const config = await loadContentConfig(root)
    const contract = await loadGinkoContentContract({ rootDir: root })
    writeExpectedContractBinding(root, {
      contentHash: await hashCanonicalJson(contract as unknown as JsonValue),
      presentationHash: await hashCanonicalJson(config.presentation),
    })
  }
  writeFileSync(
    resolve(root, '.env.local'),
    [
      'CONVEX_URL=https://doctor-test.convex.cloud',
      'CONVEX_SITE_URL=https://doctor-test.convex.site',
      'SITE_URL=https://doctor-host.example.test',
      'GINKO_CMS_SESSION_COOKIE=better-auth.session_token=owner-cookie-value',
      '',
    ].join('\n'),
    'utf8',
  )
  return root
}

describe('ginko-cms setup doctor', () => {
  it('[ADM-07] accepts a local candidate tarball when its installed version is supported', async () => {
    const root = await completeFixture()
    const packageJsonPath = resolve(root, 'package.json')
    const packageJson = {
      dependencies: {
        '@lupinum/ginko-cms-convex': '0.2.0-rc.2',
        'better-auth': '1.7.2',
        '@lupinum/better-convex-nuxt': 'file:./@lupinum/better-convex-nuxt.tgz',
      },
    }
    writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`, 'utf8')
    const installedPackageRoot = resolve(root, 'node_modules/@lupinum/better-convex-nuxt')
    mkdirSync(installedPackageRoot, { recursive: true })
    writeFileSync(
      resolve(installedPackageRoot, 'package.json'),
      JSON.stringify({ name: '@lupinum/better-convex-nuxt', version: '1.0.0-beta.3' }),
      'utf8',
    )

    const result = await run(root, ['doctor'])

    expect(result.stderr).not.toContain('unsupported dependency @lupinum/better-convex-nuxt')
    expect(result.stderr).not.toContain('outside the supported Ginko CMS compatibility tuple')
  })

  it('[ADM-07] names missing Convex, auth, contract, provider, and environment setup with safe exact fixes', async () => {
    const root = createRoot()
    const result = await run(root, ['doctor'])

    expect(result.code).toBe(1)
    expect(result.stderr).toContain('convex/convex.config.ts is missing')
    expect(result.stderr).toContain('convex/auth.config.ts is missing')
    expect(result.stderr).toContain('content.config.ts is missing')
    expect(result.stderr).toContain('CONVEX_URL or NUXT_PUBLIC_CONVEX_URL is required')
    expect(result.stderr).toContain('Fix: Run pnpm exec ginko-cms init')
    expect(result.stderr).toContain("`provider: 'cms'`")
    expect(result.stderr).toContain('`pnpm exec ginko-cms deploy`')
    expect(result.stderr).not.toMatch(/stack|trellis|release:publish|npm publish/iu)
  })

  it('[ADM-07] distinguishes missing auth configuration without requiring Convex secrets in Nuxt', async () => {
    const root = await completeFixture()
    rmSync(resolve(root, 'convex/auth.config.ts'))

    const result = await run(root, ['doctor'])

    expect(result.code).toBe(1)
    expect(result.stderr).toContain('convex/auth.config.ts is missing')
    expect(result.stderr).toContain('Run pnpm exec ginko-cms init')
    expect(result.stderr).not.toContain('owner-cookie-value')
  })

  it('[ADM-07] reports stale generated templates separately from stale canonical contract hashes', async () => {
    const root = await completeFixture()
    const relativePath = 'convex/auth.ts'
    const oldTemplate = '// previous generated auth template\n'
    const manifestPath = resolve(root, 'convex/.ginko-cms-setup.json')
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    manifest.files[relativePath].templateHash = createHash('sha256')
      .update(oldTemplate)
      .digest('hex')
    writeFileSync(resolve(root, relativePath), oldTemplate, 'utf8')
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
    writeExpectedContractBinding(root, {
      contentHash: '0'.repeat(64),
      presentationHash: '1'.repeat(64),
    })

    const result = await run(root, ['doctor'])

    expect(result.code).toBe(1)
    expect(result.stderr).toContain(
      'convex/auth.ts is an untouched generated file with a newer package template available',
    )
    expect(result.stderr).toContain('Run pnpm exec ginko-cms init to update the generated file')
    expect(result.stderr).toContain(
      'convex/ginkoCms/contractBinding.ts does not match the generated Content artifact and Nuxt presentation config',
    )
    expect(result.stderr).toContain('Run `pnpm exec ginko-cms deploy`')
  })

  it('[ADM-07] diagnoses missing CMS provider setup without mislabeling contract or backend state', async () => {
    const root = await completeFixture({ provider: null })
    const result = await run(root, ['doctor'])

    expect(result.code).toBe(1)
    expect(result.stderr).toContain(
      'content.config.ts does not select the Ginko CMS content provider',
    )
    expect(result.stderr).toContain("Set `provider: 'cms'` in content.config.ts")
    expect(result.stderr).not.toContain('backend could not be reached')
    expect(result.stderr).not.toContain('contractBinding.ts does not match')
  })

  it('[ADM-07] turns backend and stale-deployment failures into redacted diagnoses with retry commands', async () => {
    const root = await completeFixture()
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ token: 'operator-token-value' }), {
            headers: { 'content-type': 'application/json' },
          }),
      ),
    )
    const unreachable = await run(
      root,
      ['doctor', '--deployment'],
      () =>
        ({
          setAuth: () => undefined,
          query: async () => {
            throw new Error('ECONNREFUSED owner-cookie-value')
          },
        }) as never,
    )

    expect(unreachable.code).toBe(1)
    expect(unreachable.stderr).toContain('configured Convex or Ginko CMS host could not be reached')
    expect(unreachable.stderr).toContain('`pnpm exec ginko-cms doctor --deployment`')
    expect(unreachable.stderr).not.toContain('owner-cookie-value')
    expect(unreachable.stderr).not.toContain('ECONNREFUSED')
    expect(unreachable.stderr).not.toContain('Usage:')

    const stale = await run(
      root,
      ['doctor', '--deployment'],
      () =>
        ({
          setAuth: () => undefined,
          query: async () => {
            throw new Error('Could not find public function ginkoCms/maintenance:list')
          },
        }) as never,
    )
    expect(stale.code).toBe(1)
    expect(stale.stderr).toContain(
      'deployment is reachable but does not expose the current CMS diagnosis functions',
    )
    expect(stale.stderr).toContain('Run `pnpm exec ginko-cms deploy`')
  })

  it('[ADM-07] distinguishes expired owner authentication from backend reachability without echoing the cookie', async () => {
    const root = await completeFixture()
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ message: 'expired owner-cookie-value' }), {
            status: 401,
            headers: { 'content-type': 'application/json' },
          }),
      ),
    )
    const result = await run(
      root,
      ['doctor', '--deployment'],
      () =>
        ({
          setAuth: () => undefined,
          query: async () => {
            throw new Error('query must not run after failed token exchange')
          },
        }) as never,
    )

    expect(result.code).toBe(1)
    expect(result.stderr).toContain(
      'deployment is reachable, but the configured owner session could not authenticate',
    )
    expect(result.stderr).toContain('replace GINKO_CMS_SESSION_COOKIE in the invoking shell')
    expect(result.stderr).not.toContain('owner-cookie-value')
    expect(result.stderr).not.toContain('expired')
  })
})
