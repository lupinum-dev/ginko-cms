import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export type ConvexSetupIssue = {
  name: string
  message: string
  fix: string
}

export type ConvexSetupWriteResult = {
  written: string[]
  updated: string[]
  skipped: string[]
  conflicts: Array<{ path: string; diff: string }>
}

type ConvexSetupManifest = {
  schemaVersion: 1
  generatedBy: '@lupinum/ginko-cms'
  mcp: boolean
  files: Record<string, { templateHash: string }>
}

export type ExpectedContractBinding = {
  contentHash: string
  presentationHash: string
}

type CompatibilityMatrix = {
  tracked?: Record<string, string[]>
}

const coreSetupFiles = [
  'convex/convex.config.ts',
  'convex/auth.ts',
  'convex/auth.config.ts',
  'convex/http.ts',
  'convex/schema.ts',
  'convex/ginkoCms/agentRuns.ts',
  'convex/ginkoCms/assets.ts',
  'convex/ginkoCms/assetRecovery.ts',
  'convex/ginkoCms/collections.ts',
  'convex/ginkoCms/contractBinding.ts',
  'convex/ginkoCms/diagnostics.ts',
  'convex/ginkoCms/draftPreview.ts',
  'convex/ginkoCms/editor.ts',
  'convex/ginkoCms/caller.ts',
  'convex/ginkoCms/maintenance.ts',
  'convex/ginkoCms/mcpOAuthDelegations.ts',
  'convex/ginkoCms/members.ts',
  'convex/ginkoCms/passwordRecovery.ts',
  'convex/ginkoCms/contractTransitions.ts',
  'convex/ginkoCms/contract.ts',
  'convex/ginkoCms/portability.ts',
  'convex/ginkoCms/public.ts',
  'convex/ginkoCms/revalidation.ts',
  'convex/ginkoCms/reviewRequests.ts',
  'convex/ginkoCms/settings.ts',
  'convex/ginkoCms/siteData.ts',
] as const

const mcpSetupFiles = ['convex/ginkoCms/mcp.ts', 'convex/ginkoCms/mcpOperations.ts'] as const

function setupFilesFor(mcp: boolean): readonly string[] {
  return mcp ? [...coreSetupFiles, ...mcpSetupFiles] : coreSetupFiles
}

const staleBridgePaths = [
  ['convex', `ginkoCms${'Mcp.ts'}`].join('/'),
  'convex/betterAuth/adapter.ts',
  'convex/betterAuth/auth.ts',
  'convex/betterAuth/convex.config.ts',
  'convex/betterAuth/schema.ts',
  'convex/betterAuth/_generated/api.ts',
  'convex/betterAuth/_generated/component.ts',
  'convex/betterAuth/_generated/dataModel.ts',
  'convex/betterAuth/_generated/server.ts',
  'convex/ginkoCms/migrations.ts',
  'convex/ginkoCms/policy.ts',
  'convex/ginkoCms/mcpCaller.ts',
  'convex/ginkoCms/mcpPilot.ts',
  'convex/ginkoCms/mcpPilotOperations.ts',
] as const
const setupManifestPath = 'convex/.ginko-cms-setup.json'
const contractBindingPath = 'convex/ginkoCms/contractBinding.ts'
const CONTENT_HASH_TOKEN = '__GINKO_CMS_EXPECTED_CONTENT_HASH__'
const PRESENTATION_HASH_TOKEN = '__GINKO_CMS_EXPECTED_PRESENTATION_HASH__'
const UNBOUND_CONTRACT_HASH = 'unbound'
const MCP_BLOCK = /\/\/ GINKO_MCP_BEGIN\n([\s\S]*?)\/\/ GINKO_MCP_END\n?/gu

const staleConvexConfigImports = [
  {
    bad: '@convex-dev/better-auth/convex.config',
    replacement: 'better-convex-nuxt/convex-auth/convex.config',
  },
  {
    bad: '@lupinum/ginko-cms/convex/config',
    replacement: '@lupinum/ginko-cms-convex/convex.config',
  },
  {
    bad: '@lupinum/ginko-cms/convex/better-auth',
    replacement: 'better-convex-nuxt/convex-auth/convex.config',
  },
] as const

const requiredHostDependencies = [
  {
    name: 'better-convex-nuxt',
    reason: 'convex/auth.ts and convex/convex.config.ts use the packaged auth component.',
  },
  {
    name: 'better-auth',
    reason: 'convex/auth.ts composes the Better Auth runtime through Ginko CMS.',
  },
  {
    name: 'kysely',
    reason: 'Better Auth 1.7 requires the Kysely 0.28 migration exports in Convex bundles.',
  },
  {
    name: '@lupinum/ginko-cms-convex',
    reason: 'convex/convex.config.ts imports the Ginko CMS Convex component directly.',
  },
] as const

