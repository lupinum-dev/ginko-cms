import { execFileSync, spawn } from 'node:child_process'
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
import { basename, join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { parse as parseYaml } from 'yaml'

const repoRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))
const compatibilityMatrix = JSON.parse(
  readFileSync(resolve(repoRoot, 'packages/cms/compatibility.json'), 'utf8'),
)
const rootPackageJson = JSON.parse(readFileSync(resolve(repoRoot, 'package.json'), 'utf8'))
const coordinatedPackageManifests = ['packages/cms', 'packages/contract', 'packages/convex'].map(
  (packageRoot) => JSON.parse(readFileSync(resolve(repoRoot, packageRoot, 'package.json'), 'utf8')),
)
const consumerCompatibility = compatibilityMatrix.consumer
const candidateMode = process.argv.includes('--candidate')
const packDir = resolve(repoRoot, candidateMode ? '.pack/candidate' : '.pack')
const tempDir = mkdtempSync(join(tmpdir(), 'ginko-cms-package-e2e-'))
const pnpmBin = process.env.npm_execpath ?? 'pnpm'
const packageManagerOption = process.argv.indexOf('--package-manager')
const consumerPackageManager =
  packageManagerOption === -1 ? 'pnpm' : process.argv[packageManagerOption + 1]
if (!['npm', 'pnpm'].includes(consumerPackageManager)) {
  throw new Error('--package-manager must be npm or pnpm.')
}
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
const siblingBetterConvexNuxtRoot = resolve(repoRoot, '../../convex/better-convex-nuxt')
const betterConvexNuxtRoot = process.env.BETTER_CONVEX_NUXT_PACKAGE_ROOT
  ? resolve(process.env.BETTER_CONVEX_NUXT_PACKAGE_ROOT)
  : existsSync(siblingBetterConvexNuxtRoot)
    ? siblingBetterConvexNuxtRoot
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

function declaredExportSpecifiers(packageManifest) {
  return Object.keys(packageManifest.exports ?? {}).map((subpath) =>
    subpath === '.' ? packageManifest.name : `${packageManifest.name}/${subpath.slice(2)}`,
  )
}

function requireCandidateArtifact(pathVariable, packageName) {
  const expected = compatibilityMatrix.releaseArtifacts[packageName]
  if (!expected?.sha256 || !expected?.sourceCommit) {
    throw new Error(`Compatibility is missing immutable release evidence for ${packageName}.`)
  }
  const evidencePath = resolve(packDir, 'candidate-artifact.json')
  if (!existsSync(evidencePath)) {
    throw new Error(
      'Candidate artifacts are missing candidate-artifact.json; run pnpm candidate:pack.',
    )
  }
  const evidence = JSON.parse(readFileSync(evidencePath, 'utf8'))
  const recorded = evidence.artifacts?.[packageName]
  if (
    recorded?.sha256 !== expected.sha256 ||
    recorded?.commit !== expected.sourceCommit ||
    typeof recorded?.tarball !== 'string'
  ) {
    throw new Error(`Candidate evidence does not match compatibility for ${packageName}.`)
  }
  const resolvedArtifact = process.env[pathVariable]
    ? resolve(process.env[pathVariable])
    : resolve(packDir, recorded.tarball)
  if (!existsSync(resolvedArtifact) || !resolvedArtifact.endsWith('.tgz')) {
    throw new Error(`${pathVariable} must reference the recorded ${packageName} .tgz file.`)
  }
  const actualHash = sha256(resolvedArtifact)
  if (actualHash !== expected.sha256) {
    throw new Error(
      `${pathVariable} SHA-256 mismatch: expected ${expected.sha256}, received ${actualHash}.`,
    )
  }
  return { path: resolvedArtifact, sha256: actualHash, commit: expected.sourceCommit }
}

const candidateContent = candidateMode
  ? requireCandidateArtifact('GINKO_CONTENT_TARBALL', '@lupinum/ginko-content')
  : undefined
const developmentContent =
  developmentMode && process.env.GINKO_CONTENT_TARBALL
    ? {
        path: resolve(process.env.GINKO_CONTENT_TARBALL),
        sha256: sha256(resolve(process.env.GINKO_CONTENT_TARBALL)),
      }
    : undefined
const candidateBetterConvexNuxt = candidateMode
  ? requireCandidateArtifact('BETTER_CONVEX_NUXT_TARBALL', 'better-convex-nuxt')
  : undefined

