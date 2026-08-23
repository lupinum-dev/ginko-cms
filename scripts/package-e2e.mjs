import { execFileSync, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  appendFileSync,
  cpSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { basename, join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { parse as parseYaml } from 'yaml'

import { validateDisposableConvexDeployment } from './disposable-convex-deployment.mjs'

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
const candidateArtifactPath = resolve(packDir, 'candidate-artifact.json')
const candidateArtifact = candidateMode
  ? JSON.parse(readFileSync(candidateArtifactPath, 'utf8'))
  : undefined
const tempDir = mkdtempSync(join(tmpdir(), 'ginko-cms-package-e2e-'))
const pnpmBin = 'pnpm'
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
const siblingBetterConvexNuxtRoot = resolve(repoRoot, '../../convex/better-convex-nuxt')
const betterConvexNuxtRoot = process.env.BETTER_CONVEX_NUXT_PACKAGE_ROOT
  ? resolve(process.env.BETTER_CONVEX_NUXT_PACKAGE_ROOT)
  : existsSync(siblingBetterConvexNuxtRoot)
    ? siblingBetterConvexNuxtRoot
    : undefined
const betterConvexMcpRoot = betterConvexNuxtRoot
  ? resolve(betterConvexNuxtRoot, 'packages/mcp')
  : undefined
const liveConvex = process.argv.includes('--live')
let liveDeploymentEvidence = null
let livePublishedReadEvidence = null
const registryContent = registryDependencies || developmentMode
const registryBetterConvexNuxt = registryDependencies || (developmentMode && !betterConvexNuxtRoot)
const registryBetterConvexVue = registryBetterConvexNuxt
const registryBetterConvexMcp = registryDependencies || (developmentMode && !betterConvexMcpRoot)
const contentRegistryVersion =
  process.env.GINKO_CONTENT_PACKAGE_VERSION ||
  compatibilityMatrix.releaseStack['@lupinum/ginko-content']
const betterConvexNuxtRegistryVersion =
  process.env.BETTER_CONVEX_NUXT_PACKAGE_VERSION ||
  compatibilityMatrix.releaseStack['@lupinum/better-convex-nuxt']
const betterConvexVueRegistryVersion =
  process.env.BETTER_CONVEX_VUE_PACKAGE_VERSION ||
  compatibilityMatrix.releaseStack['@lupinum/better-convex-vue']
const betterConvexMcpRegistryVersion =
  process.env.BETTER_CONVEX_MCP_PACKAGE_VERSION ||
  compatibilityMatrix.releaseStack['@lupinum/better-convex-mcp']

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

function declaredExportSpecifiers(packageManifest) {
  return Object.keys(packageManifest.exports ?? {}).map((subpath) =>
    subpath === '.' ? packageManifest.name : `${packageManifest.name}/${subpath.slice(2)}`,
  )
}

function assertBuildOnlyArchiveGraphIsAbsent(outputRoot) {
  const serverRoot = resolve(outputRoot, 'server')
  const buildOnlyPackages = [
    'archiver',
    'archiver-utils',
    'brace-expansion',
    'glob',
    'minimatch',
    'readdir-glob',
  ]
  const manifest = JSON.parse(readFileSync(resolve(serverRoot, 'package.json'), 'utf8'))
  for (const packageName of buildOnlyPackages) {
    if (manifest.dependencies?.[packageName]) {
      throw new Error(`Built server retains build-only dependency ${packageName}.`)
    }
  }

  const directories = [serverRoot]
  while (directories.length) {
    const directory = directories.pop()
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name)
      if (entry.isDirectory()) {
        directories.push(path)
        continue
      }
      // Package metadata and source maps can legitimately describe globbing (for
      // example, picomatch lists `glob` as a keyword). The generated server
      // manifest above is the source of truth for external runtime packages;
      // this scan only needs to catch a build-only package retained in
      // executable server code.
      if (!entry.isFile() || !/\.(?:c?js|mjs)$/u.test(entry.name)) continue
      const contents = readFileSync(path, 'utf8')
      const retainedPackage = buildOnlyPackages.find((packageName) =>
        [`"${packageName}"`, `'${packageName}'`, `node_modules/${packageName}/`].some((marker) =>
          contents.includes(marker),
        ),
      )
      if (retainedPackage) {
        throw new Error(
          `Built server retains build-only package marker ${retainedPackage} in ${relative(outputRoot, path)}.`,
        )
      }
    }
  }
  console.log('built server excludes the Nitro build-only glob/archive dependency graph')
}