function locatePackageRoot(): string {
  let current = dirname(fileURLToPath(import.meta.url))
  while (true) {
    const pkgPath = resolve(current, 'package.json')
    if (existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { name?: string }
        if (pkg.name === '@lupinum/ginko-cms') return current
      } catch {
        // ignore unparseable package.json on the way up
      }
    }
    const parent = dirname(current)
    if (parent === current) {
      throw new Error('Could not locate @lupinum/ginko-cms package root.')
    }
    current = parent
  }
}

function templatePath(relativePath: string) {
  return resolve(locatePackageRoot(), 'templates', relativePath)
}

function contentHash(source: string) {
  return createHash('sha256').update(source).digest('hex')
}

function readContractBinding(source: string): ExpectedContractBinding {
  const content = source.match(/EXPECTED_CONTENT_HASH = '([^']+)'/u)?.[1]
  const presentation = source.match(/PRESENTATION_HASH = '([^']+)'/u)?.[1]
  return {
    contentHash: content ?? UNBOUND_CONTRACT_HASH,
    presentationHash: presentation ?? UNBOUND_CONTRACT_HASH,
  }
}

function renderSetupTemplate(
  relativePath: string,
  source: string,
  binding: ExpectedContractBinding = {
    contentHash: UNBOUND_CONTRACT_HASH,
    presentationHash: UNBOUND_CONTRACT_HASH,
  },
  mcp = false,
) {
  if (relativePath === 'convex/http.ts') {
    return source.replace(MCP_BLOCK, mcp ? '$1' : '')
  }
  if (relativePath !== contractBindingPath) return source
  return source
    .replace(CONTENT_HASH_TOKEN, binding.contentHash)
    .replace(PRESENTATION_HASH_TOKEN, binding.presentationHash)
}

function emptySetupManifest(mcp = false): ConvexSetupManifest {
  return {
    schemaVersion: 1,
    generatedBy: '@lupinum/ginko-cms',
    mcp,
    files: {},
  }
}

function withoutManifestFile(
  files: ConvexSetupManifest['files'],
  relativePath: string,
): ConvexSetupManifest['files'] {
  return Object.fromEntries(Object.entries(files).filter(([path]) => path !== relativePath))
}

function readSetupManifest(rootDir: string): ConvexSetupManifest | null {
  const path = resolve(rootDir, setupManifestPath)
  if (!existsSync(path)) return null
  const value = JSON.parse(readFileSync(path, 'utf8')) as Partial<ConvexSetupManifest>
  if (
    value.schemaVersion !== 1 ||
    value.generatedBy !== '@lupinum/ginko-cms' ||
    !value.files ||
    typeof value.files !== 'object'
  ) {
    throw new Error(`${setupManifestPath} is not a valid Ginko CMS setup manifest.`)
  }
  return {
    ...(value as ConvexSetupManifest),
    mcp: value.mcp === true,
  }
}

function safeTemplateDiff(relativePath: string, current: string, expected: string) {
  const currentLines = current.replace(/\r\n/g, '\n').split('\n')
  const expectedLines = expected.replace(/\r\n/g, '\n').split('\n')
  const lines = [`--- host/${relativePath}`, `+++ package/${relativePath}`]
  let changeCount = 0
  const maxLines = Math.max(currentLines.length, expectedLines.length)
  for (let index = 0; index < maxLines && changeCount < 20; index += 1) {
    if (currentLines[index] === expectedLines[index]) continue
    lines.push(`@@ line ${index + 1} @@`)
    lines.push('- [user-modified line hidden to avoid leaking local values]')
    lines.push(`+ ${expectedLines[index] ?? '[remove this host-only line]'}`)
    changeCount += 1
  }
  if (changeCount === 20) lines.push('... additional differences omitted ...')
  return lines.join('\n')
}

