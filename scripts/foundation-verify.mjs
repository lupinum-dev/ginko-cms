import { execFileSync, spawnSync } from 'node:child_process'
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const repoRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))
const consumerRoot = resolve(process.env.GINKO_CMS_CONSUMER_ROOT ?? '')
const packDir = resolve(repoRoot, '.pack')
const lockPath = resolve(tmpdir(), 'ginko-cms-foundation-verify.lock')
const releaseMode = process.argv.includes('--release')

function commandLabel(command, args) {
  return [command, ...args].join(' ')
}

function resolveCommand(command, args) {
  if (command !== 'pnpm') return { command, args }
  return { command: 'corepack', args: ['pnpm', ...args] }
}

function run(label, cwd, command, args, options = {}) {
  const resolved = resolveCommand(command, args)
  console.log(`\n=== ${label} ===`)
  console.log(`cwd: ${cwd}`)
  console.log(`cmd: ${commandLabel(resolved.command, resolved.args)}`)
  execFileSync(resolved.command, resolved.args, {
    cwd,
    env: {
      ...process.env,
      npm_config_verify_deps_before_run: 'false',
      ...options.env,
    },
    stdio: 'inherit',
  })
}

function runAllowFailure(label, cwd, command, args, options = {}) {
  const resolved = resolveCommand(command, args)
  console.log(`\n=== ${label} ===`)
  console.log(`cwd: ${cwd}`)
  console.log(`cmd: ${commandLabel(resolved.command, resolved.args)}`)
  const result = spawnSync(resolved.command, resolved.args, {
    cwd,
    env: {
      ...process.env,
      npm_config_verify_deps_before_run: 'false',
      ...options.env,
    },
    encoding: 'utf8',
    stdio: 'inherit',
  })
  if (result.error) throw result.error
  return result.status ?? 1
}

function runAndScan(label, cwd, command, args, blockedPatterns, options = {}) {
  const resolved = resolveCommand(command, args)
  console.log(`\n=== ${label} ===`)
  console.log(`cwd: ${cwd}`)
  console.log(`cmd: ${commandLabel(resolved.command, resolved.args)}`)
  const result = spawnSync(resolved.command, resolved.args, {
    cwd,
    env: {
      ...process.env,
      npm_config_verify_deps_before_run: 'false',
      ...options.env,
    },
    encoding: 'utf8',
  })
  if (result.stdout) process.stdout.write(result.stdout)
  if (result.stderr) process.stderr.write(result.stderr)
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(`${label} failed with exit code ${result.status ?? 'unknown'}.`)
  }
  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`
  for (const pattern of blockedPatterns) {
    if (pattern.test(output)) {
      throw new Error(`${label} emitted blocked output pattern: ${pattern}`)
    }
  }
}

function acquireLock() {
  mkdirSync(dirname(lockPath), { recursive: true })
  try {
    const fd = openSync(lockPath, 'wx')
    return fd
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'EEXIST') {
      throw new Error(
        [
          `Foundation verification is already running or stale lock exists: ${lockPath}`,
          'Remove the lock only after confirming no other verification/package build is active.',
        ].join('\n'),
      )
    }
    throw error
  }
}

function findPackedTarball(packageName) {
  const normalizedName = packageName.replace('@', '').replace('/', '-')
  const tarballPattern = new RegExp(`^${normalizedName}-\\d.*\\.tgz$`)
  const matches = readdirSync(packDir)
    .filter((file) => tarballPattern.test(file))
    .sort()

  const tarball = matches.at(-1)
  if (!tarball) {
    throw new Error(`Missing packed tarball for ${packageName} in ${packDir}.`)
  }

  return resolve(packDir, tarball)
}

function fileDependency(path) {
  return `file:${path}`
}

function prepareConsumerPackageDependencies() {
  const packagePath = resolve(consumerRoot, 'package.json')
  const workspacePath = resolve(consumerRoot, 'pnpm-workspace.yaml')
  if (!existsSync(packagePath)) return

  const packageJson = JSON.parse(readFileSync(packagePath, 'utf8'))
  const dependencies = packageJson.dependencies ?? {}
  const packageTarballs = {
    '@lupinum/ginko-cms': findPackedTarball('@lupinum/ginko-cms'),
    '@lupinum/ginko-cms-contract': findPackedTarball('@lupinum/ginko-cms-contract'),
    '@lupinum/ginko-cms-convex': findPackedTarball('@lupinum/ginko-cms-convex'),
    '@lupinum/ginko-content': findPackedTarball('@lupinum/ginko-content'),
    'better-convex-nuxt': findPackedTarball('better-convex-nuxt'),
  }

  let packageChanged = false
  for (const [name, tarball] of Object.entries(packageTarballs)) {
    const dependency = fileDependency(tarball)
    if (dependencies[name] !== dependency) {
      dependencies[name] = dependency
      packageChanged = true
    }
  }
  packageJson.dependencies = dependencies

  const pnpmConfig = packageJson.pnpm ?? {}
  const overrides = pnpmConfig.overrides ?? {}
  for (const [name, tarball] of Object.entries(packageTarballs)) {
    const dependency = fileDependency(tarball)
    if (overrides[name] !== dependency) {
      overrides[name] = dependency
      packageChanged = true
    }
  }
  packageJson.pnpm = {
    ...pnpmConfig,
    overrides,
  }

  if (packageChanged) {
    console.log(
      `Pinned consumer package dependencies and overrides to packed tarballs in ${packagePath}: ${Object.values(
        packageTarballs,
      )
        .map((tarball) => basename(tarball))
        .join(', ')}.`,
    )
    writeFileSync(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`)
  }

  if (!existsSync(workspacePath)) return
  const current = readFileSync(workspacePath, 'utf8')
  const next = current
    .split('\n')
    .filter(
      (line) =>
        !line.includes('../../0_libs/WORK/ginko-cms') &&
        !line.includes('../../0_libs/WORK/ginko-content'),
    )
    .join('\n')

  if (next !== current) {
    console.log(
      `Removed external source package folders from ${workspacePath}; consumer installs must not rewrite source repo package bins.`,
    )
    writeFileSync(workspacePath, next)
  }
}

