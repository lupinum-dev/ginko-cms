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

import { afterEach, describe, expect, it } from 'vitest'

import { runGinkoCmsCli } from '../../packages/cms/src/cli/ginko-cms.js'

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
    `export default { collections: { ${collection}: { type: 'page', source: 'content/${collection}/**/*.md', route: '${pathPrefix}' } } }\n`,
    'utf8',
  )
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
    expect(init.stdout).toContain('Set `BETTER_AUTH_SECRET`')
    expect(init.stdout).toContain('run `pnpm exec ginko-cms deploy`')
    expect(init.stdout).toContain(
      'Host apps must depend directly on `@convex-dev/better-auth`, `better-auth`, and `@lupinum/ginko-cms-convex`.',
    )
    expect(init.stdout).toContain('host apps must also depend directly on `secure-exec`')
    expect(init.stdout).toContain(
      'pnpm exec convex env set GINKO_FIRST_OWNER_EMAIL you@example.com',
    )
    const convexConfig = readFileSync(resolve(rootDir, 'convex/convex.config.ts'), 'utf8')
    expect(convexConfig).toContain('./betterAuth/convex.config')
    expect(convexConfig).toContain('@lupinum/ginko-cms-convex/convex.config')
    expect(readFileSync(resolve(rootDir, 'convex/betterAuth/schema.ts'), 'utf8')).toContain(
      'apikey: defineTable',
    )
    expect(convexConfig).not.toContain('@lupinum/ginko-cms/convex/better-auth')
    expect(convexConfig).not.toContain('@lupinum/ginko-cms/convex/config')
    expect(readFileSync(resolve(rootDir, 'convex/schema.ts'), 'utf8')).toContain('by_auth_key')
    expect(existsSync(resolve(rootDir, 'convex/ginkoCms/collections.ts'))).toBe(true)
    expect(existsSync(resolve(rootDir, 'convex/ginkoCms/mcpCredentials.ts'))).toBe(true)
    expect(existsSync(resolve(rootDir, 'convex/ginkoCms/mcpKeys.ts'))).toBe(false)
    expect(existsSync(resolve(rootDir, staleMcpBridgeFile))).toBe(false)

    writeFileSync(resolve(rootDir, '.env.local'), 'BETTER_AUTH_SECRET=test-secret\n')
    const check = await runCli(['doctor'], rootDir)
    expect(check.code).toBe(0)
    expect(check.stdout).toContain('Ginko CMS doctor passed')
  })

  it('reports a missing Better Auth secret without printing a secret value', async () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'ginko-cms-cli-secret-'))
    tempDirs.push(rootDir)
    await runCli(['init'], rootDir)

    const check = await runCli(['doctor'], rootDir)

    expect(check.code).toBe(1)
    expect(check.stderr).toContain('BETTER_AUTH_SECRET is required')
    expect(check.stderr).not.toContain('ginko-cms-dev-secret')
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
      [
        'CONVEX_URL=https://example.convex.cloud',
        'CONVEX_DEPLOY_KEY=deploy-key-test',
        'BETTER_AUTH_SECRET=test-secret',
        '',
      ].join('\n'),
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
              throw new Error('deploy should not use query without --check')
            },
            action: async () => {
              throw new Error('deploy should not use public action')
            },
          }) as never,
      })

      expect(code).toBe(0)
      expect(stderr.read()).toBe('')
      expect(stdout.read()).toContain('Ginko CMS collection contracts pushed')
      expect(calls.map((call) => call.kind)).toEqual(['convex', 'auth', 'mutation'])
      expect(calls[0]?.args).toEqual([
        'dev',
        '--once',
        '--tail-logs',
        'disable',
        '--typecheck',
        'disable',
      ])
      expect(calls[1]).toEqual({ kind: 'auth', token: 'deploy-key-test' })
      expect(calls[2]?.args).toMatchObject({
        contract: { collections: { pages: expect.objectContaining({ id: 'pages' }) } },
        contractSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
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
      [
        'CONVEX_URL=https://example.convex.cloud',
        'CONVEX_DEPLOY_KEY=deploy-key-test',
        'BETTER_AUTH_SECRET=test-secret',
        '',
      ].join('\n'),
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
                installedContractSha256: (args as { contractSha256: string }).contractSha256,
                expectedContractSha256: (args as { contractSha256: string }).contractSha256,
                drift: [],
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

  it('prints cleanup guidance when stale generated bridge files remain', async () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'ginko-cms-cli-drift-'))
    tempDirs.push(rootDir)

    await runCli(['init'], rootDir)
    writeFileSync(resolve(rootDir, '.env.local'), 'BETTER_AUTH_SECRET=test-secret\n', 'utf8')
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
    writeFileSync(
      resolve(rootDir, '.env.local'),
      `BETTER_AUTH_SECRET=test-secret\n${legacySecretName}=old-secret\n`,
      'utf8',
    )

    const check = await runCli(['doctor'], rootDir)
    expect(check.code).toBe(1)
    expect(check.stderr).toContain(`${legacySecretName} is a stale legacy identity secret`)
    expect(check.stderr).toContain(`Remove ${legacySecretName}`)
  })

  it('reports stale component facade imports and missing host dependencies separately', async () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'ginko-cms-cli-component-install-'))
    tempDirs.push(rootDir)

    await runCli(['init'], rootDir)
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
      .replace('./betterAuth/convex.config', '@lupinum/ginko-cms/convex/better-auth')
      .replace('@lupinum/ginko-cms-convex/convex.config', '@lupinum/ginko-cms/convex/config')
    writeFileSync(configPath, staleConfig, 'utf8')

    const doctor = await runCli(['doctor'], rootDir)
    expect(doctor.code).toBe(1)
    expect(doctor.stderr).toContain(
      'Replace @lupinum/ginko-cms/convex/config with @lupinum/ginko-cms-convex/convex.config.',
    )
    expect(doctor.stderr).toContain(
      'Replace @lupinum/ginko-cms/convex/better-auth with ./betterAuth/convex.config.',
    )
    expect(doctor.stderr).toContain(
      'package.json is missing direct dependency "@convex-dev/better-auth"',
    )
    expect(doctor.stderr).toContain('package.json is missing direct dependency "better-auth"')
    expect(doctor.stderr).toContain(
      'package.json is missing direct dependency "@lupinum/ginko-cms-convex"',
    )
  })

  it('loads local env files for MCP doctor checks', async () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'ginko-cms-cli-mcp-doctor-'))
    tempDirs.push(rootDir)

    await runCli(['init'], rootDir)
    writeFileSync(
      resolve(rootDir, 'package.json'),
      JSON.stringify({
        private: true,
        dependencies: {
          '@convex-dev/better-auth': '0.12.5',
          '@lupinum/ginko-cms': 'workspace:*',
          '@lupinum/ginko-cms-convex': 'workspace:*',
          'better-auth': '1.6.23',
          convex: '1.38.0',
          'secure-exec': '^0.2.1',
        },
      }),
      'utf8',
    )
    writeFileSync(
      resolve(rootDir, '.env.local'),
      [
        'CONVEX_URL=https://example.convex.cloud',
        'CONVEX_SITE_URL=https://example.convex.site',
        '',
      ].join('\n'),
      'utf8',
    )

    const doctor = await runCli(['mcp-doctor'], rootDir)
    expect(doctor.code).toBe(0)
    expect(doctor.stdout).toContain('ok - Convex URL')
    expect(doctor.stdout).toContain('ok - Better Auth base URL')
    expect(doctor.stdout).toContain('ok - secure-exec host dependency')
  })

  it('reports missing secure-exec in MCP doctor because code mode resolves it from the host app', async () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'ginko-cms-cli-mcp-secure-exec-'))
    tempDirs.push(rootDir)

    await runCli(['init'], rootDir)
    writeFileSync(
      resolve(rootDir, 'package.json'),
      JSON.stringify({
        private: true,
        dependencies: {
          '@convex-dev/better-auth': '0.12.5',
          '@lupinum/ginko-cms': 'workspace:*',
          '@lupinum/ginko-cms-convex': 'workspace:*',
          'better-auth': '1.6.23',
          convex: '1.38.0',
        },
      }),
      'utf8',
    )
    writeFileSync(
      resolve(rootDir, '.env.local'),
      [
        'CONVEX_URL=https://example.convex.cloud',
        'CONVEX_SITE_URL=https://example.convex.site',
        '',
      ].join('\n'),
      'utf8',
    )

    const doctor = await runCli(['mcp-doctor'], rootDir)
    expect(doctor.code).toBe(1)
    expect(doctor.stdout).toContain('missing - secure-exec host dependency')
    expect(doctor.stderr).toContain('Add "secure-exec": "^0.2.1" to dependencies')
  })

  it('pushes the canonical Content policy with Convex deploy-key admin auth', async () => {
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
              throw new Error('push should not use query without --check')
            },
            action: async () => {
              throw new Error('push should not use public action')
            },
          }) as never,
      })

      expect(code).toBe(0)
      expect(stdout.read()).toContain('Ginko CMS collection contracts pushed')
      expect(calls[0]).toEqual({ kind: 'auth', token: 'deploy-key-test' })
      expect(calls[1]?.kind).toBe('mutation')
      expect(calls[1]?.args).toMatchObject({
        contract: { collections: { blog: expect.objectContaining({ id: 'blog' }) } },
        contractSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      })
      expect(calls[1]?.args).not.toHaveProperty(removedLegacyArg)
      expect(calls[1]?.args).not.toHaveProperty('caller')
      expect(JSON.stringify(calls)).not.toContain('GINKO_CMS_INSTALL_SECRET')
    } finally {
      if (previousDeployKey === undefined) {
        delete process.env.CONVEX_DEPLOY_KEY
      } else {
        process.env.CONVEX_DEPLOY_KEY = previousDeployKey
      }
    }
  })

  it('refuses to push when the canonical Content policy source is missing', async () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'ginko-cms-cli-push-missing-policy-'))
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
    expect(result.stderr).toContain('requires content.config.ts')
  })

  it('prints exact policy paths when push check fails', async () => {
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
            installedContractSha256: 'a'.repeat(64),
            expectedContractSha256: 'b'.repeat(64),
            drift: [
              {
                path: '$.collections.posts.fields',
                installed: [],
                expected: [{ key: 'title' }],
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
    expect(stderr.read()).toContain('Ginko CMS policy drift detected (1 change(s))')
    expect(stderr.read()).toContain('$.collections.posts.fields')
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

  it('reports a missing installed policy as root drift', async () => {
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
            installedContractSha256: null,
            expectedContractSha256: 'b'.repeat(64),
            drift: [{ path: '$', expected: { format: 'ginko-content-contract' } }],
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
    expect(stderr.read()).toContain('Ginko CMS policy drift detected (1 change(s))')
    expect(stderr.read()).toContain('  - $')
  })

  it('scaffolds project content migration files', async () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'ginko-cms-cli-migrate-create-'))
    tempDirs.push(rootDir)

    const result = await runCli(['migrate', 'create', 'Rename', 'post', 'badge'], rootDir)

    expect(result.code).toBe(0)
    expect(result.stdout).toContain('Created content migration scaffold')
    const migrationDir = resolve(rootDir, 'ginko/migrations')
    const fileName = readdirSync(migrationDir).find((file) =>
      file.endsWith('-rename-post-badge.ts'),
    )
    expect(fileName).toBeTruthy()
    const migrationFile = readFileSync(join(migrationDir, fileName ?? ''), 'utf8')
    expect(migrationFile).toContain('collections: []')
    expect(migrationFile).toContain('draftVersion: number')
    expect(migrationFile).toContain('async up(entry: ContentMigrationEntry)')
  })

  it('plans explicit content migrations without writing data', async () => {
    const previousDeployKey = process.env.CONVEX_DEPLOY_KEY
    delete process.env.CONVEX_DEPLOY_KEY
    const rootDir = mkdtempSync(join(tmpdir(), 'ginko-cms-cli-migrate-plan-'))
    tempDirs.push(rootDir)
    writeFileSync(
      resolve(rootDir, '.env.local'),
      ['CONVEX_URL=https://example.convex.cloud', 'CONVEX_DEPLOY_KEY=deploy-key-test', ''].join(
        '\n',
      ),
      'utf8',
    )
    const migrationDir = resolve(rootDir, 'ginko/migrations')
    mkdirSync(migrationDir, { recursive: true })
    writeFileSync(
      resolve(migrationDir, '2026-test.ts'),
      [
        'export default {',
        "  id: '2026-test',",
        "  collections: ['posts'],",
        '  async up(entry) {',
        "    entry.locales.en.values.title = 'Hello migrated'",
        '    return entry',
        '  },',
        '}',
        '',
      ].join('\n'),
      'utf8',
    )
    const calls: Array<{ kind: string; args?: Record<string, unknown>; token?: string }> = []

    const stdout = createOutput()
    const stderr = createOutput()
    try {
      const code = await runGinkoCmsCli(['migrate', 'plan', 'ginko/migrations/2026-test.ts'], {
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
              return {
                page: [
                  {
                    collection: 'posts',
                    entryId: 'entry-1',
                    stableId: null,
                    draftVersion: 1,
                    shared: {},
                    locales: { en: { values: { title: 'Hello world' }, bodyMdc: '' } },
                  },
                ],
                isDone: true,
                continueCursor: null,
              }
            },
            mutation: async () => {
              throw new Error('migrate plan should not use mutation')
            },
            action: async () => {
              throw new Error('migrate plan should not use public action')
            },
          }) as never,
      })

      expect(code).toBe(0)
      expect(stderr.read()).toBe('')
      expect(stdout.read()).toContain('Content migration plan: 2026-test')
      expect(stdout.read()).toContain('changed: 1')
      expect(stdout.read()).toContain('locales.en.values.title')
      expect(calls[0]).toEqual({ kind: 'auth', token: 'deploy-key-test' })
      expect(calls.map((call) => call.kind)).toEqual(['auth', 'query'])
      expect(calls[1]?.args).toMatchObject({
        collection: 'posts',
        cursor: null,
        limit: 100,
      })
      expect(calls[1]?.args).not.toHaveProperty(removedLegacyArg)
    } finally {
      if (previousDeployKey === undefined) {
        delete process.env.CONVEX_DEPLOY_KEY
      } else {
        process.env.CONVEX_DEPLOY_KEY = previousDeployKey
      }
    }
  })

  it('requires --yes before applying explicit content migrations', async () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'ginko-cms-cli-migrate-apply-gate-'))
    tempDirs.push(rootDir)

    const result = await runCli(['migrate', 'apply', 'ginko/migrations/2026-test.ts'], rootDir)

    expect(result.code).toBe(2)
    expect(result.stderr).toContain('ginko-cms migrate apply requires --yes')
  })

  it('applies only changed explicit content migration entries', async () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'ginko-cms-cli-migrate-apply-'))
    tempDirs.push(rootDir)
    writeContentConfig(rootDir, 'posts', '/posts')
    writeFileSync(
      resolve(rootDir, '.env.local'),
      ['CONVEX_URL=https://example.convex.cloud', 'CONVEX_DEPLOY_KEY=deploy-key-test', ''].join(
        '\n',
      ),
      'utf8',
    )
    const migrationDir = resolve(rootDir, 'ginko/migrations')
    mkdirSync(migrationDir, { recursive: true })
    writeFileSync(
      resolve(migrationDir, '2026-test.ts'),
      [
        'export default {',
        "  id: '2026-test',",
        "  collections: ['posts'],",
        '  async up(entry) {',
        "    entry.shared.badge = 'new'",
        '    return entry',
        '  },',
        '}',
        '',
      ].join('\n'),
      'utf8',
    )
    const calls: Array<{ kind: string; args?: Record<string, unknown>; token?: string }> = []

    const stdout = createOutput()
    const stderr = createOutput()
    const code = await runGinkoCmsCli(
      ['migrate', 'apply', 'ginko/migrations/2026-test.ts', '--yes'],
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
              return {
                page: [
                  {
                    collection: 'posts',
                    entryId: 'entry-1',
                    stableId: null,
                    draftVersion: 1,
                    shared: {},
                    locales: { en: { values: { title: 'Hello world' }, bodyMdc: '' } },
                  },
                ],
                isDone: true,
                continueCursor: null,
              }
            },
            mutation: async (_ref, args) => {
              calls.push({ kind: 'mutation', args: args as Record<string, unknown> })
              return calls.filter((call) => call.kind === 'mutation').length === 1
                ? { runId: 'run-1' }
                : { changed: 1, skipped: 0 }
            },
            action: async () => {
              throw new Error('migrate apply should not use public action')
            },
          }) as never,
      },
    )

    expect(code).toBe(0)
    expect(stderr.read()).toBe('')
    expect(stdout.read()).toContain('Applied content migration 2026-test: changed=1')
    expect(calls.map((call) => call.kind)).toEqual(['auth', 'mutation', 'query', 'mutation'])
    expect(calls[1]?.args).toMatchObject({
      migrationId: '2026-test',
      sourceHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      toContractHash: expect.stringMatching(/^[a-f0-9]{64}$/),
    })
    expect(calls[2]?.args).toMatchObject({ runId: 'run-1' })
    expect(calls[3]?.args).toMatchObject({
      runId: 'run-1',
      entries: [
        expect.objectContaining({
          inputHash: expect.stringMatching(/^[a-f0-9]{64}$/),
          outputHash: expect.stringMatching(/^[a-f0-9]{64}$/),
          entry: expect.objectContaining({
            collection: 'posts',
            entryId: 'entry-1',
            shared: { badge: 'new' },
          }),
        }),
      ],
    })
    expect(calls[2]?.args).not.toHaveProperty(removedLegacyArg)
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
