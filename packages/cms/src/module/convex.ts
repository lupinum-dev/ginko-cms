import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

import { checkBridgeDrift, type BridgeDriftViolation } from '@lupinum/trellis-bridge'
import {
  renderComponentBridgeFile,
  renderComponentBridgeFiles,
  renderComponentBridgeManagedEdits,
} from '@lupinum/trellis-bridge/manifest'

import { ginkoCmsBridgeManifest } from './bridge-manifest.js'

export type ConvexSetupIssue = {
  name: string
  message: string
  fix: string
}

export type ConvexBridgeWriteResult = {
  written: string[]
  managed: string[]
}

type CompatibilityMatrix = {
  tracked?: Record<string, string[]>
}

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

export function checkConvexComponentInstall(rootDir: string): ConvexSetupIssue[] {
  const issues: ConvexSetupIssue[] = []
  const configPath = resolve(rootDir, 'convex/convex.config.ts')
  const configSource = existsSync(configPath) ? readFileSync(configPath, 'utf8') : ''

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

export async function writeConvexBridgeFiles(rootDir: string): Promise<ConvexBridgeWriteResult> {
  const files = await renderComponentBridgeFiles(ginkoCmsBridgeManifest)
  const edits = await renderComponentBridgeManagedEdits(ginkoCmsBridgeManifest)

  const fileWrites = files.map((file) => ({
    relativePath: file.relativePath,
    content: renderComponentBridgeFile(ginkoCmsBridgeManifest, file),
  }))
  const managedWrites = edits.map((edit) => {
    const target = resolve(rootDir, edit.relativePath)
    const existing = readTextIfExists(target)
    return {
      relativePath: edit.relativePath,
      target,
      existing,
      next: edit.apply(existing),
    }
  })

  for (const file of fileWrites) {
    const target = resolve(rootDir, file.relativePath)
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, file.content, 'utf8')
  }

  for (const edit of managedWrites) {
    if (edit.next === edit.existing) continue
    mkdirSync(dirname(edit.target), { recursive: true })
    writeFileSync(edit.target, edit.next, 'utf8')
  }

  return {
    written: fileWrites.map((file) => file.relativePath),
    managed: managedWrites.map((edit) => edit.relativePath),
  }
}

async function readConvexBridgeState(rootDir: string): Promise<{
  violations: BridgeDriftViolation[]
  setupIssues: ConvexSetupIssue[]
}> {
  return {
    violations: await checkBridgeDrift(ginkoCmsBridgeManifest, rootDir),
    setupIssues: checkConvexComponentInstall(rootDir),
  }
}

function throwConvexBridgeSetupError(
  violations: BridgeDriftViolation[],
  setupIssues: ConvexSetupIssue[],
): never {
  const lines = violations.map((violation) => {
    const verb = violation.reason === 'missing' ? 'is missing' : 'is out of date'
    return `${violation.relativePath} ${verb}.`
  })
  lines.push(...setupIssues.map((issue) => `${issue.message} ${issue.fix}`))
  lines.push('Run the Ginko CMS setup step (`pnpm exec ginko-cms init`) and commit the result.')
  throw new Error(lines.join('\n'))
}

export async function assertConvexBridgeInstalled(
  rootDir: string,
  options: { repair?: boolean } = {},
) {
  let state: Awaited<ReturnType<typeof readConvexBridgeState>>
  try {
    state = await readConvexBridgeState(rootDir)
  } catch (error) {
    if (!options.repair) throw error
    await writeConvexBridgeFiles(rootDir)
    state = await readConvexBridgeState(rootDir)
  }

  if (state.violations.length === 0 && state.setupIssues.length === 0) return

  if (options.repair) {
    await writeConvexBridgeFiles(rootDir)
    state = await readConvexBridgeState(rootDir)
  }

  const { violations, setupIssues } = state
  if (violations.length === 0 && setupIssues.length === 0) return

  throwConvexBridgeSetupError(violations, setupIssues)
}