function checkSetupTemplateState(rootDir: string, mcp: boolean): ConvexSetupIssue[] {
  const existingSetupFiles = setupFilesFor(mcp).filter((relativePath) =>
    existsSync(resolve(rootDir, relativePath)),
  )
  if (existingSetupFiles.length === 0) return []

  const manifest = readSetupManifest(rootDir)
  if (!manifest) {
    return [
      {
        name: 'missing generated setup provenance',
        message: `${setupManifestPath} is missing, so generated setup files cannot be updated safely.`,
        fix: 'Run pnpm exec ginko-cms init. Matching templates will be adopted; differing files will be preserved and reported for manual merge.',
      },
    ]
  }

  const issues: ConvexSetupIssue[] = []
  for (const relativePath of existingSetupFiles) {
    const recordedHash = manifest.files[relativePath]?.templateHash
    const template = readFileSync(templatePath(relativePath), 'utf8')
    const current = readFileSync(resolve(rootDir, relativePath), 'utf8')
    const expected = renderSetupTemplate(relativePath, template, readContractBinding(current), mcp)
    const expectedHash = contentHash(expected)
    const currentHash = contentHash(current)
    if (recordedHash === expectedHash || currentHash === expectedHash) continue

    if (recordedHash && currentHash === recordedHash) {
      issues.push({
        name: `outdated generated setup ${relativePath}`,
        message: `${relativePath} is an untouched generated file with a newer package template available.`,
        fix: 'Run pnpm exec ginko-cms init to update the generated file.',
      })
      continue
    }

    issues.push({
      name: `modified generated setup conflict ${relativePath}`,
      message: `${relativePath} was modified after generation and its package template also changed.`,
      fix: 'Run pnpm exec ginko-cms init, review the safe diff, and merge the new template deliberately. The command will not overwrite this file.',
    })
  }
  return issues
}

function readCompatibilityMatrix(): CompatibilityMatrix {
  const candidates = [
    new URL('../compatibility.json', import.meta.url),
    new URL('../../compatibility.json', import.meta.url),
  ]
  const matrixUrl = candidates.find((candidate) => existsSync(candidate))
  if (!matrixUrl) {
    throw new Error('Could not locate @lupinum/ginko-cms compatibility.json.')
  }
  return JSON.parse(readFileSync(matrixUrl, 'utf8')) as CompatibilityMatrix
}

function readJsonIfExists(path: string): Record<string, unknown> | null {
  if (!existsSync(path)) return null
  return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>
}

