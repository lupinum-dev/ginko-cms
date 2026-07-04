import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export type ConvexSetupIssue = {
  name: string
  message: string
  fix: string
}

export type ConvexSetupWriteResult = {
  written: string[]
  skipped: string[]
}

type CompatibilityMatrix = {
  tracked?: Record<string, string[]>
}

const setupFiles = [
  'convex/convex.config.ts',
  'convex/auth.ts',
  'convex/auth.config.ts',
  'convex/http.ts',
  'convex/schema.ts',
] as const

const staleBridgePaths = [
  ['convex', 'ginkoCms'].join('/'),
  ['convex', `ginkoCms${'Mcp.ts'}`].join('/'),
] as const

const staleConvexConfigImports = [
  {
    bad: '@lupinum/ginko-cms/convex/config',
    replacement: '@lupinum/ginko-cms-convex/convex.config',
  },
  {
    bad: '@lupinum/ginko-cms/convex/better-auth',
    replacement: '@convex-dev/better-auth/convex.config',
  },
] as const

const requiredHostDependencies = [
  {
    name: '@convex-dev/better-auth',
    reason: 'convex/convex.config.ts imports Better Auth directly.',
  },
  {
    name: 'better-auth',
    reason: '@convex-dev/better-auth requires the Better Auth runtime in the host app.',
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
    fix: `Delete ${relativePath}; Ginko CMS now calls the Convex component directly.`,
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

export function checkConvexComponentInstall(rootDir: string): ConvexSetupIssue[] {
  const issues: ConvexSetupIssue[] = []
  const configPath = resolve(rootDir, 'convex/convex.config.ts')
  const configSource = existsSync(configPath) ? readFileSync(configPath, 'utf8') : ''

  for (const relativePath of setupFiles) {
    if (existsSync(resolve(rootDir, relativePath))) continue
    issues.push({
      name: `missing setup file ${relativePath}`,
      message: `${relativePath} is missing.`,
      fix: `Run pnpm exec ginko-cms init to create the direct Convex setup file.`,
    })
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
    if (!allowedRanges || allowedRanges.includes(range)) continue
    issues.push({
      name: `unsupported dependency ${dependency.name}`,
      message: `package.json declares "${dependency.name}" as "${range}", which is outside the supported Ginko CMS compatibility tuple.`,
      fix: `Use one of: ${allowedRanges.join(', ')}.`,
    })
  }

  return issues
}

export function writeConvexSetupFiles(rootDir: string): ConvexSetupWriteResult {
  const written: string[] = []
  const skipped: string[] = []

  for (const relativePath of setupFiles) {
    const target = resolve(rootDir, relativePath)
    if (existsSync(target)) {
      skipped.push(relativePath)
      continue
    }
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, readFileSync(templatePath(relativePath), 'utf8'), 'utf8')
    written.push(relativePath)
  }

  return { written, skipped }
}

function throwConvexSetupError(setupIssues: ConvexSetupIssue[]): never {
  const lines = setupIssues.map((issue) => `${issue.message} ${issue.fix}`)
  lines.push('Run the Ginko CMS setup check (`pnpm exec ginko-cms doctor`) and commit the result.')
  throw new Error(lines.join('\n'))
}

export function assertConvexSetupInstalled(rootDir: string) {
  const setupIssues = checkConvexComponentInstall(rootDir)
  if (setupIssues.length === 0) return
  throwConvexSetupError(setupIssues)
}
