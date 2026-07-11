import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  appendFileSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const repoRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))
const compatibilityMatrix = JSON.parse(
  readFileSync(resolve(repoRoot, 'packages/cms/compatibility.json'), 'utf8'),
)
const rootPackageJson = JSON.parse(readFileSync(resolve(repoRoot, 'package.json'), 'utf8'))
const consumerCompatibility = compatibilityMatrix.consumer
const packDir = resolve(repoRoot, '.pack')
const tempDir = mkdtempSync(join(tmpdir(), 'ginko-cms-package-e2e-'))
const pnpmBin = process.env.npm_execpath ?? 'pnpm'
const candidateMode = process.argv.includes('--candidate')
const developmentMode = process.argv.includes('--dev-sources')
const registryDependencies = process.argv.includes('--registry-deps')
if ([candidateMode, developmentMode, registryDependencies].filter(Boolean).length !== 1) {
  throw new Error(
    'Choose exactly one package dependency lane: --candidate, --dev-sources, or --registry-deps.',
  )
}
const siblingContentRoot = resolve(repoRoot, '../ginko-content/packages/content')
const contentRoot = process.env.GINKO_CONTENT_PACKAGE_ROOT
  ? resolve(process.env.GINKO_CONTENT_PACKAGE_ROOT)
  : existsSync(siblingContentRoot)
    ? siblingContentRoot
    : undefined
const betterConvexNuxtRoot = process.env.BETTER_CONVEX_NUXT_PACKAGE_ROOT
  ? resolve(process.env.BETTER_CONVEX_NUXT_PACKAGE_ROOT)
  : undefined
const liveConvex = process.argv.includes('--live')
const registryContent = registryDependencies || (developmentMode && !contentRoot)
const registryBetterConvexNuxt = registryDependencies || (developmentMode && !betterConvexNuxtRoot)
const contentRegistryVersion =
  process.env.GINKO_CONTENT_PACKAGE_VERSION ||
  compatibilityMatrix.releaseStack['@lupinum/ginko-content']
const betterConvexNuxtRegistryVersion =
  process.env.BETTER_CONVEX_NUXT_PACKAGE_VERSION ||
  compatibilityMatrix.releaseStack['better-convex-nuxt']

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

function requireCandidateArtifact(pathVariable, hashVariable) {
  const artifact = process.env[pathVariable]
  const expectedHash = process.env[hashVariable]?.toLowerCase()
  if (!artifact || !expectedHash) {
    throw new Error(`Candidate verification requires ${pathVariable} and ${hashVariable}.`)
  }
  const resolvedArtifact = resolve(artifact)
  if (!existsSync(resolvedArtifact) || !resolvedArtifact.endsWith('.tgz')) {
    throw new Error(`${pathVariable} must reference an existing .tgz file.`)
  }
  if (!/^[a-f0-9]{64}$/.test(expectedHash)) {
    throw new Error(`${hashVariable} must be a lowercase or uppercase SHA-256 digest.`)
  }
  const actualHash = sha256(resolvedArtifact)
  if (actualHash !== expectedHash) {
    throw new Error(
      `${pathVariable} SHA-256 mismatch: expected ${expectedHash}, received ${actualHash}.`,
    )
  }
  return { path: resolvedArtifact, sha256: actualHash }
}

const candidateContent = candidateMode
  ? requireCandidateArtifact('GINKO_CONTENT_TARBALL', 'GINKO_CONTENT_SHA256')
  : undefined
const candidateBetterConvexNuxt = candidateMode
  ? requireCandidateArtifact('BETTER_CONVEX_NUXT_TARBALL', 'BETTER_CONVEX_NUXT_SHA256')
  : undefined

