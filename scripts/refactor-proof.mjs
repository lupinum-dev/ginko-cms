import { spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createWriteStream, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { buildUserStoryEvidenceReport } from './check-user-story-evidence.mjs'

const repoRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))
const live = process.argv.includes('--live')

function capture(command, args) {
  const result = spawnSync(command, args, { cwd: repoRoot, encoding: 'utf8' })
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed: ${result.stderr.trim()}`)
  }
  return result.stdout.trim()
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

function hashFile(relativePath) {
  return sha256(readFileSync(resolve(repoRoot, relativePath)))
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`)
}

function safeName(value) {
  return value
    .replace(/[^a-z0-9-]+/gi, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()
}

async function runCommand(command, artifactRoot, index, seed) {
  const startedAt = new Date()
  const logPath = resolve(
    artifactRoot,
    'commands',
    `${String(index + 1).padStart(2, '0')}-${safeName(command.name)}.log`,
  )
  const log = createWriteStream(logPath, { flags: 'w' })
  const args = ['pnpm', ...command.args]

  console.log(`\n=== ${command.name} ===`)
  console.log(`cmd: corepack ${args.join(' ')}`)

  const child = spawn('corepack', args, {
    cwd: repoRoot,
    env: {
      ...process.env,
      GINKO_CMS_TEST_SEED: String(seed),
      VITEST_MAX_RETRIES: '0',
      npm_config_verify_deps_before_run: 'false',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  child.stdout.on('data', (chunk) => {
    process.stdout.write(chunk)
    log.write(chunk)
  })
  child.stderr.on('data', (chunk) => {
    process.stderr.write(chunk)
    log.write(chunk)
  })

  const exitCode = await new Promise((resolveExit, reject) => {
    child.once('error', reject)
    child.once('close', (code) => resolveExit(code ?? 1))
  })
  await new Promise((resolveClose) => log.end(resolveClose))

  const finishedAt = new Date()
  return {
    name: command.name,
    command: ['corepack', ...args],
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    exitCode,
    log: logPath.slice(repoRoot.length + 1),
  }
}

function assertDisposableLiveDeployment() {
  if (process.env.GINKO_CMS_DISPOSABLE_DEPLOYMENT !== '1') {
    throw new Error(
      'Live refactor proof requires GINKO_CMS_DISPOSABLE_DEPLOYMENT=1 and must never reuse a development deployment.',
    )
  }
  if (!process.env.CONVEX_DEPLOYMENT || !process.env.CONVEX_URL) {
    throw new Error('Live refactor proof requires a dedicated CONVEX_DEPLOYMENT and CONVEX_URL.')
  }
  if (!process.env.GINKO_CMS_FIXTURE_PREFIX?.startsWith('refactor-')) {
    throw new Error(
      'Live refactor proof requires a unique GINKO_CMS_FIXTURE_PREFIX beginning with refactor-.',
    )
  }
}

async function main() {
  if (live) assertDisposableLiveDeployment()

  const commit = capture('git', ['rev-parse', 'HEAD'])
  const shortCommit = commit.slice(0, 12)
  const workspaceStatus = capture('git', ['status', '--short'])
  const storyEvidence = buildUserStoryEvidenceReport()
  const packageFiles = [
    'package.json',
    'pnpm-lock.yaml',
    'pnpm-workspace.yaml',
    'packages/contract/package.json',
    'packages/convex/package.json',
    'packages/cms/package.json',
  ]
  const packageHashes = Object.fromEntries(packageFiles.map((path) => [path, hashFile(path)]))
  const seed = Number.parseInt(sha256(`${commit}:${JSON.stringify(packageHashes)}`).slice(0, 8), 16)
  const artifactRoot = resolve(
    repoRoot,
    'reports',
    'refactor-proof',
    shortCommit,
    live ? 'live' : 'automated',
  )
  mkdirSync(resolve(artifactRoot, 'commands'), { recursive: true })
  mkdirSync(resolve(artifactRoot, 'browser'), { recursive: true })

  const commands = live
    ? [
        { name: 'automated refactor proof', args: ['run', 'verify:refactor'] },
        { name: 'packed consumer live gate', args: ['run', 'package:e2e:live'] },
        { name: 'automated live user journeys', args: ['run', 'smoke:live-stories'] },
      ]
    : [
        { name: 'accepted story mapping', args: ['run', 'check:user-stories'] },
        { name: 'repository invariants types and tests', args: ['run', 'check'] },
        { name: 'production package build', args: ['run', 'build'] },
      ]

  const report = {
    schemaVersion: 1,
    lane: live ? 'live' : 'automated',
    commit,
    shortCommit,
    workspaceDirty: workspaceStatus.length > 0,
    workspaceStatus: workspaceStatus ? workspaceStatus.split('\n') : [],
    packageHashes,
    tools: {
      node: process.version,
      pnpm: capture('corepack', ['pnpm', '--version']),
      git: capture('git', ['--version']),
    },
    determinism: {
      seed,
      retriesDisabled: true,
    },
    targetScale: {
      entries: 1500,
      locales: 3,
      assets: 500,
      treeDepth: 5,
      paginationRows: 1205,
      publicRows: 5105,
      portabilityDocuments: 5000,
      portabilityAssets: 500,
    },
    stories: {
      accepted: storyEvidence.accepted.length,
      deferred: storyEvidence.deferred.length,
      evidenceFiles: storyEvidence.evidenceFiles,
      mappings: storyEvidence.mappings,
    },
    browser: {
      requiredForCertification: true,
      status: live ? 'awaiting-in-app-browser-artifacts' : 'separate-live-certification-lane',
    },
    fixtureCleanup: live
      ? {
          required: true,
          fixturePrefix: process.env.GINKO_CMS_FIXTURE_PREFIX,
          completed: false,
        }
      : null,
    commands: [],
    status: 'running',
    startedAt: new Date().toISOString(),
  }
  if (live) {
    report.disposableDeploymentFingerprint = sha256(process.env.CONVEX_DEPLOYMENT).slice(0, 16)
  }
  const reportPath = resolve(artifactRoot, 'proof.json')
  writeJson(reportPath, report)

  for (const [index, command] of commands.entries()) {
    const result = await runCommand(command, artifactRoot, index, seed)
    report.commands.push(result)
    if (result.exitCode !== 0) {
      report.status = 'failed'
      report.finishedAt = new Date().toISOString()
      writeJson(reportPath, report)
      throw new Error(`${command.name} failed with exit code ${result.exitCode}.`)
    }
    writeJson(reportPath, report)
  }

  report.status = live ? 'automated-live-green-browser-pending' : 'green'
  report.finishedAt = new Date().toISOString()
  writeJson(reportPath, report)
  console.log(`\nRefactor proof written to ${reportPath.slice(repoRoot.length + 1)}.`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
