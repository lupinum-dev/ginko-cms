import { mkdirSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const ownedTarball =
  /^lupinum-(?:ginko-cms(?:-contract|-convex)?|better-convex-(?:nuxt|vue|mcp))-\d.*\.tgz$/u
const ownedEvidence = new Set(['release-evidence-pnpm.json', 'release-evidence-npm.json'])

/** Keep pinned upstream inputs and other pack workflows outside this cleanup. */
export function clearPackageE2eOutputs(packDir) {
  mkdirSync(packDir, { recursive: true })
  for (const entry of readdirSync(packDir, { withFileTypes: true })) {
    if (!entry.isDirectory() && (ownedTarball.test(entry.name) || ownedEvidence.has(entry.name))) {
      rmSync(join(packDir, entry.name), { force: true })
    }
  }
}