function resetConsumerInstall() {
  const nodeModulesPath = resolve(consumerRoot, 'node_modules')
  if (!existsSync(nodeModulesPath)) return
  console.log(
    `Removing stale consumer install before packed tarball verification: ${nodeModulesPath}`,
  )
  rmSync(nodeModulesPath, { recursive: true, force: true })
}

const managedSetupTemplates = {
  'convex/schema.ts': 'templates/convex/schema.ts',
  'convex/auth.config.ts': 'templates/convex/auth.config.ts',
}

function removeDanglingCommas(source) {
  return source.replace(/,(\s*[}\]])/g, '$1')
}

export function normalizeGeneratedManagedSetup(source) {
  return removeDanglingCommas(source).replace(/\r\n/g, '\n').trimEnd()
}

export function shouldResetAutoGeneratedConsumerSetup(current, expected) {
  return normalizeGeneratedManagedSetup(current) === normalizeGeneratedManagedSetup(expected)
}

function readInstalledManagedSetupTemplate(relativePath) {
  const templatePath = managedSetupTemplates[relativePath]
  if (!templatePath) return null

  const installedTemplate = resolve(
    consumerRoot,
    'node_modules',
    '@lupinum',
    'ginko-cms',
    templatePath,
  )
  if (!existsSync(installedTemplate)) return null

  return readFileSync(installedTemplate, 'utf8')
}

function resetAutoGeneratedConsumerSetup() {
  const managedPaths = Object.keys(managedSetupTemplates)
  for (const relativePath of managedPaths) {
    const target = resolve(consumerRoot, relativePath)
    if (!existsSync(target)) continue

    const current = readFileSync(target, 'utf8')
    const expected = readInstalledManagedSetupTemplate(relativePath)
    if (!expected || !shouldResetAutoGeneratedConsumerSetup(current, expected)) continue

    console.log(`Removing stale auto-generated consumer setup file: ${target}`)
    rmSync(target, { force: true })
  }
}

function restoreWorkspaceInstalls() {
  const workspaces = [['Restore Ginko install', repoRoot]]

  for (const [label, cwd] of workspaces) {
    console.log(`\n=== ${label} ===`)
    console.log(`cwd: ${cwd}`)
    console.log('cmd: corepack pnpm install')
    const result = spawnSync('corepack', ['pnpm', 'install'], {
      cwd,
      env: {
        ...process.env,
        npm_config_verify_deps_before_run: 'false',
      },
      stdio: 'inherit',
    })
    if (result.error) {
      console.warn(`${label} failed: ${result.error.message}`)
      process.exitCode = process.exitCode || 1
    } else if ((result.status ?? 1) !== 0) {
      console.warn(`${label} exited with status ${result.status ?? 'unknown'}.`)
      process.exitCode = process.exitCode || 1
    }
  }
}