function requireCandidateArtifact(pathVariable, packageName) {
  const expected = compatibilityMatrix.releaseArtifacts[packageName]
  if (!expected?.sha256 || (!expected?.sourceCommit && !expected?.registry)) {
    throw new Error(`Compatibility is missing immutable release evidence for ${packageName}.`)
  }
  if (!existsSync(candidateArtifactPath)) {
    throw new Error(
      'Candidate artifacts are missing candidate-artifact.json; run pnpm candidate:pack.',
    )
  }
  const recorded = candidateArtifact?.artifacts?.[packageName]
  if (
    recorded?.sha256 !== expected.sha256 ||
    (expected.sourceCommit && recorded?.commit !== expected.sourceCommit) ||
    (expected.registry && recorded?.registry !== expected.registry) ||
    (expected.integrity && recorded?.integrity !== expected.integrity) ||
    (expected.runtimeFingerprint && recorded?.runtimeFingerprint !== expected.runtimeFingerprint) ||
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
  return {
    path: resolvedArtifact,
    sha256: actualHash,
    ...(expected.sourceCommit ? { commit: expected.sourceCommit } : {}),
    ...(expected.registry ? { registry: expected.registry } : {}),
  }
}

const candidateContent = candidateMode
  ? requireCandidateArtifact('GINKO_CONTENT_TARBALL', '@lupinum/ginko-content')
  : undefined
const candidateBetterConvexNuxt = candidateMode
  ? requireCandidateArtifact('BETTER_CONVEX_NUXT_TARBALL', '@lupinum/better-convex-nuxt')
  : undefined
const candidateBetterConvexVue = candidateMode
  ? requireCandidateArtifact('BETTER_CONVEX_VUE_TARBALL', '@lupinum/better-convex-vue')
  : undefined
const candidateBetterConvexMcp = candidateMode
  ? requireCandidateArtifact('BETTER_CONVEX_MCP_TARBALL', '@lupinum/better-convex-mcp')
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
  const resolvedArgs = command === 'pnpm' ? ['--config.verify-deps-before-run=warn', ...args] : args
  execFileSync(resolvedCommand, resolvedArgs, {
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

function materializeOfflineContentContract() {
  const script = [
    "import { mkdir, writeFile } from 'node:fs/promises'",
    "import { buildResolvedContentContract } from '@lupinum/ginko-content/cms-contract'",
    "const contract = buildResolvedContentContract({ collections: { pages: { type: 'page', source: 'content/**/*.md' } } }, { defaultLocale: 'en', locales: ['en'] })",
    "await mkdir('.ginko', { recursive: true })",
    "await writeFile('.ginko/content-contract.json', JSON.stringify(contract) + '\\n')",
  ].join(';')
  run('node', ['--input-type=module', '--eval', script], { cwd: tempDir })
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
  const convexUrl = liveConvex
    ? process.env.CONVEX_URL || process.env.CONVEX_SELF_HOSTED_URL
    : 'http://127.0.0.1:3210'
  const convexSiteUrl = liveConvex
    ? process.env.CONVEX_SITE_URL || process.env.CONVEX_SELF_HOSTED_URL
    : 'http://127.0.0.1:3211'
  if (!convexUrl || !convexSiteUrl) {
    throw new Error('Packed Nitro live verification requires real Convex runtime URLs.')
  }
  const child = spawn(process.execPath, ['.output/server/index.mjs'], {
    cwd: tempDir,
    env: {
      ...packageE2eEnv(),
      CONVEX_URL: convexUrl,
      CONVEX_SITE_URL: convexSiteUrl,
      HOST: '127.0.0.1',
      NUXT_PUBLIC_CONVEX_URL: convexUrl,
      NUXT_PUBLIC_CONVEX_SITE_URL: convexSiteUrl,
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

    if (liveConvex) {
      const publishedReadResponse = await fetch(
        `http://127.0.0.1:${port}/api/_content/navigation?collection=posts&locale=en`,
      )
      const publishedReadText = await publishedReadResponse.text()
      let publishedRead
      try {
        publishedRead = JSON.parse(publishedReadText)
      } catch {
        throw new Error(
          `Packed live Content read returned non-JSON (${publishedReadResponse.status}): ${publishedReadText.slice(0, 300)}`,
        )
      }
      if (!publishedReadResponse.ok || !Array.isArray(publishedRead)) {
        throw new Error(
          `Packed live Content read failed (${publishedReadResponse.status}): ${publishedReadText.slice(0, 300)}`,
        )
      }
      livePublishedReadEvidence = {
        collection: 'posts',
        locale: 'en',
        resultCount: publishedRead.length,
        status: publishedReadResponse.status,
      }
    }

    if (candidateMode) {
      const attestationResponse = await fetch(
        `http://127.0.0.1:${port}/.well-known/ginko-cms-candidate.json`,
      )
      const attestation = await attestationResponse.json()
      if (
        !attestationResponse.ok ||
        attestation?.schemaVersion !== 1 ||
        attestation?.sourceCommit !== candidateArtifact.source.commit
      ) {
        throw new Error(
          `Packed candidate attestation is invalid (${attestationResponse.status}): ${JSON.stringify(attestation)}`,
        )
      }
      for (const [name, artifact] of Object.entries(candidateArtifact.artifacts)) {
        const actual = attestation.packages?.[name]
        if (
          actual?.version !== artifact.version ||
          actual?.commit !== artifact.commit ||
          actual?.sha256 !== artifact.sha256 ||
          actual?.runtimeFingerprint !== artifact.runtimeFingerprint
        ) {
          throw new Error(`Packed candidate attestation does not match ${name}.`)
        }
      }
      const expectedFingerprint =
        compatibilityMatrix.releaseArtifacts['@lupinum/better-convex-nuxt'].runtimeFingerprint
      const fingerprintResponse = await fetch(
        `http://127.0.0.1:${port}/api/_better-convex-nuxt/release-fingerprint`,
      )
      const fingerprint = await fingerprintResponse.json()
      if (
        !fingerprintResponse.ok ||
        fingerprint?.schemaVersion !== 1 ||
        fingerprint?.runtimeFingerprint !== expectedFingerprint
      ) {
        throw new Error(
          `Packed Better Convex Nuxt runtime fingerprint is invalid (${fingerprintResponse.status}): ${JSON.stringify(fingerprint)}`,
        )
      }
    }

    if (liveConvex) {
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
    }
  } finally {
    child.kill('SIGTERM')
  }
}

function packPackage(packageDir) {
  run('pnpm', ['pack', '--config.ignore-scripts=true', '--pack-destination', packDir], {
    cwd: resolve(repoRoot, packageDir),
  })
}

function buildPackedPackages() {
  run('pnpm', ['--filter', '@lupinum/ginko-cms', 'build'])
  if (developmentMode && betterConvexNuxtRoot) {
    run('pnpm', ['run', 'build:package'], { cwd: betterConvexNuxtRoot })
  }
  if (developmentMode && betterConvexMcpRoot) {
    run('pnpm', ['run', 'build'], { cwd: betterConvexMcpRoot })
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

function betterConvexVueDependency(betterConvexVueTarball) {
  if (candidateBetterConvexVue) return fileDependency(candidateBetterConvexVue.path)
  return registryBetterConvexVue
    ? betterConvexVueRegistryVersion
    : fileDependency(betterConvexVueTarball)
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
    if (developmentMode && !registryBetterConvexNuxt) {
      packPackage(betterConvexNuxtRoot)
      packPackage(resolve(betterConvexNuxtRoot, 'packages/vue'))
      packPackage(betterConvexMcpRoot)
    }
  }

  const packedContractTarball = findTarball('lupinum/ginko-cms-contract')
  const packedConvexTarball = findTarball('lupinum/ginko-cms-convex')
  const packedCmsTarball = findTarball('lupinum/ginko-cms')
  const contentTarball = registryContent ? undefined : candidateContent?.path
  const betterConvexNuxtTarball =
    registryBetterConvexNuxt || candidateBetterConvexNuxt
      ? undefined
      : findTarball('better-convex-nuxt')
  const betterConvexVueTarball =
    registryBetterConvexVue || candidateBetterConvexVue
      ? undefined
      : findTarball('better-convex-vue')
  const betterConvexMcpTarball =
    registryBetterConvexMcp || candidateBetterConvexMcp
      ? undefined
      : findTarball('better-convex-mcp')

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
  const installedBetterConvexMcpTarball =
    (candidateBetterConvexMcp?.path ?? betterConvexMcpTarball)
      ? contentAddressedCopy(candidateBetterConvexMcp?.path ?? betterConvexMcpTarball)
      : undefined

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
          ...(liveConvex
            ? {
                '@nuxtjs/sitemap': compatibilityMatrix.tracked['@nuxtjs/sitemap'][1],
                'nuxt-i18n-micro': compatibilityMatrix.tracked['nuxt-i18n-micro'][0],
              }
            : {}),
          '@lupinum/ginko-cms': fileDependency(cmsTarball),
          '@lupinum/ginko-cms-contract': fileDependency(contractTarball),
          '@lupinum/ginko-cms-convex': fileDependency(convexTarball),
          '@lupinum/ginko-content': contentDependency(installedContentTarball),
          '@lupinum/better-convex-mcp': registryBetterConvexMcp
            ? betterConvexMcpRegistryVersion
            : fileDependency(installedBetterConvexMcpTarball),
          '@lupinum/better-convex-nuxt': betterConvexNuxtDependency(betterConvexNuxtTarball),
          '@lupinum/better-convex-vue': betterConvexVueDependency(betterConvexVueTarball),
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
      '@lupinum/better-convex-mcp': registryBetterConvexMcp
        ? betterConvexMcpRegistryVersion
        : fileDependency(installedBetterConvexMcpTarball),
      '@nuxt/kit': consumerCompatibility.dependencies['@nuxt/kit'],
      ...(liveConvex
        ? {
            '@nuxtjs/sitemap': compatibilityMatrix.tracked['@nuxtjs/sitemap'][1],
            'nuxt-i18n-micro': compatibilityMatrix.tracked['nuxt-i18n-micro'][0],
          }
        : {}),
      '@lupinum/better-convex-nuxt': betterConvexNuxtDependency(betterConvexNuxtTarball),
      '@lupinum/better-convex-vue': betterConvexVueDependency(betterConvexVueTarball),
      convex: consumerCompatibility.dependencies.convex,
    })
  }

  writeFileSync(
    join(tempDir, 'nuxt.config.ts'),
    [
      "import { defineNuxtModule } from 'nuxt/kit'",
      "import ginkoCms from '@lupinum/ginko-cms'",
      '',
      'const contentOptionsHarness = defineNuxtModule({',
      '  setup(_options, nuxt) {',
      "    Object.assign(nuxt.options, { content: { search: { engine: 'provider' }, sitemap: false } })",
      '  },',
      '})',
      '',
      'export default defineNuxtConfig({',
      "  compatibilityDate: '2026-08-23',",
      liveConvex
        ? "  modules: ['@nuxtjs/sitemap', 'nuxt-i18n-micro', '@lupinum/ginko-content', ginkoCms],"
        : '  modules: [contentOptionsHarness, ginkoCms],',
      "  convex: { url: process.env.CONVEX_URL || 'http://127.0.0.1:3210', siteUrl: process.env.CONVEX_SITE_URL || 'http://127.0.0.1:3211', auth: { origin: process.env.CMS_STORY_BASE_URL || 'http://localhost:3000', trustedClientIpHeader: process.env.BCN_AUTH_TRUSTED_CLIENT_IP_HEADER } },",
      ...(liveConvex
        ? [
            "  site: { url: process.env.CMS_STORY_SITE_URL || 'https://candidate.ginko.invalid' },",
            "  i18n: { autoDetectLanguage: false, defaultLocale: 'en', disablePageLocales: true, locales: [{ code: 'en', iso: 'en-US', name: 'English', seo: false }, { code: 'de', iso: 'de-DE', name: 'Deutsch', seo: false }, { code: 'fr', iso: 'fr-FR', name: 'Français', seo: false }], localeCookie: null, redirects: false },",
          ]
        : []),
      ...(liveConvex
        ? [
            "  content: { i18n: { defaultLocale: 'en', locales: ['en', 'de', 'fr'] }, search: { engine: 'provider', collections: ['blog', 'docs'] } },",
            "  routeRules: { '/render-safety': { prerender: false } },",
          ]
        : []),
      "  nitro: { externals: { inline: ['@lupinum/ginko-cms'] } },",
      '  ginkoCms: {',
      `    mcp: ${liveConvex ? 'true' : 'false'},`,
      '  },',
      '})',
      '',
    ].join('\n'),
    'utf8',
  )

  writeFileSync(
    join(tempDir, 'content.config.ts'),
    liveConvex
      ? [
          "import { defineCollection, defineContentConfig } from '@lupinum/ginko-content/config'",
          "const blog = defineCollection({ type: 'page', source: 'content/blog/**/*.md', route: '/blog', i18n: true, cms: { fields: { featured: { type: 'toggle', localized: false }, relatedDoc: { type: 'relation', localized: false, relation: { collectionId: 'docs', multiple: false } } } } })",
          "const docs = defineCollection({ type: 'page', source: 'content/docs/**/*.md', route: '/docs', i18n: true, cms: { type: 'tree', fields: { description: { type: 'textarea' } } } })",
          "const authors = defineCollection({ type: 'data', source: 'content/authors/**/*.yml', cms: { route: { mode: 'none' }, fields: { name: { type: 'text', required: true }, bio: { type: 'textarea' } } } })",
          "export default defineContentConfig({ provider: 'cms', collections: { blog, docs, authors } })",
          '',
        ].join('\n')
      : "export default { provider: 'cms', collections: { pages: { type: 'page', source: 'content/**/*.md' } } }\n",
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
    const hasConfiguredDeployment = Boolean(
      process.env.CONVEX_DEPLOYMENT && process.env.CONVEX_URL && process.env.CONVEX_DEPLOY_KEY,
    )
    const hasSelfHostedDeployment = Boolean(
      process.env.CONVEX_SELF_HOSTED_URL && process.env.CONVEX_SELF_HOSTED_ADMIN_KEY,
    )
    if (!hasConfiguredDeployment && !hasSelfHostedDeployment) {
      throw new Error(
        'package:e2e --live requires either CONVEX_DEPLOYMENT plus CONVEX_URL and CONVEX_DEPLOY_KEY, or CONVEX_SELF_HOSTED_URL plus CONVEX_SELF_HOSTED_ADMIN_KEY, for a disposable deployment.',
      )
    }
    if (hasConfiguredDeployment) {
      const { deployment, deploymentName } = validateDisposableConvexDeployment(process.env)
      liveDeploymentEvidence = {
        provider: 'convex-cloud',
        kind: 'development',
        deploymentName,
        fingerprint: createHash('sha256').update(deployment).digest('hex').slice(0, 16),
      }
    } else {
      liveDeploymentEvidence = {
        provider: 'self-hosted',
        origin: new URL(process.env.CONVEX_SELF_HOSTED_URL).origin,
      }
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

  if (liveConvex) {
    cpSync(resolve(repoRoot, 'playground/app'), join(tempDir, 'app'), { recursive: true })
    copyFileSync(resolve(repoRoot, 'playground/app.vue'), join(tempDir, 'app.vue'))
  }
  if (liveConvex) {
    const pageDirectory = join(tempDir, 'app/pages')
    mkdirSync(pageDirectory, { recursive: true })
    writeFileSync(
      join(pageDirectory, 'render-safety.vue'),
      [
        '<script setup lang="ts">',
        "const value = { collection: 'posts', locale: 'en', body: { type: 'root', children: [{ type: 'element', tag: 'script', props: {}, children: [{ type: 'text', value: 'packed-render-exploit' }] }] } }",
        '</script>',
        '<template><ContentRenderer :value="value" /></template>',
        '',
      ].join('\n'),
      'utf8',
    )
  }

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

  if (candidateMode) {
    const attestation = {
      schemaVersion: 1,
      sourceCommit: candidateArtifact.source.commit,
      packages: Object.fromEntries(
        Object.entries(candidateArtifact.artifacts).map(([name, artifact]) => [
          name,
          {
            version: artifact.version,
            commit: artifact.commit,
            sha256: artifact.sha256,
            ...(artifact.runtimeFingerprint
              ? { runtimeFingerprint: artifact.runtimeFingerprint }
              : {}),
          },
        ]),
      ),
    }
    const routeDir = join(tempDir, 'server/routes/.well-known')
    mkdirSync(routeDir, { recursive: true })
    writeFileSync(
      join(routeDir, 'ginko-cms-candidate.json.get.ts'),
      `const attestation = ${JSON.stringify(attestation, null, 2)} as const\n\nexport default defineEventHandler(() => attestation)\n`,
      'utf8',
    )
  }

  if (consumerPackageManager === 'pnpm') {
    run('pnpm', ['install', '--ignore-scripts', '--strict-peer-dependencies'], { cwd: tempDir })
  } else {
    run('npm', ['install', '--ignore-scripts', '--strict-peer-deps'], { cwd: tempDir })
  }

  const vuePackagePath = join(tempDir, 'node_modules/vue/package.json')
  const vueRequire = createRequire(realpathSync(vuePackagePath))
  const vueOwners = new Map([
    ['consumer', join(tempDir, 'package.json')],
    ['nuxt', join(tempDir, 'node_modules/nuxt/package.json')],
    [
      '@lupinum/better-convex-nuxt',
      join(tempDir, 'node_modules/@lupinum/better-convex-nuxt/package.json'),
    ],
    [
      '@lupinum/better-convex-vue',
      join(tempDir, 'node_modules/@lupinum/better-convex-vue/package.json'),
    ],
    ['@lupinum/ginko-cms', join(tempDir, 'node_modules/@lupinum/ginko-cms/package.json')],
    ['@vue/server-renderer', vueRequire.resolve('@vue/server-renderer')],
  ])
  const vueResolutions = new Map(
    [...vueOwners].map(([owner, ownerPath]) => [
      owner,
      realpathSync(createRequire(realpathSync(ownerPath)).resolve('vue')),
    ]),
  )
  if (new Set(vueResolutions.values()).size !== 1) {
    throw new Error(
      `The packed consumer resolved multiple physical Vue runtimes: ${JSON.stringify(Object.fromEntries(vueResolutions))}`,
    )
  }

  const installedVersions = Object.fromEntries(
    [
      ['@lupinum/ginko-content', 'node_modules/@lupinum/ginko-content/package.json'],
      ['@lupinum/better-convex-mcp', 'node_modules/@lupinum/better-convex-mcp/package.json'],
      ['@lupinum/better-convex-nuxt', 'node_modules/@lupinum/better-convex-nuxt/package.json'],
      ['@lupinum/better-convex-vue', 'node_modules/@lupinum/better-convex-vue/package.json'],
    ].map(([name, path]) => [name, JSON.parse(readFileSync(join(tempDir, path), 'utf8')).version]),
  )
  const expectedInstalledVersions = {
    '@lupinum/ginko-content': contentRegistryVersion,
    '@lupinum/better-convex-mcp': betterConvexMcpRegistryVersion,
    '@lupinum/better-convex-nuxt': betterConvexNuxtRegistryVersion,
    '@lupinum/better-convex-vue': betterConvexVueRegistryVersion,
  }
  for (const [name, version] of Object.entries(installedVersions)) {
    if (version !== expectedInstalledVersions[name]) {
      throw new Error(
        `Installed ${name}@${version}; expected ${expectedInstalledVersions[name]} from the configured package stack.`,
      )
    }
  }

  writeFileSync(
    join(tempDir, 'packed-mcp-smoke.mjs'),
    `import { handleGinkoMcpRequest } from '@lupinum/ginko-cms-convex/mcp'

const bearer = 'packed-ginko-mcp-bearer-sentinel'
const calls = []
const issuer = 'https://packed.example.test/api/auth'
const options = {
  authorization: {
    issuer,
    verifier: {
      async verifyAccessToken(token, expected) {
        if (token !== bearer) throw new Error('invalid token')
        if (expected.issuer !== issuer) throw new Error('invalid issuer')
        return {
          access: {
            clientId: 'packed-client',
            issuer,
            resource: expected.resource.href,
            scopes: ['cms.read', 'cms.entries.edit'],
            subject: 'packed-user',
          },
          expiresAt: Date.now() + 60_000,
        }
      },
    },
  },
  reviewInteractionBase: new URL('https://packed.example.test/api/_ginko/reviews/'),
  resource: new URL('https://packed.example.test/mcp'),
  operations: {
    async startAgentRun(args) {
      calls.push({ operation: 'start-run', args })
      return { _id: 'packed-run', status: 'active' }
    },
    async completeAgentRun(args) {
      calls.push({ operation: 'complete-run', args })
      return { _id: args.agentRunId, status: 'completed' }
    },
    async getEntry(args) {
      calls.push({ operation: 'query', args })
      return { _id: args.id, draftVersion: 1 }
    },
    async saveEntryDraft(args) {
      calls.push({ operation: 'mutation', args })
      return { draftVersion: args.expectedDraftVersion + 1 }
    },
    async previewPublish(args) {
      calls.push({ operation: 'preview', args })
      return { allowed: true, blockers: [], effects: [], summary: 'Ready', warnings: [] }
    },
    async requestPublishReview(args) {
      calls.push({ operation: 'request-review', args })
      return {
        _id: 'packed-review',
        isStale: false,
        requestedBy: 'must-not-cross-mcp-result',
        status: 'pending',
      }
    },
    async getReviewStatus(args) {
      calls.push({ operation: 'review-status', args })
      return { _id: args.reviewRequestId, isStale: false, status: 'pending' }
    },
  },
}

async function callTool(name, args) {
  const response = await handleGinkoMcpRequest(new Request('https://packed.example.test/mcp', {
    method: 'POST',
    headers: {
      accept: 'application/json, text/event-stream',
      authorization: \`Bearer \${bearer}\`,
      'content-type': 'application/json',
      'mcp-method': 'tools/call',
      'mcp-name': name,
      'mcp-protocol-version': '2026-07-28',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: name,
      method: 'tools/call',
      params: {
        name,
        arguments: args,
        _meta: {
          'io.modelcontextprotocol/clientInfo': { name: 'packed-ginko-proof', version: '1' },
          'io.modelcontextprotocol/protocolVersion': '2026-07-28',
          'io.modelcontextprotocol/clientCapabilities': {},
        },
      },
    }),
  }), options)
  if (!response.ok) throw new Error(\`Packed MCP \${name} returned \${response.status}.\`)
  const text = await response.text()
  const body = JSON.parse(text.startsWith('data: ') ? text.slice(6).trim() : text)
  if (body.result?.isError) throw new Error(\`Packed MCP \${name} returned a tool error.\`)
  return body
}

const read = await callTool('get-entry', { entryId: 'packed-entry' })
const started = await callTool('start-agent-run', { taskName: 'Packed write' })
const write = await callTool('save-entry-draft', {
  agentRunId: 'packed-run',
  entryId: 'packed-entry',
  expectedDraftVersion: 1,
  patch: {},
})
const completed = await callTool('complete-agent-run', { agentRunId: 'packed-run' })
const review = await callTool('request-publish-review', {
  operationKey: 'packed-review-operation-000000000001',
  agentRunId: 'packed-run',
  entryId: 'packed-entry',
  locales: ['en'],
  expectedVersion: 2,
  title: 'Packed review',
  summary: 'Exact packed review interaction proof.',
})
const reviewStatus = await callTool('get-review-status', { reviewRequestId: 'packed-review' })
const serialized = JSON.stringify({ calls, read, started, write, completed, review, reviewStatus })
if (!serialized.includes('packed-entry') || !serialized.includes('"draftVersion":2')) {
  throw new Error('Packed MCP read/write results were not preserved.')
}
if (serialized.includes(bearer)) throw new Error('Packed MCP bearer escaped its verifier boundary.')
if (!serialized.includes('packed-client') || !serialized.includes('packed-user')) {
  throw new Error('Packed MCP verified OAuth provenance did not reach application operations.')
}
const publicReviewResults = JSON.stringify({ review, reviewStatus })
if (!publicReviewResults.includes('packed-review') || publicReviewResults.includes('must-not-cross')) {
  throw new Error('Packed MCP review projection was not preserved or leaked canonical fields.')
}
console.log('packed MCP read/write behavior ok')
`,
    'utf8',
  )
  run('node', ['packed-mcp-smoke.mjs'], { cwd: tempDir })

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
      '@lupinum/better-convex-mcp': fileDependency(installedBetterConvexMcpTarball),
      '@lupinum/better-convex-nuxt': fileDependency(candidateBetterConvexNuxt.path),
      '@lupinum/better-convex-vue': fileDependency(candidateBetterConvexVue.path),
    })
    if (parseYaml(consumerLockfile)?.importers?.['.']?.dependencies?.kysely) {
      throw new Error('pnpm candidate consumer must not declare Kysely directly.')
    }
  }
  if (candidateMode && consumerPackageManager === 'npm') {
    const lockfile = JSON.parse(consumerLockfile)
    for (const name of [
      '@lupinum/ginko-cms',
      '@lupinum/ginko-cms-contract',
      '@lupinum/ginko-cms-convex',
      '@lupinum/ginko-content',
      '@lupinum/better-convex-mcp',
      '@lupinum/better-convex-nuxt',
      '@lupinum/better-convex-vue',
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
    if (lockfile.packages?.['']?.dependencies?.kysely) {
      throw new Error('npm candidate consumer must not declare Kysely directly.')
    }
  }
  consumerExec('ginko-cms', liveConvex ? ['init', '--mcp'] : ['init'])
  consumerExecExpectFailure(
    'ginko-cms',
    ['doctor'],
    [
      '.ginko/content-contract.json is missing or invalid',
      'Run Nuxt prepare to regenerate the Content artifact',
    ],
  )
  if (liveConvex) consumerExec('nuxt', ['prepare'])
  else materializeOfflineContentContract()
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
    'convex/ginkoCms/mcpOAuthDelegations.ts',
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
  if (liveConvex) {
    consumerExec('ginko-cms', ['deploy'])
  }
  consumerExec('nuxt', ['typecheck'])
  consumerExec('nuxt', ['build'])
  assertBuildOnlyArchiveGraphIsAbsent(resolve(tempDir, '.output'))
  await bootNitro()

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
    "import { createHash } from 'node:crypto'",
    "import { buildResolvedContentContract } from '@lupinum/ginko-content/cms-contract'",
    "import { writePortableDirectory } from '@lupinum/ginko-content/portability/node'",
    "const contract = buildResolvedContentContract({ collections: { posts: { type: 'page', source: 'content/posts/**/*.md', route: '/posts', cms: { fields: { hero: { type: 'image', required: true } } } } } }, { defaultLocale: 'en', locales: ['en'] })",
    "const content = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64')",
    "const sha256 = createHash('sha256').update(content).digest('hex')",
    "const asset = { sha256, file: `public/ginko-assets/${sha256}.png`, bytes: content.byteLength, mediaType: 'image/png', content }",
    "const hero = { kind: 'local', path: `/ginko-assets/${sha256}.png`, sha256, bytes: content.byteLength, mediaType: 'image/png', originalFilename: 'packed-pixel.png' }",
    "const document = { format: 'ginko-content-document', version: 1, collection: 'posts', canonicalKey: 'packed-check', locale: 'en', slug: 'packed-check', parentCanonicalKey: null, order: null, shared: { title: 'Packed check', hero }, localized: {}, body: { kind: 'mdc', source: '# Packed check\\n' }, visibility: { navigation: true, search: true, ['site' + 'map']: true } }",
    "await writePortableDirectory('portable-check', { contract, documents: [document], assets: [asset] })",
  ].join(';')
  run('node', ['--input-type=module', '--eval', portabilityCheck], { cwd: tempDir })
  consumerExec('ginko-cms', ['content', 'verify', 'portable-check'])

  if (liveConvex && process.env.GINKO_BUILD_MISMATCH_CANDIDATE === '1') {
    const contentConfigPath = join(tempDir, 'content.config.ts')
    const bindingPath = join(tempDir, 'convex/ginkoCms/contractBinding.ts')
    const setupManifestPath = join(tempDir, 'convex/.ginko-cms-setup.json')
    const originalContentConfig = readFileSync(contentConfigPath, 'utf8')
    const originalBinding = readFileSync(bindingPath, 'utf8')
    const originalSetupManifest = readFileSync(setupManifestPath, 'utf8')
    const mainOutput = join(tempDir, '.output-main')
    const mismatchOutput = join(tempDir, '.output-mismatch')
    rmSync(mainOutput, { recursive: true, force: true })
    rmSync(mismatchOutput, { recursive: true, force: true })
    cpSync(join(tempDir, '.output'), mainOutput, { recursive: true })
    const mismatchContentConfig = originalContentConfig.replace(
      "fields: { description: { type: 'textarea' } }",
      "fields: { description: { type: 'textarea' }, mismatchMarker: { type: 'text' } }",
    )
    if (mismatchContentConfig === originalContentConfig) {
      throw new Error('Could not introduce the deliberate packed-host contract mismatch.')
    }
    writeFileSync(contentConfigPath, mismatchContentConfig, 'utf8')
    consumerExec('nuxt', ['build'])
    renameSync(join(tempDir, '.output'), mismatchOutput)
    renameSync(mainOutput, join(tempDir, '.output'))
    writeFileSync(contentConfigPath, originalContentConfig, 'utf8')
    writeFileSync(bindingPath, originalBinding, 'utf8')
    writeFileSync(setupManifestPath, originalSetupManifest, 'utf8')
  }

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
      `betterConvexVue=${
        candidateBetterConvexVue
          ? basename(candidateBetterConvexVue.path)
          : registryBetterConvexVue
            ? betterConvexVueRegistryVersion
            : basename(betterConvexVueTarball)
      }`,
    ].join('\n'),
  )

  const releaseEvidence = {
    schemaVersion: 1,
    lane: candidateMode ? 'candidate' : registryDependencies ? 'registry' : 'development',
    live: liveConvex,
    packageManager: consumerPackageManager,
    lockfileSha256: sha256(lockfilePath),
    candidate: candidateMode
      ? {
          sourceCommit: candidateArtifact.source.commit,
          candidateArtifactSha256: sha256(candidateArtifactPath),
        }
      : null,
    deployment: liveDeploymentEvidence,
    publishedRead: livePublishedReadEvidence,
    dependencies: {
      '@lupinum/ginko-content': candidateContent ?? { version: contentRegistryVersion },
      '@lupinum/better-convex-nuxt':
        candidateBetterConvexNuxt ??
        (betterConvexNuxtTarball
          ? { path: betterConvexNuxtTarball, sha256: sha256(betterConvexNuxtTarball) }
          : { version: betterConvexNuxtRegistryVersion }),
      '@lupinum/better-convex-vue':
        candidateBetterConvexVue ??
        (betterConvexVueTarball
          ? { path: betterConvexVueTarball, sha256: sha256(betterConvexVueTarball) }
          : { version: betterConvexVueRegistryVersion }),
    },
    packages: Object.fromEntries(
      [contractTarball, convexTarball, cmsTarball].map((path) => [basename(path), sha256(path)]),
    ),
  }
  writeFileSync(
    join(packDir, `release-evidence-${consumerPackageManager}.json`),
    `${JSON.stringify(releaseEvidence, null, 2)}\n`,
  )
  if (process.env.GINKO_PACKAGE_E2E_OUTPUT) {
    if (process.env.GINKO_KEEP_PACKAGE_E2E !== '1') {
      throw new Error('GINKO_PACKAGE_E2E_OUTPUT requires GINKO_KEEP_PACKAGE_E2E=1.')
    }
    writeFileSync(
      resolve(process.env.GINKO_PACKAGE_E2E_OUTPUT),
      `${JSON.stringify(
        {
          schemaVersion: 1,
          consumerDirectory: tempDir,
          candidateArtifact: candidateMode
            ? {
                path: candidateArtifactPath,
                sha256: sha256(candidateArtifactPath),
                sourceCommit: candidateArtifact.source.commit,
              }
            : null,
          mismatchServer: existsSync(resolve(tempDir, '.output-mismatch/server/index.mjs')),
        },
        null,
        2,
      )}\n`,
    )
  }
} finally {
  if (process.env.GINKO_KEEP_PACKAGE_E2E !== '1') {
    rmSync(tempDir, { force: true, recursive: true })
  } else {
    console.log(`kept package e2e temp dir: ${pathToFileURL(tempDir).href}`)
  }
}
