import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const repoRoot = resolve(import.meta.dirname, '..')
const candidatePath = resolve(repoRoot, '.pack/candidate/candidate-artifact.json')
const evidencePath = resolve(repoRoot, '.pack/candidate/release-evidence-npm.json')

if (!existsSync(candidatePath)) {
  throw new Error('Candidate evidence is missing; run candidate:pack first.')
}

const result = spawnSync(
  'pnpm',
  ['--config.verify-deps-before-run=warn', 'run', 'package:e2e:npm'],
  {
    cwd: repoRoot,
    encoding: 'utf8',
    env: process.env,
    maxBuffer: 64 * 1024 * 1024,
  },
)
const output = `${result.stdout ?? ''}${result.stderr ?? ''}`
process.stdout.write(result.stdout ?? '')
process.stderr.write(result.stderr ?? '')

if (result.status === 0) {
  console.log('Strict npm candidate consumer passed.')
  process.exit(0)
}

const knownOxcEmnapiFailure = [
  /ERESOLVE/u,
  /@oxc-parser\/binding-wasm32-wasi@0\.140\.0/u,
  /@emnapi\/core@1\.11\.2/u,
  /@emnapi\/core@\^2\.0\.0-alpha\.3/u,
].every((pattern) => pattern.test(output))

if (!knownOxcEmnapiFailure) {
  process.exit(result.status ?? 1)
}

const candidate = JSON.parse(readFileSync(candidatePath, 'utf8'))
writeFileSync(
  evidencePath,
  `${JSON.stringify(
    {
      schemaVersion: 1,
      packageManager: 'npm',
      status: 'known-upstream-limitation',
      limitation: 'oxc-parser-0.140.0-emnapi-peer-conflict',
      candidate: candidate.candidate,
      sourceCommit: candidate.source.commit,
      command: 'pnpm run package:e2e:npm',
      prohibitedBypassesUsed: false,
    },
    null,
    2,
  )}\n`,
)
console.warn(
  'Strict npm hit only the recorded oxc-parser 0.140.0/@emnapi peer conflict; RC.2 remains pnpm-supported.',
)
