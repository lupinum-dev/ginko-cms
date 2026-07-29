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
    console.log(`${packageName}@${artifact.version}: registry bytes match ${registrySha256}`)
  }
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true })
}
