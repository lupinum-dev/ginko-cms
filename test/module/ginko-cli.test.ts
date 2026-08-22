import { createHash } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import {
  buildResolvedContentContract,
  hashCanonicalJson,
} from '@lupinum/ginko-content/cms-contract'
import type { JsonValue } from '@lupinum/ginko-content/cms-contract'
import { defineCollection } from '@lupinum/ginko-content/config'
import { afterEach, describe, expect, it } from 'vitest'

import { runGinkoCmsCli } from '../../packages/cms/src/cli/ginko-cms.js'
import { loadContentConfig } from '../../packages/cms/src/cli/push.js'
import { loadGinkoContentContract } from '../../packages/cms/src/module/content-contract.js'
import { writeExpectedContractBinding } from '../../packages/cms/src/module/convex.js'

const removedLegacyArg = ['_trellis', 'Forwarding'].join('')

function createOutput() {
  let value = ''
  return {
    stream: {
      write(chunk: string | Uint8Array) {
        value += String(chunk)
        return true
      },
    },
    read: () => value,
  }
}

function writeContentConfig(rootDir: string, collection: string, pathPrefix: string) {
  writeFileSync(
    resolve(rootDir, 'content.config.ts'),
    `export default { provider: 'cms', collections: { ${collection}: { type: 'page', source: 'content/${collection}/**/*.md', route: '${pathPrefix}' } } }\n`,
    'utf8',
  )
  mkdirSync(resolve(rootDir, '.ginko'), { recursive: true })
  const contract = buildResolvedContentContract(
    {
      collections: {
        [collection]: defineCollection({
          type: 'page',
          source: `content/${collection}/**/*.md`,
          route: pathPrefix,
        }),
      },
    },
    { defaultLocale: 'en', locales: ['en'] },
  )
  writeFileSync(
    resolve(rootDir, '.ginko/content-contract.json'),
    `${JSON.stringify(contract)}\n`,
    'utf8',
  )
}

async function bindContractForTest(rootDir: string) {
  const config = await loadContentConfig(rootDir)
  const content = await loadGinkoContentContract({ rootDir })
  const binding = {
    contentHash: await hashCanonicalJson(content as unknown as JsonValue),
    presentationHash: await hashCanonicalJson(config.presentation),
  }
  writeExpectedContractBinding(rootDir, binding)
  return binding
}

async function prepareDoctorFixture(rootDir: string, extraEnvironment = '') {
  writeContentConfig(rootDir, 'pages', '/')
  await bindContractForTest(rootDir)
  writeFileSync(
    resolve(rootDir, '.env.local'),
    `CONVEX_URL=https://example.convex.cloud\n${extraEnvironment}`,
    'utf8',
  )
}

function readGeneratedContractBinding(rootDir: string) {
  const source = readFileSync(resolve(rootDir, 'convex/ginkoCms/contractBinding.ts'), 'utf8')
  return {
    contentHash: source.match(/EXPECTED_CONTENT_HASH = '([a-f0-9]{64})'/u)?.[1],
    presentationHash: source.match(/PRESENTATION_HASH = '([a-f0-9]{64})'/u)?.[1],
  }
}

async function runCli(args: string[], cwd: string) {
  const stdout = createOutput()
  const stderr = createOutput()
  const code = await runGinkoCmsCli(args, {
    cwd,
    io: {
      stdout: stdout.stream,
      stderr: stderr.stream,
    },
  })
  return {
    code,
    stdout: stdout.read(),
    stderr: stderr.read(),
  }
}