export function runFoundationVerify() {
  const lockFd = acquireLock()
  try {
    console.log('Foundation verification runs serially by design.')
    console.log('Do not run package:e2e concurrently with consumer builds.')
    if (releaseMode) {
      console.log('Release mode enabled: browser smoke credentials are required.')
      if (!process.env.GINKO_CMS_TEST_EMAIL || !process.env.GINKO_CMS_TEST_PASSWORD) {
        throw new Error(
          'Release foundation verification requires GINKO_CMS_TEST_EMAIL and GINKO_CMS_TEST_PASSWORD.',
        )
      }
    }
    if (!process.env.GINKO_CMS_CONSUMER_ROOT) {
      throw new Error(
        'Foundation verification requires GINKO_CMS_CONSUMER_ROOT=/path/to/a/consumer-app. Private consumer apps are not hard-coded in this OSS repo.',
      )
    }

    run('Ginko install', repoRoot, 'pnpm', ['install'])
    run('Ginko format check', repoRoot, 'pnpm', ['run', 'format:check'])
    run('Ginko lint', repoRoot, 'pnpm', ['run', 'lint'])
    run('Ginko typecheck', repoRoot, 'pnpm', ['run', 'typecheck'])
    run('Ginko tests', repoRoot, 'pnpm', ['test'])
    run('Ginko packed package E2E', repoRoot, 'pnpm', ['run', 'package:e2e'])

    prepareConsumerPackageDependencies()
    run('Consumer lockfile sync for packed tarballs', consumerRoot, 'pnpm', [
      'install',
      '--lockfile-only',
      '--ignore-scripts',
    ])
    resetConsumerInstall()
    run('Consumer install before setup', consumerRoot, 'pnpm', ['install', '--ignore-scripts'])
    resetAutoGeneratedConsumerSetup()
    run('Consumer Ginko CMS setup', consumerRoot, 'pnpm', ['exec', 'ginko-cms', 'init'])
    run('Consumer Ginko CMS doctor', consumerRoot, 'pnpm', ['exec', 'ginko-cms', 'doctor'])
    run('Consumer Convex push once', consumerRoot, 'pnpm', [
      'exec',
      'ginko-cms',
      'convex',
      'dev',
      '--once',
      '--typecheck',
      'disable',
      '--tail-logs',
      'disable',
    ])
    const initialDriftStatus = runAllowFailure(
      'Consumer Ginko CMS contract preflight check',
      consumerRoot,
      'pnpm',
      ['exec', 'ginko-cms', 'push', '--check'],
    )
    if (initialDriftStatus === 0) {
      console.log('No collection contract drift before push.')
    } else {
      console.log(
        'Collection contract drift found before push; continuing to push and verify clean state.',
      )
    }
    run('Consumer Ginko CMS contract push', consumerRoot, 'pnpm', ['exec', 'ginko-cms', 'push'])
    run('Consumer Ginko CMS contract post-push check', consumerRoot, 'pnpm', [
      'exec',
      'ginko-cms',
      'push',
      '--check',
    ])
    run('Consumer Ginko CMS doctor', consumerRoot, 'pnpm', ['exec', 'ginko-cms', 'doctor'])
    run('Consumer relink after packed tarball install', consumerRoot, 'pnpm', [
      'install',
      '--ignore-scripts',
    ])
    run('Consumer direct Convex setup typecheck', consumerRoot, 'pnpm', ['run', 'typecheck'])
    run('Consumer lint', consumerRoot, 'pnpm', ['run', 'lint'])
    runAndScan(
      'Consumer build',
      consumerRoot,
      'pnpm',
      ['run', 'build'],
      [
        /unsupported_query_operator/i,
        /does not support query operator/i,
        /provider_body_ast_missing/,
        /INVALID_SORT/,
        /unhandledRejection/i,
        /\[request error\]\s+\[unhandled\]/i,
        /Collection contract sync failed/,
        /500 Server Error/,
      ],
    )

    console.log('\nFoundation core verification passed.')

    if (process.env.GINKO_CMS_TEST_EMAIL && process.env.GINKO_CMS_TEST_PASSWORD) {
      run('Consumer CMS browser smoke', consumerRoot, 'pnpm', ['run', 'smoke:cms'], {
        env: releaseMode ? { CMS_SMOKE_RELEASE: '1' } : undefined,
      })
      console.log('\nBrowser smoke passed.')
    } else {
      console.log(
        '\n=== Consumer CMS browser smoke skipped ===\nSet GINKO_CMS_TEST_EMAIL and GINKO_CMS_TEST_PASSWORD to include it. Use --release to require it.',
      )
    }
  } finally {
    restoreWorkspaceInstalls()
    try {
      closeSync(lockFd)
      if (existsSync(lockPath)) rmSync(lockPath, { force: true })
    } catch {
      if (existsSync(lockPath)) rmSync(lockPath, { force: true })
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runFoundationVerify()
}