function packageE2eEnv() {
  if (!liveConvex) {
    const inheritedKeys = [
      'CI',
      'COREPACK_HOME',
      'FORCE_COLOR',
      'HOME',
      'LANG',
      'LC_ALL',
      'LOGNAME',
      'NO_COLOR',
      'NODE_OPTIONS',
      'PATH',
      'PNPM_HOME',
      'SHELL',
      'TEMP',
      'TERM',
      'TMP',
      'TMPDIR',
      'USER',
      'XDG_CACHE_HOME',
      'XDG_CONFIG_HOME',
      'XDG_DATA_HOME',
    ]
    const env = Object.fromEntries(
      inheritedKeys
        .map((key) => [key, process.env[key]])
        .filter((entry) => typeof entry[1] === 'string'),
    )
    return {
      ...env,
      npm_config_confirm_modules_purge: 'false',
      npm_config_dangerously_allow_all_builds: 'true',
      npm_config_verify_deps_before_run: 'false',
    }
  }

  const env = {
    ...process.env,
    npm_config_confirm_modules_purge: 'false',
    npm_config_dangerously_allow_all_builds: 'true',
    npm_config_verify_deps_before_run: 'false',
  }

  return env
}

function run(command, args, options = {}) {
  const resolvedCommand = command === 'pnpm' ? pnpmBin : command
  execFileSync(resolvedCommand, args, {
    cwd: options.cwd ?? repoRoot,
    env: packageE2eEnv(),
    stdio: 'inherit',
  })
}

function packPackage(packageDir) {
  run('pnpm', [
    '--dir',
    packageDir,
    'pack',
    '--config.ignore-scripts=true',
    '--pack-destination',
    packDir,
  ])
}

function buildPackage(packageDir) {
  run('pnpm', ['--dir', packageDir, 'run', 'build'])
}

function buildPackedPackages() {
  run('pnpm', ['--filter', '@lupinum/ginko-cms', 'build'])
  if (developmentMode && !registryContent) {
    buildPackage(contentRoot)
  }
}

function findTarball(packageName) {
  const normalizedName = packageName.replace('@', '').replace('/', '-')
  const tarballPattern = new RegExp(`^${normalizedName}-\\d.*\\.tgz$`)
  const matches = readdirSync(packDir)
    .filter((file) => tarballPattern.test(file))
    .sort()

  const tarball = matches.at(-1)
  if (!tarball) {
    throw new Error(`Missing packed tarball for ${packageName} in ${packDir}`)
  }

  return resolve(packDir, tarball)
}

function fileDependency(path) {
  return `file:${path}`
}

function contentAddressedCopy(path) {
  const artifactDir = join(tempDir, 'artifacts')
  const extension = '.tgz'
  const filename = basename(path, extension)
  const target = join(artifactDir, `${filename}-${sha256(path)}${extension}`)
  mkdirSync(artifactDir, { recursive: true })
  copyFileSync(path, target)
  return target
}

function contentDependency(contentTarball) {
  if (candidateContent) return fileDependency(candidateContent.path)
  return registryContent ? contentRegistryVersion : fileDependency(contentTarball)
}

function betterConvexNuxtDependency(betterConvexNuxtTarball) {
  if (candidateBetterConvexNuxt) return fileDependency(candidateBetterConvexNuxt.path)
  return registryBetterConvexNuxt
    ? betterConvexNuxtRegistryVersion
    : fileDependency(betterConvexNuxtTarball)
}

function yamlQuote(value) {
  return `'${value.replaceAll("'", "''")}'`
}

function writeConsumerWorkspaceConfig(cwd, overrides) {
  const lines = [
    'packages:',
    '  - .',
    'minimumReleaseAge: 1440',
    'minimumReleaseAgeExclude:',
    "  - '@lupinum/*'",
    "  - '@nuxt/*'",
    "  - 'better-convex-nuxt'",
    "  - 'nuxt'",
    'overrides:',
  ]

  for (const [name, specifier] of Object.entries(overrides)) {
    lines.push(`  ${yamlQuote(name)}: ${yamlQuote(specifier)}`)
  }

  writeFileSync(join(cwd, 'pnpm-workspace.yaml'), `${lines.join('\n')}\n`, 'utf8')
}

function addOfflineComponentsStub(cwd) {
  const apiJsPath = join(cwd, 'convex', '_generated', 'api.js')
  const apiDtsPath = join(cwd, 'convex', '_generated', 'api.d.ts')

  if (!existsSync(apiJsPath) || !existsSync(apiDtsPath)) {
    throw new Error('Convex offline codegen did not create convex/_generated/api files.')
  }

  appendFileSync(
    apiJsPath,
    [
      '',
      '// Package E2E uses offline codegen, which cannot discover deployed child components.',
      'export const components = anyApi;',
      '',
    ].join('\n'),
    'utf8',
  )
  appendFileSync(
    apiDtsPath,
    [
      '',
      '// Package E2E uses offline codegen, which cannot discover deployed child components.',
      'export declare const components: any;',
      '',
    ].join('\n'),
    'utf8',
  )
}