describe('ginko-cms CLI', () => {
  const tempDirs: string[] = []
  const staleMcpBridgeFile = ['convex', `ginkoCms${'Mcp.ts'}`].join('/')

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { force: true, recursive: true })
    }
  })

  it('runs init and checks the direct Convex setup without package arguments', async () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'ginko-cms-cli-'))
    tempDirs.push(rootDir)

    const init = await runCli(['init'], rootDir)
    expect(init.code).toBe(0)
    expect(init.stdout).toContain('Ginko CMS initialized')
    expect(init.stdout).toContain('Next: run `pnpm exec ginko-cms doctor`')
    expect(init.stdout).toContain('configure the required environment')
    expect(init.stdout).toContain('Set versioned `BETTER_AUTH_SECRETS`')
    expect(init.stdout).toContain('run `pnpm exec ginko-cms deploy`')
    expect(init.stdout).toContain("pnpm exec better-convex convex run auth:rotateSigningKey '{}'")
    expect(init.stdout).toContain(
      'Host apps must depend directly on `@lupinum/better-convex-nuxt`, `better-auth`, and `@lupinum/ginko-cms-convex`.',
    )
    expect(init.stdout).toContain('MCP is disabled')
    expect(init.stdout).toContain(
      'pnpm exec convex env set GINKO_FIRST_OWNER_EMAIL you@example.com',
    )
    const convexConfig = readFileSync(resolve(rootDir, 'convex/convex.config.ts'), 'utf8')
    expect(convexConfig).toContain('@lupinum/better-convex-nuxt/better-auth/convex.config')
    expect(convexConfig).toContain('@lupinum/ginko-cms-convex/convex.config')
    expect(existsSync(resolve(rootDir, 'convex/betterAuth/schema.ts'))).toBe(false)
    const setupManifest = JSON.parse(
      readFileSync(resolve(rootDir, 'convex/.ginko-cms-setup.json'), 'utf8'),
    )
    expect(setupManifest).toMatchObject({
      schemaVersion: 1,
      generatedBy: '@lupinum/ginko-cms',
      mcp: false,
      files: {
        'convex/convex.config.ts': { templateHash: expect.stringMatching(/^[a-f0-9]{64}$/) },
      },
    })
    expect(convexConfig).not.toContain('@lupinum/ginko-cms/convex/better-auth')
    expect(convexConfig).not.toContain('@lupinum/ginko-cms/convex/config')
    expect(readFileSync(resolve(rootDir, 'convex/schema.ts'), 'utf8')).toContain('defineSchema({})')
    expect(readFileSync(resolve(rootDir, 'convex/http.ts'), 'utf8')).toContain('registerRoutes')
    expect(existsSync(resolve(rootDir, 'convex/ginkoCms/collections.ts'))).toBe(true)
    expect(existsSync(resolve(rootDir, 'convex/ginkoCms/contract.ts'))).toBe(true)
    expect(existsSync(resolve(rootDir, 'convex/ginkoCms/contractTransitions.ts'))).toBe(true)
    const contractBinding = readFileSync(
      resolve(rootDir, 'convex/ginkoCms/contractBinding.ts'),
      'utf8',
    )
    expect(contractBinding).toContain("EXPECTED_CONTENT_HASH = 'unbound'")
    expect(contractBinding).toContain('getExpectedCmsContractBinding')
    expect(readFileSync(resolve(rootDir, 'convex/ginkoCms/editor.ts'), 'utf8')).toContain(
      'bindExpectedCmsContract(args)',
    )
    expect(readFileSync(resolve(rootDir, 'convex/http.ts'), 'utf8')).not.toContain('/mcp')
    expect(existsSync(resolve(rootDir, 'convex/ginkoCms/maintenance.ts'))).toBe(true)
    expect(existsSync(resolve(rootDir, 'convex/ginkoCms/migrations.ts'))).toBe(false)
    expect(existsSync(resolve(rootDir, 'convex/ginkoCms/policy.ts'))).toBe(false)
    expect(existsSync(resolve(rootDir, 'convex/ginkoCms/mcpOAuthDelegations.ts'))).toBe(true)
    expect(existsSync(resolve(rootDir, 'convex/ginkoCms/mcp.ts'))).toBe(false)
    expect(existsSync(resolve(rootDir, 'convex/ginkoCms/mcpOperations.ts'))).toBe(false)
    expect(existsSync(resolve(rootDir, 'convex/ginkoCms/mcpKeys.ts'))).toBe(false)
    expect(existsSync(resolve(rootDir, staleMcpBridgeFile))).toBe(false)

    await prepareDoctorFixture(rootDir)
    const check = await runCli(['doctor'], rootDir)
    expect(check.code).toBe(0)
    expect(check.stdout).toContain('Ginko CMS doctor passed')
  })

  it('generates exactly one Convex-native MCP route only when explicitly enabled', async () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'ginko-cms-cli-mcp-'))
    tempDirs.push(rootDir)

    const init = await runCli(['init', '--mcp'], rootDir)
    expect(init.code).toBe(0)
    expect(init.stdout).toContain('provider-neutral MCP endpoint at `/mcp`')

    const http = readFileSync(resolve(rootDir, 'convex/http.ts'), 'utf8')
    expect(http.match(/path: '[\\/]mcp'/gu)).toHaveLength(3)
    expect(http.match(/path: '\/\.well-known\/oauth-protected-resource\/mcp'/gu)).toHaveLength(2)
    expect(http).toContain("method: 'OPTIONS'")
    expect(http).not.toContain("method: 'HEAD'")
    expect(http).not.toContain('/mcp-pilot')
    expect(http).not.toContain('/mcp/code')
    expect(existsSync(resolve(rootDir, 'convex/ginkoCms/mcp.ts'))).toBe(true)
    const mcp = readFileSync(resolve(rootDir, 'convex/ginkoCms/mcp.ts'), 'utf8')
    expect(mcp).toContain('handleGinkoMcpRequest(request, {')
    expect(mcp).toContain('auth.authComponent.validateOAuthAccess(ctx, access)')
    expect(mcp).not.toContain('adapter.findOne')
    expect(mcp).not.toContain('validateLiveProviderAccess')
    expect(existsSync(resolve(rootDir, 'convex/ginkoCms/mcpOperations.ts'))).toBe(true)
    expect(existsSync(resolve(rootDir, 'convex/ginkoCms/mcpOAuthDelegations.ts'))).toBe(true)
    expect(existsSync(resolve(rootDir, 'convex/ginkoCms/mcpCaller.ts'))).toBe(false)

    const manifest = JSON.parse(
      readFileSync(resolve(rootDir, 'convex/.ginko-cms-setup.json'), 'utf8'),
    )
    expect(manifest.mcp).toBe(true)

    const disable = await runCli(['init'], rootDir)
    expect(disable.code).toBe(0)
    expect(readFileSync(resolve(rootDir, 'convex/http.ts'), 'utf8')).not.toContain('/mcp')
    expect(existsSync(resolve(rootDir, 'convex/ginkoCms/mcp.ts'))).toBe(false)
    expect(existsSync(resolve(rootDir, 'convex/ginkoCms/mcpOperations.ts'))).toBe(false)
    expect(existsSync(resolve(rootDir, 'convex/ginkoCms/mcpOAuthDelegations.ts'))).toBe(true)
  })

  it('updates an untouched generated setup file when its recorded template changes', async () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'ginko-cms-cli-template-update-'))
    tempDirs.push(rootDir)
    await runCli(['init'], rootDir)

    const relativePath = 'convex/auth.ts'
    const target = resolve(rootDir, relativePath)
    const expected = readFileSync(target, 'utf8')
    const oldTemplate = '// previous generated auth template\n'
    const manifestPath = resolve(rootDir, 'convex/.ginko-cms-setup.json')
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    manifest.files[relativePath].templateHash = createHash('sha256')
      .update(oldTemplate)
      .digest('hex')
    writeFileSync(target, oldTemplate, 'utf8')
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')

    const update = await runCli(['init'], rootDir)

    expect(update.code).toBe(0)
    expect(update.stdout).toContain('1 untouched generated file(s) updated')
    expect(readFileSync(target, 'utf8')).toBe(expected)
  })

  it('shows a safe diff and refuses to overwrite a modified generated setup file', async () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'ginko-cms-cli-template-conflict-'))
    tempDirs.push(rootDir)
    await runCli(['init'], rootDir)

    const relativePath = 'convex/auth.ts'
    const target = resolve(rootDir, relativePath)
    const oldTemplate = '// previous generated auth template\n'
    const userModified = "const API_TOKEN = 'super-secret-local-value'\n"
    const manifestPath = resolve(rootDir, 'convex/.ginko-cms-setup.json')
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    manifest.files[relativePath].templateHash = createHash('sha256')
      .update(oldTemplate)
      .digest('hex')
    writeFileSync(target, userModified, 'utf8')
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')

    const update = await runCli(['init'], rootDir)

    expect(update.code).toBe(1)
    expect(readFileSync(target, 'utf8')).toBe(userModified)
    expect(update.stderr).toContain(`Refused to overwrite modified generated file ${relativePath}`)
    expect(update.stderr).toContain(`--- host/${relativePath}`)
    expect(update.stderr).toContain(`+++ package/${relativePath}`)
    expect(update.stderr).toContain('[user-modified line hidden to avoid leaking local values]')
    expect(update.stderr).not.toContain('super-secret-local-value')
  })

  it('refuses to overwrite a manually edited generated contract binding', async () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'ginko-cms-cli-binding-conflict-'))
    tempDirs.push(rootDir)
    await runCli(['init'], rootDir)
    writeContentConfig(rootDir, 'posts', '/posts')
    const bindingPath = resolve(rootDir, 'convex/ginkoCms/contractBinding.ts')
    writeFileSync(bindingPath, `${readFileSync(bindingPath, 'utf8')}\n// host edit\n`, 'utf8')

    await expect(bindContractForTest(rootDir)).rejects.toThrow(
      'Refused to overwrite modified generated file convex/ginkoCms/contractBinding.ts',
    )
  })

  it('does not require Convex-only Better Auth secrets in the Nuxt environment', async () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'ginko-cms-cli-secret-'))
    tempDirs.push(rootDir)
    await runCli(['init'], rootDir)
    writeContentConfig(rootDir, 'pages', '/')
    await bindContractForTest(rootDir)
    writeFileSync(resolve(rootDir, '.env.local'), 'CONVEX_URL=https://example.convex.cloud\n')

    const check = await runCli(['doctor'], rootDir)

    expect(check.code).toBe(0)
  })

  it('rejects the removed setup alias with init guidance', async () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'ginko-cms-cli-setup-removed-'))
    tempDirs.push(rootDir)

    const setup = await runCli(['setup'], rootDir)

    expect(setup.code).toBe(2)
    expect(setup.stderr).toContain('`ginko-cms setup` was removed')
    expect(setup.stderr).toContain('pnpm exec ginko-cms init')
  })

  it('proxies the bundled Convex CLI through the Ginko CMS facade', async () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'ginko-cms-cli-convex-'))
    tempDirs.push(rootDir)
    const calls: Array<{ command: string; args: string[]; cwd: string }> = []
    const stdout = createOutput()
    const stderr = createOutput()

    const code = await runGinkoCmsCli(['convex', 'dev', '--once'], {
      cwd: rootDir,
      io: {
        stdout: stdout.stream,
        stderr: stderr.stream,
      },
      runner: async (command, args, options) => {
        calls.push({ command, args, cwd: options.cwd })
        return 0
      },
    })

    expect(code).toBe(0)
    expect(calls).toHaveLength(1)
    expect(calls[0]?.command).toContain('/convex/')
    expect(calls[0]?.args).toEqual(['dev', '--once'])
    expect(calls[0]?.cwd).toBe(rootDir)
  })

  it('deploys Convex before pushing collection contracts', async () => {
    const previousDeployKey = process.env.CONVEX_DEPLOY_KEY
    delete process.env.CONVEX_DEPLOY_KEY
    const rootDir = mkdtempSync(join(tmpdir(), 'ginko-cms-cli-deploy-'))
    tempDirs.push(rootDir)

    await runCli(['init'], rootDir)
    writeFileSync(
      resolve(rootDir, '.env.local'),
      ['CONVEX_URL=https://example.convex.cloud', 'CONVEX_DEPLOY_KEY=deploy-key-test', ''].join(
        '\n',
      ),
      'utf8',
    )
    writeContentConfig(rootDir, 'pages', '/')
    const calls: Array<{
      kind: string
      args?: string[] | Record<string, unknown>
      token?: string
    }> = []
    const stdout = createOutput()
    const stderr = createOutput()

    try {
      const code = await runGinkoCmsCli(['deploy'], {
        cwd: rootDir,
        io: {
          stdout: stdout.stream,
          stderr: stderr.stream,
        },
        runner: async (_command, args) => {
          calls.push({ kind: 'convex', args })
          return 0
        },
        convexClientFactory: () =>
          ({
            setAdminAuth: (token: string) => calls.push({ kind: 'auth', token }),
            mutation: async (_ref, args) => {
              calls.push({ kind: 'mutation', args: args as Record<string, unknown> })
              return { created: 1, updated: 0, skipped: 0, missingFromConfig: [] }
            },
            query: async () => {
              calls.push({ kind: 'query' })
              return readGeneratedContractBinding(rootDir)
            },
            action: async () => {
              throw new Error('deploy should not use public action')
            },
          }) as never,
      })

      expect(code).toBe(0)
      expect(stderr.read()).toBe('')
      expect(stdout.read()).toContain('Ginko CMS contract installed')
      expect(calls.map((call) => call.kind)).toEqual(['convex', 'auth', 'query', 'mutation'])
      expect(calls[0]?.args).toEqual([
        'dev',
        '--once',
        '--tail-logs',
        'disable',
        '--typecheck',
        'disable',
      ])
      expect(calls[1]).toEqual({ kind: 'auth', token: 'deploy-key-test' })
      expect(readGeneratedContractBinding(rootDir)).toEqual({
        contentHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        presentationHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      })
      expect(calls[3]?.args).toMatchObject({
        content: { collections: { pages: expect.objectContaining({ id: 'pages' }) } },
        contentHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        presentation: { collections: {} },
        presentationHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      })
    } finally {
      if (previousDeployKey === undefined) {
        delete process.env.CONVEX_DEPLOY_KEY
      } else {
        process.env.CONVEX_DEPLOY_KEY = previousDeployKey
      }
    }
  })

  it('checks deploy prerequisites without running Convex deploy when --check is set', async () => {
    const previousDeployKey = process.env.CONVEX_DEPLOY_KEY
    delete process.env.CONVEX_DEPLOY_KEY
    const rootDir = mkdtempSync(join(tmpdir(), 'ginko-cms-cli-deploy-check-'))
    tempDirs.push(rootDir)

    await runCli(['init'], rootDir)
    writeFileSync(
      resolve(rootDir, '.env.local'),
      ['CONVEX_URL=https://example.convex.cloud', 'CONVEX_DEPLOY_KEY=deploy-key-test', ''].join(
        '\n',
      ),
      'utf8',
    )
    writeContentConfig(rootDir, 'pages', '/')
    const calls: Array<{ kind: string; args?: Record<string, unknown>; token?: string }> = []
    const stdout = createOutput()
    const stderr = createOutput()

    try {
      const code = await runGinkoCmsCli(['deploy', '--check'], {
        cwd: rootDir,
        io: {
          stdout: stdout.stream,
          stderr: stderr.stream,
        },
        runner: async () => {
          throw new Error('deploy --check should not run the Convex CLI')
        },
        convexClientFactory: () =>
          ({
            setAdminAuth: (token: string) => calls.push({ kind: 'auth', token }),
            query: async (_ref, args) => {
              calls.push({ kind: 'query', args: args as Record<string, unknown> })
              return {
                matches: true,
                installedContentHash: (args as { contentHash: string }).contentHash,
                installedPresentationHash: (args as { presentationHash: string }).presentationHash,
                expectedContentHash: (args as { contentHash: string }).contentHash,
                expectedPresentationHash: (args as { presentationHash: string }).presentationHash,
                drift: [],
                presentationDrift: [],
              }
            },
            mutation: async () => {
              throw new Error('deploy --check should not use mutation')
            },
            action: async () => {
              throw new Error('deploy --check should not use public action')
            },
          }) as never,
      })

      expect(code).toBe(0)
      expect(stderr.read()).toBe('')
      expect(stdout.read()).toContain('Ginko CMS deploy check passed')
      expect(calls.map((call) => call.kind)).toEqual(['auth', 'query'])
    } finally {
      if (previousDeployKey === undefined) {
        delete process.env.CONVEX_DEPLOY_KEY
      } else {
        process.env.CONVEX_DEPLOY_KEY = previousDeployKey
      }
    }
  })

  it('deploys a target binding without direct installation for an incompatible transition', async () => {
    const previousDeployKey = process.env.CONVEX_DEPLOY_KEY
    delete process.env.CONVEX_DEPLOY_KEY
    const rootDir = mkdtempSync(join(tmpdir(), 'ginko-cms-cli-deploy-transition-'))
    tempDirs.push(rootDir)
    await runCli(['init'], rootDir)
    writeFileSync(
      resolve(rootDir, '.env.local'),
      ['CONVEX_URL=https://example.convex.cloud', 'CONVEX_DEPLOY_KEY=deploy-key-test', ''].join(
        '\n',
      ),
      'utf8',
    )
    writeContentConfig(rootDir, 'pages', '/next')
    const stdout = createOutput()
    const stderr = createOutput()
    let deployCalls = 0

    try {
      const code = await runGinkoCmsCli(['deploy', '--transition'], {
        cwd: rootDir,
        io: { stdout: stdout.stream, stderr: stderr.stream },
        runner: async () => {
          deployCalls += 1
          return 0
        },
        convexClientFactory: () => {
          throw new Error('transition binding deploy must not install the contract directly')
        },
      })

      expect(code).toBe(0)
      expect(stderr.read()).toBe('')
      expect(deployCalls).toBe(1)
      expect(stdout.read()).toContain('installation is deferred to contract transition activation')
      expect(readGeneratedContractBinding(rootDir)).toEqual({
        contentHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        presentationHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      })
    } finally {
      if (previousDeployKey === undefined) {
        delete process.env.CONVEX_DEPLOY_KEY
      } else {
        process.env.CONVEX_DEPLOY_KEY = previousDeployKey
      }
    }
  })

  it('prints cleanup guidance when stale generated bridge files remain', async () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'ginko-cms-cli-drift-'))
    tempDirs.push(rootDir)

    await runCli(['init'], rootDir)
    await prepareDoctorFixture(rootDir)
    writeFileSync(resolve(rootDir, staleMcpBridgeFile), '// stale generated output\n', 'utf8')

    const check = await runCli(['doctor'], rootDir)
    expect(check.code).toBe(1)
    expect(check.stderr).toContain('Ginko CMS doctor has 1 issue')
    expect(check.stderr).toContain(`${staleMcpBridgeFile} is a stale generated bridge file`)
    expect(check.stderr).toContain(`Delete ${staleMcpBridgeFile}`)
  })

  it('prints cleanup guidance when stale legacy identity secrets remain', async () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'ginko-cms-cli-legacy-env-'))
    tempDirs.push(rootDir)
    const legacySecretName = ['CONVEX', 'IDENTITY', 'FORWARDING', 'KEY'].join('_')

    await runCli(['init'], rootDir)
    await prepareDoctorFixture(rootDir, `${legacySecretName}=old-secret\n`)

    const check = await runCli(['doctor'], rootDir)
    expect(check.code).toBe(1)
    expect(check.stderr).toContain(`${legacySecretName} is a stale legacy identity secret`)
    expect(check.stderr).toContain(`Remove ${legacySecretName}`)
  })

  it('reports stale component facade imports and missing host dependencies separately', async () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'ginko-cms-cli-component-install-'))
    tempDirs.push(rootDir)

    await runCli(['init'], rootDir)
    await prepareDoctorFixture(rootDir)
    writeFileSync(
      resolve(rootDir, 'package.json'),
      JSON.stringify({
        private: true,
        dependencies: {
          '@lupinum/ginko-cms': 'workspace:*',
        },
      }),
      'utf8',
    )
    const configPath = resolve(rootDir, 'convex/convex.config.ts')
    const staleConfig = readFileSync(configPath, 'utf8')
      .replace(
        '@lupinum/better-convex-nuxt/better-auth/convex.config',
        '@lupinum/ginko-cms/convex/better-auth',
      )
      .replace('@lupinum/ginko-cms-convex/convex.config', '@lupinum/ginko-cms/convex/config')
    writeFileSync(configPath, staleConfig, 'utf8')

    const doctor = await runCli(['doctor'], rootDir)
    expect(doctor.code).toBe(1)
    expect(doctor.stderr).toContain(
      'Replace @lupinum/ginko-cms/convex/config with @lupinum/ginko-cms-convex/convex.config.',
    )
    expect(doctor.stderr).toContain(
      'Replace @lupinum/ginko-cms/convex/better-auth with @lupinum/better-convex-nuxt/better-auth/convex.config.',
    )
    expect(doctor.stderr).toContain(
      'package.json is missing direct dependency "@lupinum/better-convex-nuxt"',
    )
    expect(doctor.stderr).toContain('package.json is missing direct dependency "better-auth"')
    expect(doctor.stderr).not.toContain('package.json is missing direct dependency "kysely"')
    expect(doctor.stderr).toContain(
      'package.json is missing direct dependency "@lupinum/ginko-cms-convex"',
    )
  })

  it('[DEV-03] pushes canonical content and editorial presentation with Convex deploy-key admin auth', async () => {
    const previousDeployKey = process.env.CONVEX_DEPLOY_KEY
    delete process.env.CONVEX_DEPLOY_KEY
    const rootDir = mkdtempSync(join(tmpdir(), 'ginko-cms-cli-push-'))
    tempDirs.push(rootDir)
    writeFileSync(
      resolve(rootDir, '.env.local'),
      ['CONVEX_URL=https://example.convex.cloud', 'CONVEX_DEPLOY_KEY=deploy-key-test', ''].join(
        '\n',
      ),
      'utf8',
    )
    writeContentConfig(rootDir, 'blog', '/blog')
    writeFileSync(
      resolve(rootDir, 'nuxt.config.ts'),
      `export default { ginkoCms: { editorialLayout: { collections: { blog: { label: 'Stories', fields: {} } } } } }\n`,
      'utf8',
    )
    const deployedBinding = await bindContractForTest(rootDir)
    const calls: Array<{ kind: string; args?: Record<string, unknown>; token?: string }> = []

    const stdout = createOutput()
    const stderr = createOutput()
    try {
      const code = await runGinkoCmsCli(['push'], {
        cwd: rootDir,
        io: {
          stdout: stdout.stream,
          stderr: stderr.stream,
        },
        convexClientFactory: () =>
          ({
            setAdminAuth: (token: string) => calls.push({ kind: 'auth', token }),
            mutation: async (_ref, args) => {
              calls.push({ kind: 'mutation', args: args as Record<string, unknown> })
              return { created: 1, updated: 0, skipped: 0, missingFromConfig: [] }
            },
            query: async () => {
              calls.push({ kind: 'query' })
              return deployedBinding
            },
            action: async () => {
              throw new Error('push should not use public action')
            },
          }) as never,
      })

      expect(code).toBe(0)
      expect(stdout.read()).toContain('Ginko CMS contract installed')
      expect(stdout.read()).toContain('Content SHA-256:')
      expect(stdout.read()).toContain('Presentation SHA-256:')
      expect(calls[0]).toEqual({ kind: 'auth', token: 'deploy-key-test' })
      expect(calls[1]?.kind).toBe('query')
      expect(calls[2]?.kind).toBe('mutation')
      expect(calls[2]?.args).toMatchObject({
        content: { collections: { blog: expect.objectContaining({ id: 'blog' }) } },
        contentHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        presentation: {
          collections: { blog: { label: 'Stories', fields: {} } },
        },
        presentationHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      })
      expect(calls[2]?.args).not.toHaveProperty(removedLegacyArg)
      expect(calls[2]?.args).not.toHaveProperty('caller')
      expect(JSON.stringify(calls)).not.toContain('GINKO_CMS_INSTALL_SECRET')
    } finally {
      if (previousDeployKey === undefined) {
        delete process.env.CONVEX_DEPLOY_KEY
      } else {
        process.env.CONVEX_DEPLOY_KEY = previousDeployKey
      }
    }
  })

  it('refuses to push when the generated Content contract artifact is missing', async () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'ginko-cms-cli-push-missing-contract-'))
    tempDirs.push(rootDir)
    writeFileSync(
      resolve(rootDir, '.env.local'),
      ['CONVEX_URL=https://example.convex.cloud', 'CONVEX_DEPLOY_KEY=deploy-key-test', ''].join(
        '\n',
      ),
      'utf8',
    )

    const result = await runCli(['push'], rootDir)

    expect(result.code).toBe(2)
    expect(result.stderr).toContain('Resolved Content contract artifact is missing or invalid')
  })

  it('refuses installation when the deployed host binding differs from the local contract', async () => {
    const previousDeployKey = process.env.CONVEX_DEPLOY_KEY
    delete process.env.CONVEX_DEPLOY_KEY
    const rootDir = mkdtempSync(join(tmpdir(), 'ginko-cms-cli-push-deployed-binding-'))
    tempDirs.push(rootDir)
    writeFileSync(
      resolve(rootDir, '.env.local'),
      ['CONVEX_URL=https://example.convex.cloud', 'CONVEX_DEPLOY_KEY=deploy-key-test', ''].join(
        '\n',
      ),
      'utf8',
    )
    writeContentConfig(rootDir, 'posts', '/posts')
    const localBinding = await bindContractForTest(rootDir)
    let mutationCalled = false
    const stdout = createOutput()
    const stderr = createOutput()

    try {
      const code = await runGinkoCmsCli(['push'], {
        cwd: rootDir,
        io: { stdout: stdout.stream, stderr: stderr.stream },
        convexClientFactory: () =>
          ({
            setAdminAuth: () => {},
            query: async () => ({
              contentHash: '0'.repeat(64),
              presentationHash: localBinding.presentationHash,
            }),
            mutation: async () => {
              mutationCalled = true
            },
          }) as never,
      })

      expect(code).toBe(2)
      expect(stdout.read()).toBe('')
      expect(stderr.read()).toContain('deployed Convex host contract binding does not match')
      expect(mutationCalled).toBe(false)
    } finally {
      if (previousDeployKey === undefined) {
        delete process.env.CONVEX_DEPLOY_KEY
      } else {
        process.env.CONVEX_DEPLOY_KEY = previousDeployKey
      }
    }
  })

  it('prints exact content and presentation paths when push check fails', async () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'ginko-cms-cli-push-check-'))
    tempDirs.push(rootDir)
    writeFileSync(
      resolve(rootDir, '.env.local'),
      ['CONVEX_URL=https://example.convex.cloud', 'CONVEX_DEPLOY_KEY=deploy-key-test', ''].join(
        '\n',
      ),
      'utf8',
    )
    writeContentConfig(rootDir, 'posts', '/posts')
    const stdout = createOutput()
    const stderr = createOutput()
    const code = await runGinkoCmsCli(['push', '--check'], {
      cwd: rootDir,
      io: {
        stdout: stdout.stream,
        stderr: stderr.stream,
      },
      convexClientFactory: () =>
        ({
          setAdminAuth: () => {},
          query: async () => ({
            matches: false,
            installedContentHash: 'a'.repeat(64),
            installedPresentationHash: 'c'.repeat(64),
            expectedContentHash: 'b'.repeat(64),
            expectedPresentationHash: 'd'.repeat(64),
            drift: [
              {
                path: '$.collections.posts.fields',
                installed: [],
                expected: [{ key: 'title' }],
              },
            ],
            presentationDrift: [
              {
                path: '$.presentation.collections.posts.label',
                installed: 'Posts',
                expected: 'Articles',
              },
            ],
          }),
          mutation: async () => {
            throw new Error('push --check should not use mutation')
          },
          action: async () => {
            throw new Error('push --check should not use public action')
          },
        }) as never,
    })

    expect(code).toBe(1)
    expect(stdout.read()).toBe('')
    expect(stderr.read()).toContain('Ginko CMS contract drift detected (2 change(s))')
    expect(stderr.read()).toContain('$.collections.posts.fields')
    expect(stderr.read()).toContain('$.presentation.collections.posts.label')
  })

  it('redacts secrets from top-level CLI errors', async () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'ginko-cms-cli-redaction-'))
    tempDirs.push(rootDir)
    writeFileSync(
      resolve(rootDir, '.env.local'),
      ['CONVEX_URL=https://example.convex.cloud', 'CONVEX_DEPLOY_KEY=deploy-key-test', ''].join(
        '\n',
      ),
      'utf8',
    )
    writeContentConfig(rootDir, 'posts', '/posts')

    const stdout = createOutput()
    const stderr = createOutput()
    const code = await runGinkoCmsCli(['push', '--check'], {
      cwd: rootDir,
      io: {
        stdout: stdout.stream,
        stderr: stderr.stream,
      },
      convexClientFactory: () =>
        ({
          setAdminAuth: () => {},
          query: async () => {
            throw new Error(
              'upstream failed for deploy-key-test with Authorization: Bearer mcp_abcdefghijklmnopqrstuvwxyz123456',
            )
          },
        }) as never,
    })

    expect(code).toBe(2)
    expect(stdout.read()).toBe('')
    expect(stderr.read()).toContain('[redacted]')
    expect(stderr.read()).not.toContain('deploy-key-test')
    expect(stderr.read()).not.toContain('mcp_abcdefghijklmnopqrstuvwxyz123456')
  })

  it('[DEV-02] reports a missing installed contract as root drift', async () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'ginko-cms-cli-push-check-legacy-'))
    tempDirs.push(rootDir)
    writeFileSync(
      resolve(rootDir, '.env.local'),
      ['CONVEX_URL=https://example.convex.cloud', 'CONVEX_DEPLOY_KEY=deploy-key-test', ''].join(
        '\n',
      ),
      'utf8',
    )
    writeContentConfig(rootDir, 'posts', '/posts')

    const stdout = createOutput()
    const stderr = createOutput()
    const code = await runGinkoCmsCli(['push', '--check'], {
      cwd: rootDir,
      io: {
        stdout: stdout.stream,
        stderr: stderr.stream,
      },
      convexClientFactory: () =>
        ({
          setAdminAuth: () => {},
          query: async () => ({
            matches: false,
            installedContentHash: null,
            installedPresentationHash: null,
            expectedContentHash: 'b'.repeat(64),
            expectedPresentationHash: 'd'.repeat(64),
            drift: [{ path: '$', expected: { format: 'ginko-content-contract' } }],
            presentationDrift: [],
          }),
          mutation: async () => {
            throw new Error('push --check should not use mutation')
          },
          action: async () => {
            throw new Error('push --check should not use public action')
          },
        }) as never,
    })

    expect(code).toBe(1)
    expect(stdout.read()).toBe('')
    expect(stderr.read()).toContain('Ginko CMS contract drift detected (1 change(s))')
    expect(stderr.read()).toContain('  - $')
  })

  it('scaffolds bounded contract transition files', async () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'ginko-cms-cli-transition-create-'))
    tempDirs.push(rootDir)

    const result = await runCli(
      ['contract', 'transition', 'create', 'Rename', 'post', 'badge'],
      rootDir,
    )

    expect(result.code).toBe(0)
    expect(result.stdout).toContain('Created contract transition scaffold')
    const transitionDir = resolve(rootDir, 'ginko/transitions')
    const fileName = readdirSync(transitionDir).find((file) =>
      file.endsWith('-rename-post-badge.ts'),
    )
    expect(fileName).toBeTruthy()
    const transitionFile = readFileSync(join(transitionDir, fileName ?? ''), 'utf8')
    expect(transitionFile).toContain('draftVersion: number')
    expect(transitionFile).toContain('sharedVersion: number')
    expect(transitionFile).toContain('async up(entry: TransitionInput)')
    expect(transitionFile).not.toContain('collections: []')
  })

  it('requires explicit confirmation before locking Studio writes for staging', async () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'ginko-cms-cli-transition-stage-gate-'))
    tempDirs.push(rootDir)
    const result = await runCli(
      ['contract', 'transition', 'stage', 'ginko/transitions/2026-test.ts'],
      rootDir,
    )

    expect(result.code).toBe(2)
    expect(result.stderr).toContain('requires --yes because it locks Studio writes')
  })

  it('stages every affected draft page with version and hash fencing', async () => {
    const previousDeployKey = process.env.CONVEX_DEPLOY_KEY
    delete process.env.CONVEX_DEPLOY_KEY
    const rootDir = mkdtempSync(join(tmpdir(), 'ginko-cms-cli-transition-stage-'))
    tempDirs.push(rootDir)
    writeContentConfig(rootDir, 'posts', '/posts')
    writeFileSync(
      resolve(rootDir, 'nuxt.config.ts'),
      `export default defineNuxtConfig({ ginkoCms: { editorialLayout: { collections: { posts: { label: 'Editorial posts' } } } } })\n`,
      'utf8',
    )
    const deployedBinding = await bindContractForTest(rootDir)
    writeFileSync(
      resolve(rootDir, '.env.local'),
      ['CONVEX_URL=https://example.convex.cloud', 'CONVEX_DEPLOY_KEY=deploy-key-test', ''].join(
        '\n',
      ),
      'utf8',
    )
    const transitionDir = resolve(rootDir, 'ginko/transitions')
    mkdirSync(transitionDir, { recursive: true })
    writeFileSync(
      resolve(transitionDir, '2026-test.ts'),
      [
        'export default {',
        "  id: '2026-test',",
        '  async up(entry) {',
        "    entry.shared.badge = 'new'",
        '    return {',
        '      slug: entry.slug,',
        '      parentEntryId: entry.parentEntryId,',
        '      orderRank: entry.orderRank,',
        '      nodeKind: entry.nodeKind,',
        '      shared: entry.shared,',
        '      locales: Object.fromEntries(Object.entries(entry.locales).map(([locale, value]) => [locale, {',
        '        slug: value.slug, values: value.values, bodyMdc: value.bodyMdc,',
        '      }])),',
        '    }',
        '  },',
        '}',
        '',
      ].join('\n'),
      'utf8',
    )
    const calls: Array<{ kind: string; args?: Record<string, unknown>; token?: string }> = []
    let queryCount = 0
    let mutationCount = 0

    const stdout = createOutput()
    const stderr = createOutput()
    try {
      const code = await runGinkoCmsCli(
        ['contract', 'transition', 'stage', 'ginko/transitions/2026-test.ts', '--yes'],
        {
          cwd: rootDir,
          io: {
            stdout: stdout.stream,
            stderr: stderr.stream,
          },
          convexClientFactory: () =>
            ({
              setAdminAuth: (token: string) => calls.push({ kind: 'auth', token }),
              query: async (_ref, args) => {
                calls.push({ kind: 'query', args: args as Record<string, unknown> })
                queryCount += 1
                if (queryCount === 1) return deployedBinding
                if (queryCount === 3) {
                  return {
                    page: [
                      {
                        entryId: 'entry-1',
                        inputDraftVersion: 4,
                        inputHash: 'a'.repeat(64),
                        current: {
                          entryId: 'entry-1',
                          collection: 'posts',
                          stableId: 'abc12',
                          lifecycle: 'active',
                          draftVersion: 4,
                          sharedVersion: 2,
                          slug: 'hello',
                          parentEntryId: null,
                          orderRank: 'a0',
                          nodeKind: 'page',
                          shared: {},
                          locales: {
                            en: {
                              slug: null,
                              values: { title: 'Hello world' },
                              bodyMdc: '',
                              version: 3,
                            },
                          },
                        },
                      },
                    ],
                    isDone: true,
                    continueCursor: 'done-cursor',
                  }
                }
                return {
                  runKey: 'run-key',
                  state: queryCount === 2 ? 'staging' : queryCount === 4 ? 'validating' : 'ready',
                  fromContentHash: 'b'.repeat(64),
                  toContentHash: 'c'.repeat(64),
                  fromPresentationHash: 'd'.repeat(64),
                  toPresentationHash: 'e'.repeat(64),
                  generation: queryCount === 2 ? 1 : queryCount === 4 ? 2 : 3,
                  scannedCount: queryCount === 2 ? 0 : 1,
                  stagedCount: queryCount === 2 ? 0 : 1,
                  validatedCount: queryCount === 5 ? 1 : 0,
                  appliedCount: 0,
                  pendingCount: queryCount === 2 ? 0 : 1,
                  lockActive: true,
                  cursor: null,
                }
              },
              mutation: async (_ref, args) => {
                calls.push({ kind: 'mutation', args: args as Record<string, unknown> })
                mutationCount += 1
                if (mutationCount === 1) return { runId: 'run-1', state: 'staging' }
                if (mutationCount === 2) {
                  return {
                    state: 'validating',
                    generation: 2,
                    staged: 1,
                    stagedCount: 1,
                    continueCursor: null,
                  }
                }
                return { state: 'ready', generation: 3, validated: 1, validatedCount: 1 }
              },
              action: async () => {
                throw new Error('contract transition should not use public action')
              },
            }) as never,
        },
      )

      expect(code).toBe(0)
      expect(stderr.read()).toBe('')
      expect(stdout.read()).toContain('Staged contract transition 2026-test')
      expect(stdout.read()).toContain('runId=run-1')
      expect(stdout.read()).toContain('changed=1')
      expect(calls[0]).toEqual({ kind: 'auth', token: 'deploy-key-test' })
      expect(calls.map((call) => call.kind)).toEqual([
        'auth',
        'query',
        'mutation',
        'query',
        'query',
        'mutation',
        'query',
        'mutation',
        'query',
      ])
      expect(calls[2]?.args).toMatchObject({
        runKey: expect.stringMatching(/^[a-f0-9]{64}$/),
        targetContentHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        targetPresentation: {
          collections: { posts: { label: 'Editorial posts' } },
        },
        targetPresentationHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        actor: 'owner-cli',
      })
      expect(calls[4]?.args).toEqual({
        runId: 'run-1',
        generation: 1,
        cursor: null,
        limit: 50,
      })
      expect(calls[5]?.args).toMatchObject({
        runId: 'run-1',
        generation: 1,
        cursor: null,
        limit: 50,
        items: [
          expect.objectContaining({
            entryId: 'entry-1',
            inputDraftVersion: 4,
            inputHash: 'a'.repeat(64),
            outputHash: expect.stringMatching(/^[a-f0-9]{64}$/),
            output: expect.objectContaining({ shared: { badge: 'new' } }),
          }),
        ],
      })
      expect(calls[7]?.args).toEqual({
        runId: 'run-1',
        generation: 2,
        cursor: null,
        limit: 50,
      })
    } finally {
      if (previousDeployKey === undefined) {
        delete process.env.CONVEX_DEPLOY_KEY
      } else {
        process.env.CONVEX_DEPLOY_KEY = previousDeployKey
      }
    }
  })

  it('requires --yes before applying a staged contract transition', async () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'ginko-cms-cli-transition-apply-gate-'))
    tempDirs.push(rootDir)

    const result = await runCli(['contract', 'transition', 'apply', 'run-1'], rootDir)

    expect(result.code).toBe(2)
    expect(result.stderr).toContain('ginko-cms contract transition apply requires --yes')
  })

  it('resumes contract application pagewise until it is ready to activate', async () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'ginko-cms-cli-transition-apply-'))
    tempDirs.push(rootDir)
    writeFileSync(
      resolve(rootDir, '.env.local'),
      ['CONVEX_URL=https://example.convex.cloud', 'CONVEX_DEPLOY_KEY=deploy-key-test', ''].join(
        '\n',
      ),
      'utf8',
    )
    const calls: Array<{ kind: string; args?: Record<string, unknown>; token?: string }> = []
    let page = 0

    const stdout = createOutput()
    const stderr = createOutput()
    const code = await runGinkoCmsCli(['contract', 'transition', 'apply', 'run-1', '--yes'], {
      cwd: rootDir,
      io: {
        stdout: stdout.stream,
        stderr: stderr.stream,
      },
      convexClientFactory: () =>
        ({
          setAdminAuth: (token: string) => calls.push({ kind: 'auth', token }),
          query: async () => {
            calls.push({ kind: 'query' })
            return {
              runKey: 'run-key',
              state: 'ready',
              fromContentHash: 'a'.repeat(64),
              toContentHash: 'b'.repeat(64),
              fromPresentationHash: 'c'.repeat(64),
              toPresentationHash: 'd'.repeat(64),
              generation: 3,
              scannedCount: 28,
              stagedCount: 28,
              validatedCount: 28,
              appliedCount: 0,
              pendingCount: 28,
              lockActive: true,
              cursor: null,
            }
          },
          mutation: async (_ref, args) => {
            calls.push({ kind: 'mutation', args: args as Record<string, unknown> })
            page += 1
            return page === 1
              ? {
                  generation: 4,
                  cursor: 'item-25',
                  applied: 25,
                  appliedCount: 25,
                  readyToActivate: false,
                }
              : {
                  generation: 4,
                  cursor: 'item-28',
                  applied: 3,
                  appliedCount: 28,
                  readyToActivate: true,
                }
          },
          action: async () => {
            throw new Error('contract transition apply should not use public action')
          },
        }) as never,
    })

    expect(code).toBe(0)
    expect(stderr.read()).toBe('')
    expect(stdout.read()).toContain('Applied contract transition run-1: applied=28')
    expect(calls.map((call) => call.kind)).toEqual(['auth', 'query', 'mutation', 'mutation'])
    expect(calls[2]?.args).toEqual({
      runId: 'run-1',
      generation: 3,
      cursor: null,
      limit: 25,
      actor: 'owner-cli',
    })
    expect(calls[3]?.args).toEqual({
      runId: 'run-1',
      generation: 4,
      cursor: 'item-25',
      limit: 25,
      actor: 'owner-cli',
    })
  })

  it('refuses transition activation when the deployed host binding is stale', async () => {
    const previousDeployKey = process.env.CONVEX_DEPLOY_KEY
    delete process.env.CONVEX_DEPLOY_KEY
    const rootDir = mkdtempSync(join(tmpdir(), 'ginko-cms-cli-transition-activate-binding-'))
    tempDirs.push(rootDir)
    writeFileSync(
      resolve(rootDir, '.env.local'),
      ['CONVEX_URL=https://example.convex.cloud', 'CONVEX_DEPLOY_KEY=deploy-key-test', ''].join(
        '\n',
      ),
      'utf8',
    )
    let queryCount = 0
    let mutationCalled = false
    const stdout = createOutput()
    const stderr = createOutput()

    try {
      const code = await runGinkoCmsCli(['contract', 'transition', 'activate', 'run-1', '--yes'], {
        cwd: rootDir,
        io: { stdout: stdout.stream, stderr: stderr.stream },
        convexClientFactory: () =>
          ({
            setAdminAuth: () => {},
            query: async () => {
              queryCount += 1
              return queryCount === 1
                ? {
                    runKey: 'run-key',
                    state: 'applying',
                    fromContentHash: 'a'.repeat(64),
                    toContentHash: 'b'.repeat(64),
                    fromPresentationHash: 'c'.repeat(64),
                    toPresentationHash: 'd'.repeat(64),
                    generation: 4,
                    scannedCount: 1,
                    stagedCount: 1,
                    validatedCount: 1,
                    appliedCount: 1,
                    pendingCount: 0,
                    lockActive: true,
                    cursor: 'item-1',
                  }
                : {
                    contentHash: '0'.repeat(64),
                    presentationHash: 'd'.repeat(64),
                  }
            },
            mutation: async () => {
              mutationCalled = true
            },
          }) as never,
      })

      expect(code).toBe(2)
      expect(stdout.read()).toBe('')
      expect(stderr.read()).toContain('deployed Convex host binding does not match')
      expect(mutationCalled).toBe(false)
    } finally {
      if (previousDeployKey === undefined) {
        delete process.env.CONVEX_DEPLOY_KEY
      } else {
        process.env.CONVEX_DEPLOY_KEY = previousDeployKey
      }
    }
  })

  it('does not expose owner-authenticated backup actions through the deploy-key CLI', async () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'ginko-cms-cli-backup-removed-'))
    tempDirs.push(rootDir)

    const result = await runCli(['backup', 'export', '--scope', 'snapshot'], rootDir)

    expect(result.code).toBe(2)
    expect(result.stderr).toContain('Unknown command "backup"')
    expect(result.stderr).not.toContain('backup export')
  })
})
