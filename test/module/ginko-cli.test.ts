import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { runGinkoCmsCli } from '../../packages/cms/src/cli/ginko-cms.js'

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

async function runCliWithClient(
  args: string[],
  cwd: string,
  action: (ref: unknown, args: Record<string, unknown>) => Promise<unknown>,
) {
  const stdout = createOutput()
  const stderr = createOutput()
  const code = await runGinkoCmsCli(args, {
    cwd,
    io: {
      stdout: stdout.stream,
      stderr: stderr.stream,
    },
    convexClientFactory: () => ({ action }) as never,
  })
  return {
    code,
    stdout: stdout.read(),
    stderr: stderr.read(),
  }
}

describe('ginko-cms CLI', () => {
  const tempDirs: string[] = []

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { force: true, recursive: true })
    }
  })

  it('runs init and checks the Ginko CMS bridge without package arguments', async () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'ginko-cms-cli-'))
    tempDirs.push(rootDir)

    const init = await runCli(['init'], rootDir)
    expect(init.code).toBe(0)
    expect(init.stdout).toContain('Ginko CMS initialized')
    expect(init.stdout).toContain('Next: run `pnpm exec ginko-cms doctor`')
    expect(init.stdout).toContain('configure the required environment')
    expect(init.stdout).toContain('run `pnpm exec ginko-cms deploy`')
    expect(init.stdout).toContain(
      'Host apps must depend directly on `@convex-dev/better-auth`, `better-auth`, and `@lupinum/ginko-cms-convex`.',
    )
    expect(init.stdout).toContain('host apps must also depend directly on `secure-exec`')
    expect(init.stdout).toContain(
      'pnpm exec convex env set GINKO_FIRST_OWNER_EMAIL you@example.com',
    )
    expect(init.stdout).toContain(
      'Set the same `CONVEX_IDENTITY_FORWARDING_KEY` or `GINKO_CMS_COMPONENT_FORWARDING_KEY`',
    )
    expect(readFileSync(resolve(rootDir, 'convex/ginkoCms/members.ts'), 'utf8')).toContain(
      'createMembersBridge',
    )
    const convexConfig = readFileSync(resolve(rootDir, 'convex/convex.config.ts'), 'utf8')
    expect(convexConfig).toContain('@convex-dev/better-auth/convex.config')
    expect(convexConfig).toContain('@lupinum/ginko-cms-convex/convex.config')
    expect(convexConfig).not.toContain('@lupinum/ginko-cms/convex/better-auth')
    expect(convexConfig).not.toContain('@lupinum/ginko-cms/convex/config')
    expect(readFileSync(resolve(rootDir, 'convex/schema.ts'), 'utf8')).toContain('by_auth_key')

    const check = await runCli(['bridge', 'check'], rootDir)
    expect(check.code).toBe(0)
    expect(check.stdout).toContain('Ginko CMS bridge is up to date')
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
    writeFileSync(
      resolve(rootDir, 'nuxt.config.ts'),
      [
        'export default {',
        '  ginkoCms: {',
        "    collections: { pages: { type: 'flat', routing: { pathPrefix: '/' } } },",
        '  },',
        '}',
        '',
      ].join('\n'),
      'utf8',
    )
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
        collections: [expect.objectContaining({ slug: 'pages' })],
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
    writeFileSync(
      resolve(rootDir, 'nuxt.config.ts'),
      [
        'export default {',
        '  ginkoCms: {',
        "    collections: { pages: { type: 'flat', routing: { pathPrefix: '/' } } },",
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
              return { drift: [], missingFromConfig: [] }
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

  it('prints Ginko-branded repair guidance when generated files drift', async () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'ginko-cms-cli-drift-'))
    tempDirs.push(rootDir)

    await runCli(['bridge', 'install'], rootDir)
    const target = resolve(rootDir, 'convex/ginkoCms/members.ts')
    writeFileSync(target, `${readFileSync(target, 'utf8')}\n// local edit\n`, 'utf8')

    const check = await runCli(['doctor'], rootDir)
    expect(check.code).toBe(1)
    expect(check.stderr).toContain('Ginko CMS doctor has 1 issue')
    expect(check.stderr).toContain('Fix: pnpm exec ginko-cms init')
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
      .replace('@convex-dev/better-auth/convex.config', '@lupinum/ginko-cms/convex/better-auth')
      .replace('@lupinum/ginko-cms-convex/convex.config', '@lupinum/ginko-cms/convex/config')
    writeFileSync(configPath, staleConfig, 'utf8')

    const doctor = await runCli(['doctor'], rootDir)
    expect(doctor.code).toBe(1)
    expect(doctor.stderr).toContain(
      'Replace @lupinum/ginko-cms/convex/config with @lupinum/ginko-cms-convex/convex.config.',
    )
    expect(doctor.stderr).toContain(
      'Replace @lupinum/ginko-cms/convex/better-auth with @convex-dev/better-auth/convex.config.',
    )
    expect(doctor.stderr).toContain(
      'package.json is missing direct dependency "@convex-dev/better-auth"',
    )
    expect(doctor.stderr).toContain('package.json is missing direct dependency "better-auth"')
    expect(doctor.stderr).toContain(
      'package.json is missing direct dependency "@lupinum/ginko-cms-convex"',
    )
  })

  it('marks managed edits as blocked when bridge inspect hits host validation errors', async () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'ginko-cms-cli-inspect-validation-'))
    tempDirs.push(rootDir)

    await runCli(['init'], rootDir)
    const configPath = resolve(rootDir, 'convex/convex.config.ts')
    writeFileSync(
      configPath,
      readFileSync(configPath, 'utf8').replace(
        'app.use(ginkoCms)',
        [
          '// @ginko-cms-managed-start: @lupinum/ginko-cms convex-component',
          'app.use(ginkoCms)',
          '// @ginko-cms-managed-end: @lupinum/ginko-cms convex-component',
        ].join('\n'),
      ),
      'utf8',
    )

    const inspect = await runCli(['bridge', 'inspect'], rootDir)
    expect(inspect.code).toBe(1)
    expect(inspect.stdout).toContain('convex/convex.config.ts - blocked')
    expect(inspect.stderr).toContain('Ginko CMS bridge validation failed')
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
          '@convex-dev/better-auth': '0.12.2',
          '@lupinum/ginko-cms': 'workspace:*',
          '@lupinum/ginko-cms-convex': 'workspace:*',
          'better-auth': '1.6.11',
          convex: '1.38.0',
          'secure-exec': '^0.2.1',
        },
      }),
      'utf8',
    )
    writeFileSync(
      resolve(rootDir, '.env.local'),
      [
        'CONVEX_DEPLOY_KEY=deploy-key-test',
        'GINKO_CMS_COMPONENT_FORWARDING_KEY=component-forwarding-key-test',
        '',
      ].join('\n'),
      'utf8',
    )

    const doctor = await runCli(['mcp-doctor'], rootDir)
    expect(doctor.code).toBe(0)
    expect(doctor.stdout).toContain('ok - CONVEX_DEPLOY_KEY')
    expect(doctor.stdout).toContain(
      'ok - CONVEX_IDENTITY_FORWARDING_KEY or GINKO_CMS_COMPONENT_FORWARDING_KEY',
    )
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
          '@convex-dev/better-auth': '0.12.2',
          '@lupinum/ginko-cms': 'workspace:*',
          '@lupinum/ginko-cms-convex': 'workspace:*',
          'better-auth': '1.6.11',
          convex: '1.38.0',
        },
      }),
      'utf8',
    )
    writeFileSync(
      resolve(rootDir, '.env.local'),
      [
        'CONVEX_DEPLOY_KEY=deploy-key-test',
        'GINKO_CMS_COMPONENT_FORWARDING_KEY=component-forwarding-key-test',
        '',
      ].join('\n'),
      'utf8',
    )

    const doctor = await runCli(['mcp-doctor'], rootDir)
    expect(doctor.code).toBe(1)
    expect(doctor.stdout).toContain('missing - secure-exec host dependency')
    expect(doctor.stderr).toContain('Add "secure-exec": "^0.2.1" to dependencies')
  })

  it('reports missing component identity forwarding key in MCP doctor', async () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'ginko-cms-cli-mcp-forwarding-doctor-'))
    tempDirs.push(rootDir)

    await runCli(['init'], rootDir)
    writeFileSync(
      resolve(rootDir, 'package.json'),
      JSON.stringify({
        private: true,
        dependencies: {
          '@convex-dev/better-auth': 'latest',
          '@lupinum/ginko-cms': 'workspace:*',
          '@lupinum/ginko-cms-convex': 'workspace:*',
          'better-auth': 'latest',
        },
      }),
      'utf8',
    )
    writeFileSync(
      resolve(rootDir, '.env.local'),
      ['CONVEX_DEPLOY_KEY=deploy-key-test', ''].join('\n'),
      'utf8',
    )

    const previousIdentityForwardingKey = process.env.CONVEX_IDENTITY_FORWARDING_KEY
    const previousComponentForwardingKey = process.env.GINKO_CMS_COMPONENT_FORWARDING_KEY
    delete process.env.CONVEX_IDENTITY_FORWARDING_KEY
    delete process.env.GINKO_CMS_COMPONENT_FORWARDING_KEY
    try {
      const doctor = await runCli(['mcp-doctor'], rootDir)
      expect(doctor.code).toBe(1)
      expect(doctor.stdout).toContain(
        'missing - CONVEX_IDENTITY_FORWARDING_KEY or GINKO_CMS_COMPONENT_FORWARDING_KEY',
      )
      expect(doctor.stderr).toContain(
        'Set CONVEX_IDENTITY_FORWARDING_KEY or GINKO_CMS_COMPONENT_FORWARDING_KEY',
      )
    } finally {
      if (previousIdentityForwardingKey === undefined) {
        delete process.env.CONVEX_IDENTITY_FORWARDING_KEY
      } else {
        process.env.CONVEX_IDENTITY_FORWARDING_KEY = previousIdentityForwardingKey
      }
      if (previousComponentForwardingKey === undefined) {
        delete process.env.GINKO_CMS_COMPONENT_FORWARDING_KEY
      } else {
        process.env.GINKO_CMS_COMPONENT_FORWARDING_KEY = previousComponentForwardingKey
      }
    }
  })

  it('pushes collection contracts with Convex deploy-key admin auth', async () => {
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
    writeFileSync(
      resolve(rootDir, 'nuxt.config.ts'),
      [
        'export default {',
        '  ginkoCms: {',
        "    defaultLocale: 'en',",
        "    locales: [{ code: 'en', isDefault: true }],",
        "    collections: { blog: { type: 'flat', routing: { pathPrefix: '/blog' } } },",
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
        collections: [expect.objectContaining({ slug: 'blog' })],
        _cmsForwarding: expect.any(String),
      })
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

  it('prints actionable collection drift when push check fails', async () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'ginko-cms-cli-push-check-'))
    tempDirs.push(rootDir)
    writeFileSync(
      resolve(rootDir, '.env.local'),
      ['CONVEX_URL=https://example.convex.cloud', 'CONVEX_DEPLOY_KEY=deploy-key-test', ''].join(
        '\n',
      ),
      'utf8',
    )
    writeFileSync(
      resolve(rootDir, 'nuxt.config.ts'),
      [
        'export default {',
        '  ginkoCms: {',
        "    defaultLocale: 'en',",
        "    locales: [{ code: 'en', isDefault: true }],",
        "    collections: { posts: { type: 'flat', routing: { pathPrefix: '/posts' } } },",
        '  },',
        '}',
        '',
      ].join('\n'),
      'utf8',
    )

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
            drift: [
              {
                slug: 'posts',
                reason: 'different',
                entryCount: 1000,
                entryCountExact: false,
                migrationRequired: true,
                safeToPush: false,
                changes: [
                  { kind: 'field_removed', field: 'badge', safe: false },
                  { kind: 'field_added', field: 'category', required: false, safe: true },
                  { kind: 'schema_changed', safe: false },
                ],
              },
            ],
            missingFromConfig: ['legacy'],
            missingFromConfigDetails: [
              {
                slug: 'legacy',
                entryCount: 3,
                entryCountExact: true,
                migrationRequired: true,
                safeToPush: false,
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
    expect(stderr.read()).toContain('Collection contract drift detected')
    expect(stderr.read()).toContain('posts:')
    expect(stderr.read()).toContain('affected entries: 1000+')
    expect(stderr.read()).toContain('field removed: badge')
    expect(stderr.read()).toContain('field added: category (optional)')
    expect(stderr.read()).toContain('collection schema changed')
    expect(stderr.read()).toContain('legacy: affected entries=3')
    expect(stderr.read()).toContain('pnpm exec ginko-cms migrate create <change-name>')
  })

  it('treats legacy drift without migration metadata as migration-required', async () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'ginko-cms-cli-push-check-legacy-'))
    tempDirs.push(rootDir)
    writeFileSync(
      resolve(rootDir, '.env.local'),
      ['CONVEX_URL=https://example.convex.cloud', 'CONVEX_DEPLOY_KEY=deploy-key-test', ''].join(
        '\n',
      ),
      'utf8',
    )
    writeFileSync(
      resolve(rootDir, 'nuxt.config.ts'),
      [
        'export default {',
        '  ginkoCms: {',
        "    collections: { posts: { type: 'flat', routing: { pathPrefix: '/posts' } } },",
        '  },',
        '}',
        '',
      ].join('\n'),
      'utf8',
    )

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
            drift: [{ slug: 'posts', reason: 'different' }],
            missingFromConfig: [],
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
    expect(stderr.read()).toContain('migration required: unknown')
    expect(stderr.read()).toContain('Regenerate/deploy the CMS bridge')
    expect(stderr.read()).toContain('Treat this drift as migration-required')
    expect(stderr.read()).toContain('pnpm exec ginko-cms migrate create <change-name>')
    expect(stderr.read()).not.toContain('Recommended next step:\n  pnpm exec ginko-cms push')
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
        _cmsForwarding: expect.any(String),
      })
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
              return { changed: 1, unchanged: 0 }
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
    expect(calls.map((call) => call.kind)).toEqual(['auth', 'query', 'mutation'])
    expect(calls[2]?.args).toMatchObject({
      migrationId: '2026-test',
      entries: [
        expect.objectContaining({
          collection: 'posts',
          entryId: 'entry-1',
          shared: { badge: 'new' },
        }),
      ],
      _cmsForwarding: expect.any(String),
    })
  })

  it('exports a backup archive file through the installed backup bridge', async () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'ginko-cms-cli-backup-export-'))
    tempDirs.push(rootDir)
    writeFileSync(resolve(rootDir, '.env.local'), 'CONVEX_URL=https://example.convex.cloud\n')

    const calls: Array<Record<string, unknown>> = []
    const result = await runCliWithClient(
      ['backup', 'export', '--scope', 'full', '--out', 'backup.json'],
      rootDir,
      async (_ref, args) => {
        calls.push(args)
        if ('scope' in args) {
          return {
            artifactId: 'backup_123',
            checksum: 'abc',
            counts: { entries: 1 },
          }
        }
        return {
          artifactId: 'backup_123',
          checksum: 'abc',
          archiveJson: '{"version":1}',
        }
      },
    )

    expect(result.code).toBe(0)
    expect(result.stdout).toContain('artifactId=backup_123')
    expect(readFileSync(resolve(rootDir, 'backup.json'), 'utf8')).toBe('{"version":1}')
    expect(calls).toEqual([{ scope: 'full' }, { artifactId: 'backup_123' }])
  })

  it('returns a failing status when backup verification detects drift', async () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'ginko-cms-cli-backup-verify-'))
    tempDirs.push(rootDir)
    writeFileSync(resolve(rootDir, '.env.local'), 'CONVEX_URL=https://example.convex.cloud\n')

    const result = await runCliWithClient(
      ['backup', 'verify', '--artifact-id', 'backup_123'],
      rootDir,
      async () => ({
        ok: false,
        checksumMatches: true,
        currentDataMatches: false,
      }),
    )

    expect(result.code).toBe(1)
    expect(result.stderr).toContain('currentDataMatches=false')
  })

  it('does not expose backup import in the MVP CLI', async () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'ginko-cms-cli-backup-import-'))
    tempDirs.push(rootDir)
    writeFileSync(resolve(rootDir, '.env.local'), 'CONVEX_URL=https://example.convex.cloud\n')
    writeFileSync(resolve(rootDir, 'backup.json'), '{"version":1}', 'utf8')

    const result = await runCliWithClient(
      ['backup', 'import', '--file', 'backup.json', '--empty-only'],
      rootDir,
      async () => {
        throw new Error('import should not run')
      },
    )

    expect(result.code).toBe(2)
    expect(result.stderr).toContain('Unknown backup command "import"')
  })
})