function packageE2eEnv() {
  const packageManagerConfig =
    consumerPackageManager === 'npm'
      ? {
          npm_config_cache: join(tempDir, '.npm-cache'),
          npm_config_legacy_peer_deps: 'false',
          npm_config_strict_peer_deps: 'true',
        }
      : {
          npm_config_confirm_modules_purge: 'false',
          npm_config_dangerously_allow_all_builds: 'true',
          npm_config_store_dir: join(tempDir, '.pnpm-store'),
          npm_config_strict_peer_deps: 'true',
          npm_config_verify_deps_before_run: 'false',
        }
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
      ...packageManagerConfig,
    }
  }

  const env = {
    ...process.env,
    ...packageManagerConfig,
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

function consumerExec(command, args = []) {
  if (consumerPackageManager === 'pnpm') {
    run('pnpm', ['exec', command, ...args], { cwd: tempDir })
  } else {
    run('npm', ['exec', '--', command, ...args], { cwd: tempDir })
  }
}

function consumerExecExpectFailure(command, args, expectedMessages) {
  const executable = consumerPackageManager === 'pnpm' ? pnpmBin : 'npm'
  const commandArgs =
    consumerPackageManager === 'pnpm'
      ? ['exec', command, ...args]
      : ['exec', '--', command, ...args]
  let result
  try {
    execFileSync(executable, commandArgs, {
      cwd: tempDir,
      env: packageE2eEnv(),
      encoding: 'utf8',
      stdio: 'pipe',
    })
    throw new Error(`${command} unexpectedly succeeded.`)
  } catch (error) {
    if (!error || typeof error !== 'object' || !('status' in error)) throw error
    result = `${error.stdout ?? ''}${error.stderr ?? ''}`
  }
  for (const expected of expectedMessages) {
    if (!result.includes(expected)) {
      throw new Error(`${command} failure did not include ${JSON.stringify(expected)}:\n${result}`)
    }
  }
}

async function bootNitro() {
  const port = 41_000 + (process.pid % 10_000)
  const child = spawn(process.execPath, ['.output/server/index.mjs'], {
    cwd: tempDir,
    env: {
      ...packageE2eEnv(),
      CONVEX_URL: 'http://127.0.0.1:3210',
      CONVEX_SITE_URL: 'http://127.0.0.1:3211',
      HOST: '127.0.0.1',
      NUXT_PUBLIC_CONVEX_URL: 'http://127.0.0.1:3210',
      NUXT_PUBLIC_CONVEX_SITE_URL: 'http://127.0.0.1:3211',
      PORT: String(port),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let output = ''
  child.stdout.on('data', (chunk) => (output += chunk))
  child.stderr.on('data', (chunk) => (output += chunk))
  try {
    const deadline = Date.now() + 30_000
    let ready = false
    while (Date.now() < deadline) {
      if (child.exitCode !== null) {
        throw new Error(`Packed Nitro server exited before readiness:\n${output}`)
      }
      try {
        const response = await fetch(`http://127.0.0.1:${port}/api/convex-alias-smoke`)
        const body = await response.json()
        if (!response.ok || body?.ok !== true) {
          throw new Error(`Packed Nitro smoke returned ${response.status}: ${JSON.stringify(body)}`)
        }
        ready = true
        break
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 200))
      }
    }
    if (!ready) {
      throw new Error(`Timed out waiting for packed Nitro server:\n${output}`)
    }

    const renderResponse = await fetch(`http://127.0.0.1:${port}/render-safety`)
    const renderBody = await renderResponse.text()
    if (
      renderResponse.status < 500 ||
      renderBody.includes('packed-render-exploit') ||
      !renderBody.includes('Public Markdown AST is not render-safe.')
    ) {
      throw new Error(
        `Packed Content renderer did not fail closed (${renderResponse.status}): ${renderBody}`,
      )
    }
  } finally {
    child.kill('SIGTERM')
  }
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
  if (developmentMode && !registryContent && !developmentContent) {
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
  const localPath = relative(tempDir, path)
  return localPath && !localPath.startsWith('..') ? `file:./${localPath}` : `file:${path}`
}

function contentAddressedCopy(path) {
  const artifactDir = join(tempDir, 'artifacts')
  const target = join(artifactDir, `${sha256(path)}.tgz`)
  mkdirSync(artifactDir, { recursive: true })
  copyFileSync(path, target)
  return target
}

function contentDependency(contentTarball) {
  return registryContent ? contentRegistryVersion : fileDependency(contentTarball)
}

function betterConvexNuxtDependency(betterConvexNuxtTarball) {
  if (candidateBetterConvexNuxt) return fileDependency(candidateBetterConvexNuxt.path)
  return registryBetterConvexNuxt
    ? betterConvexNuxtRegistryVersion
    : fileDependency(betterConvexNuxtTarball)
}

function assertCandidateLockfile(lockfileText, expectedSpecifiers) {
  const lockfile = parseYaml(lockfileText)
  const rootImporter = lockfile?.importers?.['.']
  if (!rootImporter) {
    throw new Error('Candidate consumer lockfile is missing its root importer.')
  }

  for (const [name, expectedSpecifier] of Object.entries(expectedSpecifiers)) {
    const dependency = rootImporter.dependencies?.[name] ?? rootImporter.devDependencies?.[name]
    const normalizeFileSpecifier = (value) => value?.replace(/^file:\.\//, 'file:')
    if (
      normalizeFileSpecifier(dependency?.specifier) !== normalizeFileSpecifier(expectedSpecifier)
    ) {
      throw new Error(
        `Candidate lockfile resolves ${name} from ${dependency?.specifier ?? 'missing'}; expected ${expectedSpecifier}.`,
      )
    }

    for (const sectionName of ['packages', 'snapshots']) {
      for (const key of Object.keys(lockfile?.[sectionName] ?? {})) {
        if (key.startsWith(`${name}@`) && !key.startsWith(`${name}@file:`)) {
          throw new Error(
            `Candidate lockfile contains non-tarball ${name} resolution in ${sectionName}: ${key}.`,
          )
        }
      }
    }
  }
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
    'strictPeerDependencies: true',
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
  if (!candidateMode) {
    buildPackedPackages()

    rmSync(packDir, { force: true, recursive: true })
    mkdirSync(packDir, { recursive: true })

    packPackage('packages/contract')
    packPackage('packages/convex')
    packPackage('packages/cms')
    if (developmentMode && !registryContent && !developmentContent) {
      packPackage(contentRoot)
    }
    if (developmentMode && !registryBetterConvexNuxt) {
      packPackage(betterConvexNuxtRoot)
    }
  }

  const packedContractTarball = findTarball('lupinum/ginko-cms-contract')
  const packedConvexTarball = findTarball('lupinum/ginko-cms-convex')
  const packedCmsTarball = findTarball('lupinum/ginko-cms')
  const contentTarball = registryContent
    ? undefined
    : (candidateContent?.path ?? developmentContent?.path ?? findTarball('lupinum/ginko-content'))
  const betterConvexNuxtTarball =
    registryBetterConvexNuxt || candidateBetterConvexNuxt
      ? undefined
      : findTarball('better-convex-nuxt')

  if (candidateMode) {
    const evidencePath = resolve(packDir, 'candidate-artifact.json')
    if (!existsSync(evidencePath)) {
      throw new Error(
        'Candidate artifacts are missing candidate-artifact.json; run pnpm candidate:pack.',
      )
    }
    const evidence = JSON.parse(readFileSync(evidencePath, 'utf8'))
    const currentCommit = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: repoRoot,
      encoding: 'utf8',
    }).trim()
    const currentStatus = execFileSync(
      'git',
      ['status', '--porcelain', '--untracked-files=normal'],
      { cwd: repoRoot, encoding: 'utf8' },
    ).trim()
    if (currentStatus) {
      throw new Error(`Candidate verification requires a clean CMS repository:\n${currentStatus}`)
    }
    if (evidence.source?.dirty !== false || evidence.source?.commit !== currentCommit) {
      throw new Error('Candidate evidence does not describe the current clean CMS commit.')
    }
    for (const [name, path] of [
      ['@lupinum/ginko-cms-contract', packedContractTarball],
      ['@lupinum/ginko-cms-convex', packedConvexTarball],
      ['@lupinum/ginko-cms', packedCmsTarball],
    ]) {
      if (evidence.artifacts?.[name]?.sha256 !== sha256(path)) {
        throw new Error(`Candidate ${name} hash does not match candidate-artifact.json.`)
      }
    }
  } else {
    run('node', ['scripts/check-pack-workspace-refs.mjs'])
  }

  // pnpm caches file dependencies by path and version. Hash-named copies ensure
  // the consumer always installs the bytes packed by this verification run.
  const contractTarball = contentAddressedCopy(packedContractTarball)
  const convexTarball = contentAddressedCopy(packedConvexTarball)
  const cmsTarball = contentAddressedCopy(packedCmsTarball)
  const installedContentTarball = contentTarball ? contentAddressedCopy(contentTarball) : undefined

  writeFileSync(
    join(tempDir, 'package.json'),
    JSON.stringify(
      {
        private: true,
        name: 'ginko-cms-package-e2e-consumer',
        packageManager:
          consumerPackageManager === 'pnpm'
            ? rootPackageJson.packageManager
            : `npm@${execFileSync('npm', ['--version'], { encoding: 'utf8' }).trim()}`,
        type: 'module',
        dependencies: {
          ...consumerCompatibility.dependencies,
          '@lupinum/ginko-cms': fileDependency(cmsTarball),
          '@lupinum/ginko-cms-contract': fileDependency(contractTarball),
          '@lupinum/ginko-cms-convex': fileDependency(convexTarball),
          '@lupinum/ginko-content': contentDependency(installedContentTarball),
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

  if (consumerPackageManager === 'pnpm') {
    writeConsumerWorkspaceConfig(tempDir, {
      '@lupinum/ginko-cms': fileDependency(cmsTarball),
      '@lupinum/ginko-cms-contract': fileDependency(contractTarball),
      '@lupinum/ginko-cms-convex': fileDependency(convexTarball),
      '@lupinum/ginko-content': contentDependency(installedContentTarball),
      '@nuxt/kit': consumerCompatibility.dependencies['@nuxt/kit'],
      '@nuxtjs/mcp-toolkit': compatibilityMatrix.tracked['@nuxtjs/mcp-toolkit'][1],
      'better-convex-nuxt': betterConvexNuxtDependency(betterConvexNuxtTarball),
      convex: consumerCompatibility.dependencies.convex,
      'secure-exec': compatibilityMatrix.tracked['secure-exec'][1],
    })
  }

  writeFileSync(
    join(tempDir, 'nuxt.config.ts'),
    [
      "import { addTemplate, defineNuxtModule } from 'nuxt/kit'",
      "import ginkoCms from '@lupinum/ginko-cms'",
      '',
      'const contentRendererHarness = defineNuxtModule({',
      '  setup(_options, nuxt) {',
      "    Object.assign(nuxt.options, { content: { search: { engine: 'provider' }, sitemap: false } })",
      '    addTemplate({',
      "      filename: 'content-i18n.mjs',",
      "      getContents: () => \"export const useLocalePath = () => (route) => typeof route === 'string' ? route : ''\",",
      '    })',
      '  },',
      '})',
      '',
      'export default defineNuxtConfig({',
      '  modules: [contentRendererHarness, ginkoCms],',
      '  components: [{',
      "    path: './node_modules/@lupinum/ginko-content/dist/runtime/app/components',",
      '    pathPrefix: false,',
      "    prefix: '',",
      '    global: true,',
      "    ignore: ['Prose/**', 'internal/**'],",
      '  }],',
      "  convex: { url: 'http://127.0.0.1:3210', siteUrl: 'http://127.0.0.1:3211', auth: { publicOrigin: 'http://localhost:3000' } },",
      "  nitro: { externals: { inline: ['@lupinum/ginko-cms'] } },",
      '  ginkoCms: {',
      '    mcp: false,',
      '  },',
      '})',
      '',
    ].join('\n'),
    'utf8',
  )

  writeFileSync(
    join(tempDir, 'content.config.ts'),
    "export default { provider: 'cms', collections: { pages: { type: 'page', source: 'content/**/*.md' } } }\n",
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

  if (!liveConvex) {
    writeFileSync(
      join(tempDir, '.env.local'),
      'CONVEX_URL=http://127.0.0.1:3210\nCONVEX_SITE_URL=http://127.0.0.1:3211\n',
      'utf8',
    )
  }

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

  mkdirSync(join(tempDir, 'pages'), { recursive: true })
  writeFileSync(
    join(tempDir, 'pages/render-safety.vue'),
    [
      '<script setup lang="ts">',
      "const value = { collection: 'posts', locale: 'en', body: { type: 'root', children: [{ type: 'element', tag: 'script', props: {}, children: [{ type: 'text', value: 'packed-render-exploit' }] }] } }",
      '</script>',
      '<template><ContentRenderer :value="value" /></template>',
      '',
    ].join('\n'),
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

  if (consumerPackageManager === 'pnpm') {
    run('pnpm', ['install', '--ignore-scripts'], { cwd: tempDir })
  } else {
    run('npm', ['install', '--ignore-scripts', '--strict-peer-deps'], { cwd: tempDir })
  }

  const installedVersions = Object.fromEntries(
    [
      ['@lupinum/ginko-content', 'node_modules/@lupinum/ginko-content/package.json'],
      ['better-convex-nuxt', 'node_modules/better-convex-nuxt/package.json'],
    ].map(([name, path]) => [name, JSON.parse(readFileSync(join(tempDir, path), 'utf8')).version]),
  )
  const expectedInstalledVersions = {
    '@lupinum/ginko-content': contentRegistryVersion,
    'better-convex-nuxt': betterConvexNuxtRegistryVersion,
  }
  for (const [name, version] of Object.entries(installedVersions)) {
    if (version !== expectedInstalledVersions[name]) {
      throw new Error(
        `Installed ${name}@${version}; expected ${expectedInstalledVersions[name]} from the configured package stack.`,
      )
    }
  }
  const lockfilePath = join(
    tempDir,
    consumerPackageManager === 'pnpm' ? 'pnpm-lock.yaml' : 'package-lock.json',
  )
  const consumerLockfile = readFileSync(lockfilePath, 'utf8')
  if (/\b(?:link|workspace):/.test(consumerLockfile)) {
    throw new Error('Candidate consumer lockfile contains a workspace or link dependency.')
  }
  if (candidateMode && consumerPackageManager === 'pnpm') {
    assertCandidateLockfile(consumerLockfile, {
      '@lupinum/ginko-cms': fileDependency(cmsTarball),
      '@lupinum/ginko-cms-contract': fileDependency(contractTarball),
      '@lupinum/ginko-cms-convex': fileDependency(convexTarball),
      '@lupinum/ginko-content': fileDependency(installedContentTarball),
      'better-convex-nuxt': fileDependency(candidateBetterConvexNuxt.path),
    })
  }
  if (candidateMode && consumerPackageManager === 'npm') {
    const lockfile = JSON.parse(consumerLockfile)
    for (const name of [
      '@lupinum/ginko-cms',
      '@lupinum/ginko-cms-contract',
      '@lupinum/ginko-cms-convex',
      '@lupinum/ginko-content',
      'better-convex-nuxt',
    ]) {
      const suffix = `node_modules/${name}`
      const matches = Object.keys(lockfile.packages ?? {}).filter(
        (path) => path === suffix || path.endsWith(`/${suffix}`),
      )
      if (matches.length !== 1 || !lockfile.packages[matches[0]]?.resolved?.startsWith('file:')) {
        throw new Error(
          `npm candidate lockfile does not contain one exact file resolution for ${name}.`,
        )
      }
    }
  }
  consumerExec('ginko-cms', ['init'])
  consumerExecExpectFailure(
    'ginko-cms',
    ['doctor'],
    ['convex/ginkoCms/contractBinding.ts is still unbound', 'pnpm exec ginko-cms deploy'],
  )
  consumerExec('convex', ['codegen', '--system-udfs', '--typecheck', 'disable'])
  addOfflineComponentsStub(tempDir)

  for (const relativePath of [
    'convex/auth.ts',
    'convex/auth.config.ts',
    'convex/convex.config.ts',
    'convex/http.ts',
    'convex/schema.ts',
    'convex/ginkoCms/agentRuns.ts',
    'convex/ginkoCms/assets.ts',
    'convex/ginkoCms/assetRecovery.ts',
    'convex/ginkoCms/collections.ts',
    'convex/ginkoCms/diagnostics.ts',
    'convex/ginkoCms/editor.ts',
    'convex/ginkoCms/mcpCredentials.ts',
    'convex/ginkoCms/maintenance.ts',
    'convex/ginkoCms/members.ts',
    'convex/ginkoCms/contractTransitions.ts',
    'convex/ginkoCms/portability.ts',
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

  consumerExec('nuxt', ['prepare'])
  consumerExec('nuxt', ['typecheck'])
  consumerExec('nuxt', ['build'])
  await bootNitro()
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

  const exportSpecifiers = coordinatedPackageManifests.flatMap(declaredExportSpecifiers)
  const importCheck = [
    ...exportSpecifiers.map((specifier) => `await import(${JSON.stringify(specifier)})`),
    "console.log('package imports ok')",
  ].join(';')

  run('node', ['--input-type=module', '--eval', importCheck], { cwd: tempDir })
  mkdirSync(join(tempDir, 'scripts'), { recursive: true })
  copyFileSync(
    resolve(repoRoot, 'scripts/packed-content-safety-probe.mjs'),
    join(tempDir, 'scripts/packed-content-safety-probe.mjs'),
  )
  run('node', ['scripts/packed-content-safety-probe.mjs'], { cwd: tempDir })

  writeFileSync(
    join(tempDir, 'package-export-types.ts'),
    `${exportSpecifiers
      .map(
        (specifier, index) => `import type * as Export${index} from ${JSON.stringify(specifier)}`,
      )
      .join('\n')}\nexport {}\n`,
  )
  consumerExec('tsc', [
    '--noEmit',
    '--module',
    'NodeNext',
    '--moduleResolution',
    'NodeNext',
    '--skipLibCheck',
    '--target',
    'ES2022',
    'package-export-types.ts',
  ])

  const privateImportCheck = [
    "const blocked = ['@lupinum/ginko-cms/private', '@lupinum/ginko-cms-contract/private', '@lupinum/ginko-cms-convex/_generated/component.js']",
    "for (const specifier of blocked) { try { await import(specifier); throw new Error(`Private import unexpectedly resolved: ${specifier}`) } catch (error) { if (String(error?.code) !== 'ERR_PACKAGE_PATH_NOT_EXPORTED') throw error } }",
  ].join(';')
  run('node', ['--input-type=module', '--eval', privateImportCheck], { cwd: tempDir })

  const portabilityCheck = [
    "import { buildResolvedContentContract } from '@lupinum/ginko-content/cms-contract'",
    "import { writePortableDirectory } from '@lupinum/ginko-content/portability/node'",
    "const contract = buildResolvedContentContract({ collections: { posts: { type: 'page', source: 'content/posts/**/*.md', route: '/posts', fields: { title: { type: 'text', required: true } } } } }, { defaultLocale: 'en', locales: ['en'] })",
    "const document = { format: 'ginko-content-document', version: 1, collection: 'posts', canonicalKey: 'packed-check', locale: 'en', slug: 'packed-check', parentCanonicalKey: null, order: null, shared: { title: 'Packed check' }, localized: {}, body: { kind: 'mdc', source: '# Packed check\\n' }, visibility: { navigation: true, search: true, ['site' + 'map']: true } }",
    "await writePortableDirectory('portable-check', { contract, documents: [document], assets: [] })",
  ].join(';')
  run('node', ['--input-type=module', '--eval', portabilityCheck], { cwd: tempDir })
  consumerExec('ginko-cms', ['content', 'verify', 'portable-check'])

  console.log(
    [
      `package e2e ${consumerPackageManager} ok`,
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
    packageManager: consumerPackageManager,
    lockfileSha256: sha256(lockfilePath),
    dependencies: {
      '@lupinum/ginko-content': candidateContent ??
        developmentContent ?? { version: contentRegistryVersion },
      'better-convex-nuxt':
        candidateBetterConvexNuxt ??
        (betterConvexNuxtTarball
          ? { path: betterConvexNuxtTarball, sha256: sha256(betterConvexNuxtTarball) }
          : { version: betterConvexNuxtRegistryVersion }),
    },
    packages: Object.fromEntries(
      [contractTarball, convexTarball, cmsTarball].map((path) => [basename(path), sha256(path)]),
    ),
  }
  writeFileSync(
    join(packDir, `release-evidence-${consumerPackageManager}.json`),
    `${JSON.stringify(releaseEvidence, null, 2)}\n`,
  )
} finally {
  if (process.env.GINKO_KEEP_PACKAGE_E2E !== '1') {
    rmSync(tempDir, { force: true, recursive: true })
  } else {
    console.log(`kept package e2e temp dir: ${pathToFileURL(tempDir).href}`)
  }
}