function readTextIfExists(path: string): string | null {
  try {
    return readFileSync(path, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }
}

function dependencyMap(packageJson: Record<string, unknown>): Record<string, string> {
  return {
    ...((packageJson.dependencies as Record<string, string> | undefined) ?? {}),
    ...((packageJson.devDependencies as Record<string, string> | undefined) ?? {}),
    ...((packageJson.optionalDependencies as Record<string, string> | undefined) ?? {}),
    ...((packageJson.peerDependencies as Record<string, string> | undefined) ?? {}),
  }
}

function staleBridgePathIssue(rootDir: string, relativePath: string): ConvexSetupIssue | null {
  const target = resolve(rootDir, relativePath)
  if (!existsSync(target)) return null
  const stat = statSync(target)
  return {
    name: `stale bridge ${relativePath}`,
    message: `${relativePath} is a stale generated bridge ${stat.isDirectory() ? 'directory' : 'file'}.`,
    fix: `Delete ${relativePath}; current Ginko CMS setup uses convex/ginkoCms root adapters and Better Auth OAuth for MCP access.`,
  }
}

function checkStaleBridgeMarkers(rootDir: string): ConvexSetupIssue[] {
  const issues: ConvexSetupIssue[] = []
  for (const relativePath of ['convex/auth.ts', 'convex/http.ts', 'convex/convex.config.ts']) {
    const source = readTextIfExists(resolve(rootDir, relativePath)) ?? ''
    const generatedMarker = ['@trellis', 'bridge-package'].join('-')
    const managedMarker = ['@trellis', 'managed'].join('-')
    if (!source.includes(generatedMarker) && !source.includes(managedMarker)) {
      continue
    }
    issues.push({
      name: `stale bridge marker ${relativePath}`,
      message: `${relativePath} still contains legacy generated markers.`,
      fix: `Remove the legacy bridge comments from ${relativePath} or recreate the file with pnpm exec ginko-cms init.`,
    })
  }
  return issues
}

function fileDependencyHasSupportedInstalledVersion(
  rootDir: string,
  dependencyName: string,
  range: string,
  allowedRanges: string[],
): boolean {
  if (!range.startsWith('file:')) return false
  const installedPackage = readJsonIfExists(
    resolve(rootDir, 'node_modules', ...dependencyName.split('/'), 'package.json'),
  )
  return (
    typeof installedPackage?.version === 'string' &&
    allowedRanges.includes(installedPackage.version)
  )
}

export function checkConvexComponentInstall(
  rootDir: string,
  options: { mcp?: boolean } = {},
): ConvexSetupIssue[] {
  const issues: ConvexSetupIssue[] = []
  const manifest = readSetupManifest(rootDir)
  const mcp = options.mcp ?? manifest?.mcp ?? false
  const configPath = resolve(rootDir, 'convex/convex.config.ts')
  const configSource = existsSync(configPath) ? readFileSync(configPath, 'utf8') : ''

  for (const relativePath of setupFilesFor(mcp)) {
    if (existsSync(resolve(rootDir, relativePath))) continue
    issues.push({
      name: `missing setup file ${relativePath}`,
      message: `${relativePath} is missing.`,
      fix: `Run pnpm exec ginko-cms init to create the Ginko CMS Convex setup file.`,
    })
  }
  issues.push(...checkSetupTemplateState(rootDir, mcp))

  if (!mcp) {
    for (const relativePath of mcpSetupFiles) {
      if (!existsSync(resolve(rootDir, relativePath))) continue
      issues.push({
        name: `unexpected MCP setup file ${relativePath}`,
        message: `${relativePath} exposes MCP while the generated setup has MCP disabled.`,
        fix: 'Run pnpm exec ginko-cms init without --mcp to remove untouched generated MCP files.',
      })
    }
  }

  for (const stalePath of staleBridgePaths) {
    const issue = staleBridgePathIssue(rootDir, stalePath)
    if (issue) issues.push(issue)
  }
  issues.push(...checkStaleBridgeMarkers(rootDir))

  for (const staleImport of staleConvexConfigImports) {
    if (!configSource.includes(staleImport.bad)) continue
    issues.push({
      name: `stale import ${staleImport.bad}`,
      message: `convex/convex.config.ts imports ${staleImport.bad}.`,
      fix: `Replace ${staleImport.bad} with ${staleImport.replacement}.`,
    })
  }

  const packageJson = readJsonIfExists(resolve(rootDir, 'package.json'))
  if (!packageJson) return issues

  const dependencies = dependencyMap(packageJson)
  const trackedCompatibility = readCompatibilityMatrix().tracked ?? {}
  for (const dependency of requiredHostDependencies) {
    const range = dependencies[dependency.name]
    if (!range) {
      issues.push({
        name: `missing dependency ${dependency.name}`,
        message: `package.json is missing direct dependency "${dependency.name}".`,
        fix: `Add "${dependency.name}" to the host app dependencies because ${dependency.reason}`,
      })
      continue
    }

    const allowedRanges = trackedCompatibility[dependency.name]
    if (
      !allowedRanges ||
      allowedRanges.includes(range) ||
      fileDependencyHasSupportedInstalledVersion(rootDir, dependency.name, range, allowedRanges)
    )
      continue
    issues.push({
      name: `unsupported dependency ${dependency.name}`,
      message: `package.json declares "${dependency.name}" as "${range}", which is outside the supported Ginko CMS compatibility tuple.`,
      fix: `Use one of: ${allowedRanges.join(', ')}.`,
    })
  }

  return issues
}

export function writeConvexSetupFiles(
  rootDir: string,
  options: { mcp?: boolean } = {},
): ConvexSetupWriteResult {
  const written: string[] = []
  const updated: string[] = []
  const skipped: string[] = []
  const conflicts: Array<{ path: string; diff: string }> = []
  const previousManifest = readSetupManifest(rootDir)
  const mcp = options.mcp ?? previousManifest?.mcp ?? false
  const manifest = previousManifest ?? emptySetupManifest(mcp)
  manifest.mcp = mcp

  for (const relativePath of staleBridgePaths) {
    const target = resolve(rootDir, relativePath)
    if (!existsSync(target)) {
      manifest.files = withoutManifestFile(manifest.files, relativePath)
      continue
    }
    const current = readFileSync(target, 'utf8')
    const recordedHash = manifest.files[relativePath]?.templateHash
    const generatedBinding = relativePath.startsWith('convex/betterAuth/_generated/')
    if (generatedBinding || (recordedHash && contentHash(current) === recordedHash)) {
      unlinkSync(target)
      manifest.files = withoutManifestFile(manifest.files, relativePath)
      updated.push(relativePath)
      continue
    }
    conflicts.push({ path: relativePath, diff: safeTemplateDiff(relativePath, current, '') })
  }

  if (!mcp) {
    for (const relativePath of mcpSetupFiles) {
      const target = resolve(rootDir, relativePath)
      if (!existsSync(target)) {
        manifest.files = withoutManifestFile(manifest.files, relativePath)
        continue
      }
      const current = readFileSync(target, 'utf8')
      const recordedHash = manifest.files[relativePath]?.templateHash
      if (recordedHash && contentHash(current) === recordedHash) {
        unlinkSync(target)
        manifest.files = withoutManifestFile(manifest.files, relativePath)
        updated.push(relativePath)
        continue
      }
      conflicts.push({ path: relativePath, diff: safeTemplateDiff(relativePath, current, '') })
    }
  }

  for (const relativePath of setupFilesFor(mcp)) {
    const target = resolve(rootDir, relativePath)
    const template = readFileSync(templatePath(relativePath), 'utf8')
    const currentBinding = existsSync(target)
      ? readContractBinding(readFileSync(target, 'utf8'))
      : undefined
    const expected = renderSetupTemplate(relativePath, template, currentBinding, mcp)
    const expectedHash = contentHash(expected)
    if (!existsSync(target)) {
      mkdirSync(dirname(target), { recursive: true })
      writeFileSync(target, expected, 'utf8')
      manifest.files[relativePath] = { templateHash: expectedHash }
      written.push(relativePath)
      continue
    }

    const current = readFileSync(target, 'utf8')
    const currentHash = contentHash(current)
    const recordedHash = manifest.files[relativePath]?.templateHash
    if (currentHash === expectedHash) {
      manifest.files[relativePath] = { templateHash: expectedHash }
      skipped.push(relativePath)
      continue
    }
    if (recordedHash && currentHash === recordedHash) {
      writeFileSync(target, expected, 'utf8')
      manifest.files[relativePath] = { templateHash: expectedHash }
      updated.push(relativePath)
      continue
    }
    if (recordedHash === expectedHash) {
      skipped.push(relativePath)
      continue
    }

    conflicts.push({
      path: relativePath,
      diff: safeTemplateDiff(relativePath, current, expected),
    })
  }

  const manifestTarget = resolve(rootDir, setupManifestPath)
  mkdirSync(dirname(manifestTarget), { recursive: true })
  writeFileSync(manifestTarget, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')

  return { written, updated, skipped, conflicts }
}

export function writeExpectedContractBinding(
  rootDir: string,
  binding: ExpectedContractBinding,
): string {
  const sha256 = /^[a-f0-9]{64}$/u
  if (!sha256.test(binding.contentHash) || !sha256.test(binding.presentationHash)) {
    throw new Error('Expected CMS contract bindings must be canonical SHA-256 hashes.')
  }
  const target = resolve(rootDir, contractBindingPath)
  const manifest = readSetupManifest(rootDir) ?? emptySetupManifest()
  const template = readFileSync(templatePath(contractBindingPath), 'utf8')
  const rendered = renderSetupTemplate(contractBindingPath, template, binding)
  const renderedHash = contentHash(rendered)
  if (existsSync(target)) {
    const current = readFileSync(target, 'utf8')
    const currentHash = contentHash(current)
    const recordedHash = manifest.files[contractBindingPath]?.templateHash
    if (!recordedHash || currentHash !== recordedHash) {
      throw new Error(
        `Refused to overwrite modified generated file ${contractBindingPath}. Run \`pnpm exec ginko-cms init\` and merge its safe diff first.`,
      )
    }
  } else {
    mkdirSync(dirname(target), { recursive: true })
  }
  writeFileSync(target, rendered, 'utf8')
  manifest.files[contractBindingPath] = { templateHash: renderedHash }
  const manifestTarget = resolve(rootDir, setupManifestPath)
  mkdirSync(dirname(manifestTarget), { recursive: true })
  writeFileSync(manifestTarget, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
  return contractBindingPath
}

export function readExpectedContractBinding(rootDir: string): ExpectedContractBinding | null {
  const target = resolve(rootDir, contractBindingPath)
  return existsSync(target) ? readContractBinding(readFileSync(target, 'utf8')) : null
}

function throwConvexSetupError(setupIssues: ConvexSetupIssue[]): never {
  const lines = setupIssues.map((issue) => `${issue.message} ${issue.fix}`)
  lines.push('Run the Ginko CMS setup check (`pnpm exec ginko-cms doctor`) and commit the result.')
  throw new Error(lines.join('\n'))
}

export function assertConvexSetupInstalled(rootDir: string, options: { mcp?: boolean } = {}) {
  const setupIssues = checkConvexComponentInstall(rootDir, options)
  if (setupIssues.length === 0) return
  throwConvexSetupError(setupIssues)
}
