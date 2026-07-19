import { execFileSync, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { isAbsolute, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))
const manifestPath = resolve(repoRoot, '.pack/live-candidate.json')
const candidateArtifactPath = resolve(repoRoot, '.pack/candidate/candidate-artifact.json')
const command = process.argv[2]

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

function readJson(path, label) {
  if (!existsSync(path)) throw new Error(`${label} does not exist: ${path}`)
  return JSON.parse(readFileSync(path, 'utf8'))
}

function readMaterializedCandidate() {
  const manifest = readJson(manifestPath, 'Live candidate manifest')
  if (manifest.schemaVersion !== 1 || !isAbsolute(manifest.consumerDirectory)) {
    throw new Error('Live candidate manifest is invalid.')
  }
  const candidate = readJson(candidateArtifactPath, 'Candidate artifact')
  if (
    candidate.source?.dirty !== false ||
    manifest.candidateArtifact?.path !== candidateArtifactPath ||
    manifest.candidateArtifact?.sourceCommit !== candidate.source?.commit ||
    manifest.candidateArtifact?.sha256 !== sha256(candidateArtifactPath)
  ) {
    throw new Error('Materialized consumer no longer matches the exact candidate artifact.')
  }
  if (!existsSync(resolve(manifest.consumerDirectory, '.output/server/index.mjs'))) {
    throw new Error('Materialized consumer production server is missing.')
  }
  if (
    !manifest.mismatchServer ||
    !existsSync(resolve(manifest.consumerDirectory, '.output-mismatch/server/index.mjs'))
  ) {
    throw new Error('Materialized consumer mismatch server is missing.')
  }
  return manifest
}

function assertDisposableConsumerPath(path) {
  const relativePath = relative(resolve(tmpdir()), resolve(path))
  if (
    !relativePath ||
    relativePath.startsWith('..') ||
    !relativePath.startsWith('ginko-cms-package-e2e-')
  ) {
    throw new Error('Refusing to remove a consumer outside the package-e2e temporary directory.')
  }
}

if (command === 'materialize') {
  execFileSync(
    process.execPath,
    [resolve(repoRoot, 'scripts/package-e2e.mjs'), '--candidate', '--live'],
    {
      cwd: repoRoot,
      env: {
        ...process.env,
        GINKO_KEEP_PACKAGE_E2E: '1',
        GINKO_BUILD_MISMATCH_CANDIDATE: '1',
        GINKO_PACKAGE_E2E_OUTPUT: manifestPath,
      },
      stdio: 'inherit',
    },
  )
  const manifest = readMaterializedCandidate()
  console.log(`Exact packed consumer materialized at ${manifest.consumerDirectory}.`)
} else if (command === 'serve') {
  const manifest = readMaterializedCandidate()
  const host = process.env.HOST || '127.0.0.1'
  const main = spawn(process.execPath, ['.output/server/index.mjs'], {
    cwd: manifest.consumerDirectory,
    env: { ...process.env, HOST: host, PORT: process.env.PORT || '3000' },
    stdio: 'inherit',
  })
  const mismatch = spawn(process.execPath, ['.output-mismatch/server/index.mjs'], {
    cwd: manifest.consumerDirectory,
    env: { ...process.env, HOST: host, PORT: process.env.MISMATCH_PORT || '3001' },
    stdio: 'inherit',
  })
  const stop = () => {
    main.kill('SIGTERM')
    mismatch.kill('SIGTERM')
  }
  process.once('SIGINT', stop)
  process.once('SIGTERM', stop)
  const result = await Promise.race(
    [main, mismatch].map(
      (child) =>
        new Promise((resolveExit) => child.once('close', (code) => resolveExit(code ?? 1))),
    ),
  )
  stop()
  if (result !== 0) process.exitCode = result
} else if (command === 'cleanup') {
  const manifest = readMaterializedCandidate()
  assertDisposableConsumerPath(manifest.consumerDirectory)
  rmSync(manifest.consumerDirectory, { recursive: true, force: true })
  rmSync(manifestPath, { force: true })
  console.log('Removed the materialized packed consumer.')
} else {
  throw new Error('Usage: node scripts/live-candidate.mjs <materialize|serve|cleanup>')
}