try {
  buildPackedPackages()

  rmSync(packDir, { force: true, recursive: true })
  mkdirSync(packDir, { recursive: true })

  packPackage('packages/contract')
  packPackage('packages/convex')
  packPackage('packages/cms')
  if (developmentMode && !registryContent) {
    packPackage(contentRoot)
  }
  if (developmentMode && !registryBetterConvexNuxt) {
    packPackage(betterConvexNuxtRoot)
  }

  const packedContractTarball = findTarball('lupinum/ginko-cms-contract')
  const packedConvexTarball = findTarball('lupinum/ginko-cms-convex')
  const packedCmsTarball = findTarball('lupinum/ginko-cms')
  const contentTarball =
    registryContent || candidateContent ? undefined : findTarball('lupinum/ginko-content')
  const betterConvexNuxtTarball =
    registryBetterConvexNuxt || candidateBetterConvexNuxt
      ? undefined
      : findTarball('better-convex-nuxt')

  run('node', ['scripts/check-pack-workspace-refs.mjs'])

  // pnpm caches file dependencies by path and version. Hash-named copies ensure
  // the consumer always installs the bytes packed by this verification run.
  const contractTarball = contentAddressedCopy(packedContractTarball)
  const convexTarball = contentAddressedCopy(packedConvexTarball)
  const cmsTarball = contentAddressedCopy(packedCmsTarball)

  writeFileSync(
    join(tempDir, 'package.json'),
    JSON.stringify(
      {
        private: true,
        name: 'ginko-cms-package-e2e-consumer',
        packageManager: rootPackageJson.packageManager,
        type: 'module',
        dependencies: {
          ...consumerCompatibility.dependencies,
          '@lupinum/ginko-cms': fileDependency(cmsTarball),
          '@lupinum/ginko-cms-contract': fileDependency(contractTarball),
          '@lupinum/ginko-cms-convex': fileDependency(convexTarball),
          '@lupinum/ginko-content': contentDependency(contentTarball),
          '@nuxtjs/mcp-toolkit': compatibilityMatrix.tracked['@nuxtjs/mcp-toolkit'][1],
          'better-convex-nuxt': betterConvexNuxtDependency(betterConvexNuxtTarball),
          'secure-exec': compatibilityMatrix.tracked['secure-exec'][1],
        },
        devDependencies: consumerCompatibility.devDependencies,
      },
      null,
      2,
    ),
    'utf8',
  )

  writeConsumerWorkspaceConfig(tempDir, {
    '@lupinum/ginko-cms': fileDependency(cmsTarball),
    '@lupinum/ginko-cms-contract': fileDependency(contractTarball),
    '@lupinum/ginko-cms-convex': fileDependency(convexTarball),
    '@lupinum/ginko-content': contentDependency(contentTarball),
    '@nuxtjs/mcp-toolkit': compatibilityMatrix.tracked['@nuxtjs/mcp-toolkit'][1],
    'better-convex-nuxt': betterConvexNuxtDependency(betterConvexNuxtTarball),
    convex: consumerCompatibility.dependencies.convex,
    'secure-exec': compatibilityMatrix.tracked['secure-exec'][1],
  })

  writeFileSync(
    join(tempDir, 'nuxt.config.ts'),
    [
      "import ginkoCms from '@lupinum/ginko-cms'",
      '',
      'export default defineNuxtConfig({',
      '  modules: [ginkoCms],',
      '  ginkoCms: {',
      '    mcp: true,',
      '    publicContent: { api: true },',
      '  },',
      '})',
      '',
    ].join('\n'),
    'utf8',
  )

  writeFileSync(
    join(tempDir, 'convex.json'),
    JSON.stringify(
      {
        $schema: 'node_modules/convex/schemas/convex.schema.json',
        aiFiles: { enabled: false },
      },
      null,
      2,
    ),
    'utf8',
  )

  if (liveConvex) {
    const hasConfiguredDeployment = Boolean(process.env.CONVEX_DEPLOYMENT && process.env.CONVEX_URL)
    const hasSelfHostedDeployment = Boolean(
      process.env.CONVEX_SELF_HOSTED_URL && process.env.CONVEX_SELF_HOSTED_ADMIN_KEY,
    )
    if (!hasConfiguredDeployment && !hasSelfHostedDeployment) {
      throw new Error(
        'package:e2e --live requires either CONVEX_DEPLOYMENT plus CONVEX_URL, or CONVEX_SELF_HOSTED_URL plus CONVEX_SELF_HOSTED_ADMIN_KEY, for a disposable deployment.',
      )
    }
    writeFileSync(
      join(tempDir, '.env.local'),
      [
        process.env.CONVEX_DEPLOYMENT ? `CONVEX_DEPLOYMENT=${process.env.CONVEX_DEPLOYMENT}` : '',
        process.env.CONVEX_URL
          ? `CONVEX_URL=${process.env.CONVEX_URL}`
          : `CONVEX_URL=${process.env.CONVEX_SELF_HOSTED_URL}`,
        process.env.CONVEX_SITE_URL ? `CONVEX_SITE_URL=${process.env.CONVEX_SITE_URL}` : '',
        process.env.CONVEX_SELF_HOSTED_URL
          ? `CONVEX_SELF_HOSTED_URL=${process.env.CONVEX_SELF_HOSTED_URL}`
          : '',
        process.env.CONVEX_SELF_HOSTED_ADMIN_KEY
          ? `CONVEX_SELF_HOSTED_ADMIN_KEY=${process.env.CONVEX_SELF_HOSTED_ADMIN_KEY}`
          : '',
        '',
      ]
        .filter(Boolean)
        .join('\n'),
      'utf8',
    )
  }

  writeFileSync(
    join(tempDir, 'tsconfig.json'),
    JSON.stringify(
      {
        extends: './.nuxt/tsconfig.json',
      },
      null,
      2,
    ),
    'utf8',
  )

  mkdirSync(join(tempDir, 'server/api'), { recursive: true })
  writeFileSync(
    join(tempDir, 'server/api/convex-alias-smoke.get.ts'),
    [
      "import { api, components } from '#convex/api'",
      "import { serverConvex } from '#convex/server'",
      '',
      'export default defineEventHandler((event) => {',
      '  void api',
      '  void components',
      "  const convex = serverConvex(event, { auth: 'none' })",
      '  void convex.query',
      '  void convex.mutation',
      '  return { ok: true }',
      '})',
      '',
    ].join('\n'),
    'utf8',
  )

  run('pnpm', ['install', '--ignore-scripts'], { cwd: tempDir })

  const installedVersions = Object.fromEntries(
    [
      ['@lupinum/ginko-content', 'node_modules/@lupinum/ginko-content/package.json'],
      ['better-convex-nuxt', 'node_modules/better-convex-nuxt/package.json'],
    ].map(([name, path]) => [name, JSON.parse(readFileSync(join(tempDir, path), 'utf8')).version]),
  )
  for (const [name, version] of Object.entries(installedVersions)) {
    if (version !== compatibilityMatrix.releaseStack[name]) {
      throw new Error(
        `Installed ${name}@${version}; expected ${compatibilityMatrix.releaseStack[name]} from compatibility.json.`,
      )
    }
  }
  const consumerLockfile = readFileSync(join(tempDir, 'pnpm-lock.yaml'), 'utf8')
  if (/\b(?:link|workspace):/.test(consumerLockfile)) {
    throw new Error('Candidate consumer lockfile contains a workspace or link dependency.')
  }
  run('pnpm', ['exec', 'ginko-cms', 'init'], { cwd: tempDir })
  run('pnpm', ['exec', 'ginko-cms', 'doctor'], { cwd: tempDir })
  run('pnpm', ['exec', 'convex', 'codegen', '--system-udfs', '--typecheck', 'disable'], {
    cwd: tempDir,
  })
  addOfflineComponentsStub(tempDir)

  for (const relativePath of [
    'convex/auth.ts',
    'convex/auth.config.ts',
    'convex/convex.config.ts',
    'convex/http.ts',
    'convex/schema.ts',
    'convex/ginkoCms/agentRuns.ts',
    'convex/ginkoCms/assets.ts',
    'convex/ginkoCms/backup.ts',
    'convex/ginkoCms/collections.ts',
    'convex/ginkoCms/diagnostics.ts',
    'convex/ginkoCms/editor.ts',
    'convex/ginkoCms/imports.ts',
    'convex/ginkoCms/mcpCredentials.ts',
    'convex/ginkoCms/members.ts',
    'convex/ginkoCms/migrations.ts',
    'convex/ginkoCms/public.ts',
    'convex/ginkoCms/revalidation.ts',
    'convex/ginkoCms/reviewRequests.ts',
    'convex/ginkoCms/settings.ts',
    'convex/ginkoCms/siteData.ts',
  ]) {
    if (!existsSync(resolve(tempDir, relativePath))) {
      throw new Error(`Direct Convex setup did not write ${relativePath}`)
    }
  }

  const staleGeneratedBridgePaths = [
    ['convex', 'ginkoCms.ts'].join('/'),
    ['convex', `ginkoCms${'Mcp.ts'}`].join('/'),
    ['convex', 'ginkoCms', 'mcpKeys.ts'].join('/'),
  ]
  for (const relativePath of staleGeneratedBridgePaths) {
    if (existsSync(resolve(tempDir, relativePath))) {
      throw new Error(`Direct Convex setup wrote stale generated bridge file ${relativePath}`)
    }
  }

  run('pnpm', ['exec', 'nuxt', 'prepare'], { cwd: tempDir })
  run('pnpm', ['exec', 'nuxt', 'typecheck'], { cwd: tempDir })
  if (liveConvex) {
    run(
      'pnpm',
      [
        'exec',
        'convex',
        'dev',
        '--once',
        '--env-file',
        '.env.local',
        '--typecheck',
        'disable',
        '--tail-logs',
        'disable',
      ],
      {
        cwd: tempDir,
      },
    )
  }

  const importCheck = [
    "await import('@lupinum/ginko-cms')",
    "await import('@lupinum/ginko-cms/nuxt-provider')",
    "await import('@lupinum/ginko-cms-contract/convex/validators.js')",
    "await import('@lupinum/ginko-cms-contract/convex/schemas/public.js')",
    "await import('@lupinum/ginko-cms-contract/shared/readiness.js')",
    "await import('@lupinum/ginko-cms-convex/convex.config')",
    "await import('@lupinum/ginko-cms-convex/convex.auth')",
    "await import('@lupinum/ginko-cms-convex/component')",
    "console.log('package imports ok')",
  ].join(';')

  run('node', ['--input-type=module', '--eval', importCheck], { cwd: tempDir })

  console.log(
    [
      'package e2e ok',
      `consumer=${tempDir}`,
      `cms=${basename(cmsTarball)}`,
      `content=${candidateContent ? basename(candidateContent.path) : registryContent ? contentRegistryVersion : basename(contentTarball)}`,
      `convex=${basename(convexTarball)}`,
      `contract=${basename(contractTarball)}`,
      `betterConvexNuxt=${
        candidateBetterConvexNuxt
          ? basename(candidateBetterConvexNuxt.path)
          : registryBetterConvexNuxt
            ? betterConvexNuxtRegistryVersion
            : basename(betterConvexNuxtTarball)
      }`,
    ].join('\n'),
  )

  const releaseEvidence = {
    lane: candidateMode ? 'candidate' : registryDependencies ? 'registry' : 'development',
    dependencies: {
      '@lupinum/ginko-content': candidateContent ?? { version: contentRegistryVersion },
      'better-convex-nuxt': candidateBetterConvexNuxt ?? {
        version: betterConvexNuxtRegistryVersion,
      },
    },
    packages: Object.fromEntries(
      [contractTarball, convexTarball, cmsTarball].map((path) => [basename(path), sha256(path)]),
    ),
  }
  writeFileSync(
    join(packDir, 'release-evidence.json'),
    `${JSON.stringify(releaseEvidence, null, 2)}\n`,
  )
} finally {
  if (process.env.GINKO_KEEP_PACKAGE_E2E !== '1') {
    rmSync(tempDir, { force: true, recursive: true })
  } else {
    console.log(`kept package e2e temp dir: ${pathToFileURL(tempDir).href}`)
  }
}
