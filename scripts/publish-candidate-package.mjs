import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const repoRoot = resolve(import.meta.dirname, '..')
const candidatePath = resolve(repoRoot, '.pack/candidate/candidate-artifact.json')
const allowedPackages = new Set([
  '@lupinum/ginko-cms-contract',
  '@lupinum/ginko-cms-convex',
  '@lupinum/ginko-cms',
])
const packageName = process.argv[2]

if (!allowedPackages.has(packageName)) {
  throw new Error(`Expected one Ginko package name, received ${packageName ?? 'nothing'}.`)
}
if (!existsSync(candidatePath)) {
  throw new Error('Candidate evidence is missing.')
}

const evidence = JSON.parse(readFileSync(candidatePath, 'utf8'))
const artifact = evidence.artifacts[packageName]
if (!artifact) throw new Error(`${packageName} is absent from candidate evidence.`)
if (process.env.GITHUB_SHA && evidence.source.commit !== process.env.GITHUB_SHA) {
  throw new Error('Candidate source commit does not match the workflow commit.')
}
if (process.env.GITHUB_REF_NAME && process.env.GITHUB_REF_NAME !== `v${artifact.version}`) {
  throw new Error(`Publication requires tag v${artifact.version}.`)
}

const tarball = resolve(repoRoot, '.pack/candidate', artifact.tarball)
const actualSha256 = createHash('sha256').update(readFileSync(tarball)).digest('hex')
if (actualSha256 !== artifact.sha256) {
  throw new Error(`${packageName} candidate hash does not match candidate-artifact.json.`)
}

let publishedVersion
try {
  publishedVersion = JSON.parse(
    execFileSync('npm', ['view', `${packageName}@${artifact.version}`, 'version', '--json'], {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }),
  )
} catch {
  publishedVersion = undefined
}

if (publishedVersion === artifact.version) {
  const temporaryRoot = mkdtempSync(join(tmpdir(), 'ginko-publish-idempotency-'))
  try {
    const packed = JSON.parse(
      execFileSync(
        'npm',
        [
          'pack',
          `${packageName}@${artifact.version}`,
          '--pack-destination',
          temporaryRoot,
          '--json',
        ],
        { cwd: repoRoot, encoding: 'utf8' },
      ),
    )
    const registryTarball = resolve(temporaryRoot, packed[0].filename)
    const registrySha256 = createHash('sha256').update(readFileSync(registryTarball)).digest('hex')
    if (registrySha256 !== artifact.sha256) {
      throw new Error(`${packageName}@${artifact.version} already exists with different bytes.`)
    }
    const stagedVersion = execFileSync(
      'npm',
      ['view', packageName, 'dist-tags.next-staging', '--json'],
      { cwd: repoRoot, encoding: 'utf8' },
    ).trim()
    if (JSON.parse(stagedVersion) !== artifact.version) {
      throw new Error(`${packageName}@${artifact.version} exists but is not tagged next-staging.`)
    }
    const packageSpec = `${packageName}@${artifact.version}`
    const attestationOutput = execFileSync(
      'npm',
      ['view', packageSpec, 'dist.attestations', '--json'],
      { cwd: repoRoot, encoding: 'utf8' },
    ).trim()
    const attestations = attestationOutput ? JSON.parse(attestationOutput) : undefined
    if (attestations?.provenance?.predicateType !== 'https://slsa.dev/provenance/v1') {
      throw new Error(`${packageSpec} is missing its npm SLSA provenance attestation.`)
    }
    console.log(`${packageSpec} is already published with approved bytes and npm provenance.`)
    process.exit(0)
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true })
  }
}

execFileSync(
  'npm',
  ['publish', tarball, '--tag', 'next-staging', '--access', 'public', '--provenance'],
  {
    cwd: repoRoot,
    env: process.env,
    stdio: 'inherit',
  },
)
