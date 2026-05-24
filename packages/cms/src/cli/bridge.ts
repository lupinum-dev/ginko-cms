import { checkBridgeDrift, type BridgeDriftViolation } from '@lupinum/trellis-bridge'
import {
  renderComponentBridgeFiles,
  renderComponentBridgeManagedEdits,
} from '@lupinum/trellis-bridge/manifest'

import { ginkoCmsBridgeManifest } from '../../convex/manifest.js'
import { checkConvexComponentInstall, writeConvexBridgeFiles } from '../module/convex.js'
import { type CliIo, usage, write } from './args.js'

type BridgeWriteResult = {
  written: string[]
  managed: string[]
}

export async function writeBridgeFiles(cwd: string): Promise<BridgeWriteResult> {
  return await writeConvexBridgeFiles(cwd)
}

function violationLine(violation: BridgeDriftViolation): string {
  const verb = violation.reason === 'missing' ? 'is missing' : 'is out of date'
  return `${violation.relativePath} ${verb}`
}

function isHostSetupValidationError(error: unknown): error is Error {
  return error instanceof Error && error.name === 'GinkoCmsHostSetupValidationError'
}

async function readBridgeDrift(
  cwd: string,
): Promise<{ violations: BridgeDriftViolation[]; validationError: string | null }> {
  try {
    return {
      violations: await checkBridgeDrift(ginkoCmsBridgeManifest, cwd),
      validationError: null,
    }
  } catch (error) {
    if (!isHostSetupValidationError(error)) throw error
    return {
      violations: [],
      validationError: error.message,
    }
  }
}

export async function runBridgeCheck(cwd: string, io: CliIo, label = 'bridge'): Promise<number> {
  const { violations, validationError } = await readBridgeDrift(cwd)
  const setupIssues = checkConvexComponentInstall(cwd)
  const issueCount = violations.length + setupIssues.length + (validationError ? 1 : 0)
  if (issueCount === 0) {
    write(io.stdout, `Ginko CMS ${label} is up to date in ${cwd}.\n`)
    return 0
  }

  write(io.stderr, `Ginko CMS ${label} has ${issueCount} issue(s) in ${cwd}:\n`)
  if (validationError) {
    write(io.stderr, `  ${validationError.replaceAll('\n', '\n  ')}\n`)
  }
  for (const violation of violations) {
    write(io.stderr, `  ${violationLine(violation)}\n`)
  }
  for (const issue of setupIssues) {
    write(io.stderr, `  ${issue.message}\n`)
    write(io.stderr, `    Fix: ${issue.fix}\n`)
  }
  if (violations.length > 0) {
    write(io.stderr, `Fix: pnpm exec ginko-cms init\n`)
  }
  return 1
}

async function runBridgeInspect(cwd: string, io: CliIo): Promise<number> {
  const files = await renderComponentBridgeFiles(ginkoCmsBridgeManifest)
  const edits = await renderComponentBridgeManagedEdits(ginkoCmsBridgeManifest)
  const { violations, validationError } = await readBridgeDrift(cwd)
  const driftByPath = new Map(
    violations.map((violation) => [violation.relativePath, violation.reason]),
  )

  write(io.stdout, `Ginko CMS bridge plan for ${cwd}\n`)
  write(io.stdout, `Generated files (${files.length}):\n`)
  for (const file of files) {
    const reason = driftByPath.get(file.relativePath)
    write(io.stdout, `  ${file.relativePath}${reason ? ` - ${reason}` : ' - ok'}\n`)
  }
  write(io.stdout, `Managed edits (${edits.length}):\n`)
  for (const edit of edits) {
    const reason = driftByPath.get(edit.relativePath) ?? (validationError ? 'blocked' : null)
    write(io.stdout, `  ${edit.relativePath}${reason ? ` - ${reason}` : ' - ok'}\n`)
  }
  if (validationError) {
    write(io.stderr, `Ginko CMS bridge validation failed:\n${validationError}\n`)
  }

  return violations.length > 0 || validationError ? 1 : 0
}

export async function runBridgeCommand(args: string[], cwd: string, io: CliIo): Promise<number> {
  const subcommand = args[1]
  if (!subcommand || ['--help', '-h'].includes(subcommand)) {
    write(io.stdout, usage())
    return 0
  }

  if (subcommand === 'install' || subcommand === 'generate') {
    const result = await writeBridgeFiles(cwd)
    const action = subcommand === 'install' ? 'installed' : 'regenerated'
    write(
      io.stdout,
      `Ginko CMS bridge ${action} in ${cwd}: ${result.written.length} generated file(s), ${result.managed.length} managed edit(s).\n`,
    )
    if (subcommand === 'install') {
      write(io.stdout, `Verify with \`pnpm exec ginko-cms doctor\`.\n`)
    }
    return 0
  }

  if (subcommand === 'check') return await runBridgeCheck(cwd, io)
  if (subcommand === 'inspect') return await runBridgeInspect(cwd, io)

  throw new Error(`Unknown bridge command "${subcommand}".`)
}
