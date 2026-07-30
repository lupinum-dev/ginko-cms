import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const repoRoot = resolve(import.meta.dirname, '..')
const candidate = JSON.parse(
  readFileSync(resolve(repoRoot, '.pack/candidate/candidate-artifact.json'), 'utf8'),
)
const packageNames = [
  '@lupinum/ginko-cms-contract',
  '@lupinum/ginko-cms-convex',
  '@lupinum/ginko-cms',
]
const temporaryRoot = mkdtempSync(join(tmpdir(), 'ginko-registry-equality-'))

try {
  for (const packageName of packageNames) {
    const artifact = candidate.artifacts[packageName]
    const packageSpec = `${packageName}@${artifact.version}`
    const packed = JSON.parse(
      execFileSync('npm', ['pack', packageSpec, '--pack-destination', temporaryRoot, '--json'], {
        cwd: repoRoot,
        encoding: 'utf8',
      }),
    )
    if (!Array.isArray(packed) || packed.length !== 1) {
      throw new Error(`npm returned unexpected pack evidence for ${packageName}.`)
    }
    const registryTarball = resolve(temporaryRoot, packed[0].filename)
    const registrySha256 = createHash('sha256').update(readFileSync(registryTarball)).digest('hex')
    if (registrySha256 !== artifact.sha256) {
      throw new Error(
        `${packageName}@${artifact.version} registry bytes differ from the approved candidate.`,
      )
    }
    const attestationOutput = execFileSync(
      'npm',
      ['view', packageSpec, 'dist.attestations', '--json'],
      { cwd: repoRoot, encoding: 'utf8' },
    ).trim()
    const attestations = attestationOutput ? JSON.parse(attestationOutput) : undefined
    if (attestations?.provenance?.predicateType !== 'https://slsa.dev/provenance/v1') {
      throw new Error(`${packageSpec} is missing its npm SLSA provenance attestation.`)
    }
    console.log(`${packageSpec}: registry bytes and npm provenance match the approved candidate`)
  }
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true })
}
