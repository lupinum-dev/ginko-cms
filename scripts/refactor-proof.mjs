import { spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  copyFileSync,
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import { isAbsolute, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { buildUserStoryEvidenceReport } from './check-user-story-evidence.mjs'
import {
  LIVE_PROOF_TARGET_SCALE,
  readJsonFile,
  sha256File,
  validateCandidateArtifact,
  validateCleanupLedger,
  validateInAppBrowserEvidence,
  validateLiveFixtureManifest,
  validateLiveProofPreflight,
} from './live-proof-config.mjs'

const repoRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))
const live = process.argv.includes('--live')
const finalize = process.argv.includes('--finalize')

function capture(command, args) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
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

function readJson(relativeOrAbsolutePath) {
  const path = resolve(repoRoot, relativeOrAbsolutePath)
  return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null
}

function workspaceFingerprint() {
  const diff = capture('git', ['diff', '--binary', 'HEAD'])
  const untracked = capture('git', ['ls-files', '--others', '--exclude-standard'])
    .split('\n')
    .filter(Boolean)
    .sort()
  const untrackedHashes = Object.fromEntries(untracked.map((path) => [path, hashFile(path)]))
  return {
    sha256: sha256(`${diff}\n${JSON.stringify(untrackedHashes)}`),
    untrackedHashes,
  }
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

function fixtureHookEnvironment(commandEnv) {
  const allowedExact = new Set([
    'CI',
    'CONVEX_DEPLOYMENT',
    'CONVEX_URL',
    'CONVEX_SITE_URL',
    'CONVEX_DEPLOY_KEY',
    'CONVEX_SELF_HOSTED_URL',
    'CONVEX_SELF_HOSTED_ADMIN_KEY',
    'CMS_STORY_CONTRACT_MISMATCH_URL',
    'CMS_STORY_BASE_URL',
    'HOME',
    'LANG',
    'LC_ALL',
    'LOGNAME',
    'NODE_OPTIONS',
    'PATH',
    'SHELL',
    'TEMP',
    'TMP',
    'TMPDIR',
    'USER',
  ])
  const allowedPrefixes = [
    'GINKO_CMS_TEST_VIEWER_EMAIL',
    'GINKO_CMS_TEST_EDITOR_EMAIL',
    'GINKO_CMS_TEST_PUBLISHER_EMAIL',
    'GINKO_CMS_TEST_OWNER_EMAIL',
  ]
  const inherited = Object.fromEntries(
    Object.entries(process.env).filter(
      ([key, value]) =>
        typeof value === 'string' && (allowedExact.has(key) || allowedPrefixes.includes(key)),
    ),
  )
  return { ...inherited, ...commandEnv }
}

function isolatedProofEnvironment(commandEnv) {
  const allowed = new Set([
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
  ])
  const inherited = Object.fromEntries(
    Object.entries(process.env).filter(
      ([key, value]) => typeof value === 'string' && allowed.has(key),
    ),
  )
  return { ...inherited, ...commandEnv }
}

async function runCommand(command, artifactRoot, index, seed) {
  const startedAt = new Date()
  const logPath = resolve(
    artifactRoot,
    'commands',
    `${String(index + 1).padStart(2, '0')}-${safeName(command.name)}.log`,
  )
  const log = createWriteStream(logPath, { flags: 'w' })
  const executable = command.executable ?? 'corepack'
  const args = command.executable ? command.args : ['pnpm', ...command.args]

  console.log(`\n=== ${command.name} ===`)
  console.log(`cmd: ${executable} ${args.join(' ')}`)

  const commandEnv = {
    CI: 'true',
    GINKO_CMS_TEST_SEED: String(seed),
    VITEST_MAX_RETRIES: '0',
    npm_config_verify_deps_before_run: 'false',
    ...command.env,
  }
  const baseEnv = command.isolated
    ? isolatedProofEnvironment(commandEnv)
    : { ...process.env, ...commandEnv }
  const child = spawn(executable, args, {
    cwd: repoRoot,
    env: command.fixtureHook
      ? fixtureHookEnvironment({
          CI: 'true',
          GINKO_CMS_TEST_SEED: String(seed),
          ...command.env,
        })
      : baseEnv,
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
    command: [executable, ...args],
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    exitCode,
    log: logPath.slice(repoRoot.length + 1),
  }
}

async function cleanupLiveFixtures({
  livePreflight,
  artifactRoot,
  fixtureManifestPath,
  cleanupPath,
  seed,
  commandIndex,
  removeBootstrapOwner = false,
}) {
  return await runCommand(
    {
      name: 'clean disposable target-scale fixtures',
      executable: process.execPath,
      args: [
        livePreflight.fixtureModulePath,
        removeBootstrapOwner ? 'cleanup-final' : 'cleanup',
        '--manifest',
        fixtureManifestPath,
        '--output',
        cleanupPath,
        '--prefix',
        livePreflight.fixturePrefix,
      ],
      fixtureHook: true,
      env: {
        CMS_STORY_FIXTURE_MANIFEST: fixtureManifestPath,
        CMS_STORY_CLEANUP_OUTPUT: cleanupPath,
        CMS_STORY_FIXTURE_PREFIX: livePreflight.fixturePrefix,
      },
    },
    artifactRoot,
    commandIndex,
    seed,
  )
}

function journeyCleanupIsGreen(journeyCleanup) {
  return (
    journeyCleanup?.entryArchived === true &&
    journeyCleanup?.entryDeleted === true &&
    journeyCleanup?.assetRetired === true &&
    journeyCleanup?.siteDataDeleted === true &&
    journeyCleanup?.mcpConnectionRevoked === true &&
    journeyCleanup?.mcpOAuthClientCleanupDeferred === true &&
    journeyCleanup?.mcpAgentRunCompleted === true &&
    journeyCleanup?.mcpReviewApproved === true &&
    journeyCleanup?.localUploadFixtureRemoved === true
  )
}

async function finalizeLiveCertification({
  artifactRoot,
  reportPath,
  livePreflight,
  candidate,
  commit,
  seed,
  fixtureManifestPath,
  cleanupPath,
}) {
  const report = readJson(reportPath)
  if (!report || report.status !== 'automated-live-green-in-app-browser-pending') {
    throw new Error('Live proof must be automated-green and awaiting in-app Browser evidence.')
  }
  const evidencePath = process.env.GINKO_CMS_IAB_EVIDENCE
  if (!evidencePath || !isAbsolute(evidencePath) || !existsSync(evidencePath)) {
    throw new Error('GINKO_CMS_IAB_EVIDENCE must name an existing absolute JSON artifact.')
  }
  const evidence = validateInAppBrowserEvidence(readJson(evidencePath), {
    commit,
    candidateArtifactSha256: sha256File(livePreflight.candidateArtifactPath),
    fixturePrefix: livePreflight.fixturePrefix,
    browserOrigin: new URL(livePreflight.baseUrl).origin,
  })
  if (candidate.commit !== commit) {
    throw new Error('Final in-app Browser evidence does not belong to the current candidate.')
  }
  validateLiveFixtureManifest(readJson(fixtureManifestPath), livePreflight.fixturePrefix)
  for (const screenshot of evidence.screenshots) {
    if (!existsSync(resolve(artifactRoot, screenshot))) {
      throw new Error(`In-app Browser screenshot is missing from the proof artifact: ${screenshot}`)
    }
  }
  const storedEvidencePath = resolve(artifactRoot, 'browser', 'in-app-browser-evidence.json')
  if (resolve(evidencePath) !== storedEvidencePath) copyFileSync(evidencePath, storedEvidencePath)

  const cleanupResult = await cleanupLiveFixtures({
    livePreflight,
    artifactRoot,
    fixtureManifestPath,
    cleanupPath,
    seed,
    commandIndex: report.commands.length,
    removeBootstrapOwner: true,
  })
  report.commands.push(cleanupResult)
  if (cleanupResult.exitCode !== 0) {
    report.status = 'failed'
    report.finishedAt = new Date().toISOString()
    writeJson(reportPath, report)
    throw new Error(`disposable fixture cleanup failed with exit code ${cleanupResult.exitCode}.`)
  }
  const fixtureCleanup = validateCleanupLedger(readJson(cleanupPath), livePreflight.fixturePrefix)
  report.browser = {
    ...report.browser,
    status: 'green',
    inAppBrowser: evidence,
    inAppEvidence: storedEvidencePath.slice(repoRoot.length + 1),
  }
  report.fixtureCleanup = {
    ...report.fixtureCleanup,
    targetScale: fixtureCleanup,
    required: true,
    completed: fixtureCleanup.deploymentDiscarded || fixtureCleanup.fullyCleaned,
  }
  report.status = 'green'
  report.finishedAt = new Date().toISOString()
  writeJson(reportPath, report)
  console.log(
    `\nFinal live refactor certification is green: ${reportPath.slice(repoRoot.length + 1)}.`,
  )
}

async function main() {
  if (finalize && !live) throw new Error('--finalize requires --live.')
  const livePreflight = live ? validateLiveProofPreflight() : null

  const commit = capture('git', ['rev-parse', 'HEAD'])
  const shortCommit = commit.slice(0, 12)
  const workspaceStatus = capture('git', ['status', '--short'])
  const sourceFingerprint = workspaceFingerprint()
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

  const fixtureManifestPath = resolve(artifactRoot, 'browser', 'fixture-manifest.json')
  const cleanupPath = resolve(artifactRoot, 'browser', 'fixture-cleanup.json')
  const journeyCleanupPath = resolve(artifactRoot, 'browser', 'journey-cleanup.json')
  const reportPath = resolve(artifactRoot, 'proof.json')
  const candidate = live
    ? validateCandidateArtifact(readJsonFile(livePreflight.candidateArtifactPath))
    : null
  if (live && workspaceStatus) {
    throw new Error('Live refactor certification requires a clean, committed workspace.')
  }
  if (live && candidate.commit !== commit) {
    throw new Error(
      `Packed candidate source ${candidate.commit} does not match current commit ${commit}.`,
    )
  }
  if (live) {
    for (const name of [
      '@lupinum/ginko-cms-contract',
      '@lupinum/ginko-cms-convex',
      '@lupinum/ginko-cms',
    ]) {
      if (candidate.packages[name].commit !== commit) {
        throw new Error(`${name} candidate artifact does not come from current commit ${commit}.`)
      }
    }
  }
  if (finalize) {
    await finalizeLiveCertification({
      artifactRoot,
      reportPath,
      livePreflight,
      candidate,
      commit,
      seed,
      fixtureManifestPath,
      cleanupPath,
    })
    return
  }
  const commands = live
    ? [
        {
          name: 'automated refactor proof',
          args: ['run', 'verify:refactor'],
          isolated: true,
        },
        { name: 'packed consumer live gate', args: ['run', 'package:e2e:live'] },
        {
          name: 'provision disposable role accounts',
          executable: process.execPath,
          args: [resolve(repoRoot, 'scripts/live-proof/provision-accounts.mjs')],
        },
        {
          name: 'seed disposable target-scale fixtures',
          executable: process.execPath,
          args: [
            livePreflight.fixtureModulePath,
            'setup',
            '--output',
            fixtureManifestPath,
            '--prefix',
            livePreflight.fixturePrefix,
            '--seed',
            String(seed),
            '--target-scale',
            JSON.stringify(LIVE_PROOF_TARGET_SCALE),
          ],
          fixtureHook: true,
          env: {
            CMS_STORY_FIXTURE_MANIFEST: fixtureManifestPath,
            CMS_STORY_FIXTURE_PREFIX: livePreflight.fixturePrefix,
          },
        },
        {
          name: 'automated live user journeys',
          args: ['run', 'smoke:live-stories'],
          env: {
            CMS_STORY_CERTIFICATION: '1',
            CMS_STORY_OUTPUT: resolve(artifactRoot, 'browser', 'automated-live-stories.json'),
            CMS_STORY_BROWSER_DIR: resolve(artifactRoot, 'browser'),
            CMS_STORY_FIXTURE_MANIFEST: fixtureManifestPath,
            CMS_STORY_CANDIDATE_ARTIFACT: livePreflight.candidateArtifactPath,
            CMS_STORY_JOURNEY_CLEANUP_OUTPUT: journeyCleanupPath,
          },
        },
      ]
    : [
        { name: 'repository invariants types and tests', args: ['run', 'check'] },
        { name: 'production package build', args: ['run', 'build'] },
        { name: 'generated code and Studio bundle budgets', args: ['run', 'check:bundle-budgets'] },
      ]

  const report = {
    schemaVersion: 1,
    lane: live ? 'live' : 'automated',
    commit,
    shortCommit,
    workspaceDirty: workspaceStatus.length > 0,
    workspaceStatus: workspaceStatus ? workspaceStatus.split('\n') : [],
    sourceFingerprint,
    packageHashes,
    tools: {
      node: process.version,
      pnpm: capture('corepack', ['pnpm', '--version']),
      git: capture('git', ['--version']),
      playwright: readJson('package.json')?.devDependencies?.playwright ?? null,
    },
    determinism: {
      seed,
      retriesDisabled: true,
    },
    targetScale: LIVE_PROOF_TARGET_SCALE,
    storyTraceability: {
      acceptanceEvidence: false,
      accepted: storyEvidence.accepted.length,
      deferred: storyEvidence.deferred.length,
      evidenceFiles: storyEvidence.evidenceFiles,
      mappings: storyEvidence.mappings,
      unmapped: storyEvidence.unmapped,
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
    report.disposableDeploymentFingerprint = sha256(livePreflight.deployment.identity).slice(0, 16)
    report.disposableDeploymentKind = livePreflight.deployment.kind
    report.liveInputs = {
      browserOrigin: new URL(livePreflight.baseUrl).origin,
      candidateCommit: candidate.commit,
      candidatePackages: candidate.packages,
      candidateArtifactSha256: sha256File(livePreflight.candidateArtifactPath),
      fixtureModuleSha256: sha256File(livePreflight.fixtureModulePath),
      roleAccounts: Object.fromEntries(
        Object.entries(livePreflight.roles).map(([role, credentials]) => [
          role,
          { configured: true, emailHash: sha256(credentials.email.toLowerCase()).slice(0, 16) },
        ]),
      ),
    }
  }
  writeJson(reportPath, report)

  let commandFailure = null
  let fixtureSetupAttempted = false
  for (const [index, command] of commands.entries()) {
    if (command.name === 'seed disposable target-scale fixtures') fixtureSetupAttempted = true
    const result = await runCommand(command, artifactRoot, index, seed)
    report.commands.push(result)
    if (result.exitCode !== 0) {
      report.status = 'failed'
      report.finishedAt = new Date().toISOString()
      writeJson(reportPath, report)
      commandFailure = new Error(`${command.name} failed with exit code ${result.exitCode}.`)
      break
    }
    if (command.name === 'seed disposable target-scale fixtures') {
      try {
        report.fixtureManifest = validateLiveFixtureManifest(
          readJson(fixtureManifestPath),
          livePreflight.fixturePrefix,
        )
      } catch (error) {
        commandFailure = new Error(
          `target-scale fixture manifest is invalid: ${error instanceof Error ? error.message : String(error)}`,
        )
        break
      }
    }
    writeJson(reportPath, report)
  }

  if (live && fixtureSetupAttempted && commandFailure) {
    const cleanupResult = await cleanupLiveFixtures({
      livePreflight,
      artifactRoot,
      fixtureManifestPath,
      cleanupPath,
      seed,
      commandIndex: commands.length,
    })
    report.commands.push(cleanupResult)
    if (cleanupResult.exitCode !== 0 && !commandFailure) {
      commandFailure = new Error(
        `disposable fixture cleanup failed with exit code ${cleanupResult.exitCode}.`,
      )
    }
    writeJson(reportPath, report)
  }

  if (commandFailure) {
    report.status = 'failed'
    report.finishedAt = new Date().toISOString()
    writeJson(reportPath, report)
    throw commandFailure
  }

  if (live) {
    const automatedBrowser = readJson(
      resolve(artifactRoot, 'browser', 'automated-live-stories.json'),
    )
    const browserObservability = readJson(
      resolve(artifactRoot, 'browser', 'console-network-summary.json'),
    )
    const journeyCleanup = readJson(journeyCleanupPath)
    const performance = readJson(resolve(artifactRoot, 'browser', 'performance-summary.json'))
    const browserGreen =
      automatedBrowser?.ok === true &&
      browserObservability?.unexpectedBrowserFailures === 0 &&
      performance?.ok === true &&
      performance?.sampleCount >= 20
    const journeyCleanupGreen = journeyCleanupIsGreen(journeyCleanup)
    report.browser = {
      requiredForCertification: true,
      status: browserGreen ? 'automated-green-in-app-browser-pending' : 'failed',
      automatedStories: automatedBrowser?.stories ?? 0,
      automatedResults: automatedBrowser?.results ?? [],
      unexpectedFailures: browserObservability?.unexpectedBrowserFailures ?? null,
      screenshots: automatedBrowser?.browser?.screenshots ?? [],
      runtime: automatedBrowser?.browser?.runtime ?? null,
      performance,
    }
    report.fixtureCleanup = {
      journey: journeyCleanup,
      required: true,
      completed: false,
      status: 'retained-for-in-app-browser',
    }
    if (!browserGreen || !journeyCleanupGreen) {
      if (fixtureSetupAttempted) {
        const cleanupResult = await cleanupLiveFixtures({
          livePreflight,
          artifactRoot,
          fixtureManifestPath,
          cleanupPath,
          seed,
          commandIndex: report.commands.length,
        })
        report.commands.push(cleanupResult)
      }
      report.status = 'failed'
      report.finishedAt = new Date().toISOString()
      writeJson(reportPath, report)
      throw new Error('Automated live Browser evidence or journey cleanup is incomplete.')
    }
    report.status = 'automated-live-green-in-app-browser-pending'
  } else {
    report.status = 'green'
  }
  report.finishedAt = new Date().toISOString()
  writeJson(reportPath, report)
  console.log(`\nRefactor proof written to ${reportPath.slice(repoRoot.length + 1)}.`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
