import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, it } from 'vitest'

import { clearPackageE2eOutputs } from '../../scripts/package-e2e-outputs.mjs'

it('cleans only standard package test outputs and preserves immutable input archives', () => {
  const temp = mkdtempSync(join(tmpdir(), 'ginko-package-e2e-cleanup-'))
  const pack = join(temp, '.pack')
  try {
    const preserved = [
      'upstream/lupinum-ginko-content-1.0.0-beta.9.tgz',
      'upstream/lupinum-ginko-editor-0.1.0.tgz',
      'candidate/lupinum-ginko-cms-0.2.0-rc.3.tgz',
      'candidate/candidate-artifact.json',
      'dev/lupinum-ginko-cms-0.2.0-rc.3.tgz',
      'lupinum-ginko-content-1.0.0-beta.9.tgz',
      'lupinum-ginko-editor-0.1.0.tgz',
      'unrelated-package-1.0.0.tgz',
      'candidate-artifact.json',
    ]
    const outputs = [
      'lupinum-ginko-cms-0.2.0-rc.2.tgz',
      'lupinum-ginko-cms-0.2.0-rc.3.tgz',
      'lupinum-ginko-cms-contract-0.2.0-rc.3.tgz',
      'lupinum-ginko-cms-convex-0.2.0-rc.3.tgz',
      'lupinum-better-convex-nuxt-1.0.0-beta.5.tgz',
      'lupinum-better-convex-vue-1.0.0-beta.5.tgz',
      'lupinum-better-convex-mcp-1.0.0-beta.1.tgz',
      'release-evidence-pnpm.json',
      'release-evidence-npm.json',
    ]
    for (const path of [...preserved, ...outputs]) {
      const fullPath = join(pack, path)
      mkdirSync(join(fullPath, '..'), { recursive: true })
      writeFileSync(fullPath, `original bytes: ${path}`)
    }
    clearPackageE2eOutputs(pack)
    clearPackageE2eOutputs(pack)
    for (const path of outputs) expect(existsSync(join(pack, path)), path).toBe(false)
    for (const path of preserved) {
      expect(readFileSync(join(pack, path), 'utf8')).toBe(`original bytes: ${path}`)
    }
  } finally {
    rmSync(temp, { recursive: true, force: true })
  }
})
