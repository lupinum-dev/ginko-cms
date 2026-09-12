import { execFileSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

describe('packed Content safety probe', () => {
  it('executes the decoder and render-policy probes with both built packages available', () => {
    const consumer = mkdtempSync(join(tmpdir(), 'ginko-cms-safety-probe-'))
    try {
      // The workspace root does not depend on its own CMS package. Give the
      // probe the same package names that its real packed consumer receives.
      const scope = join(consumer, 'node_modules/@lupinum')
      mkdirSync(scope, { recursive: true })
      symlinkSync(resolve('packages/cms'), join(scope, 'ginko-cms'), 'dir')
      symlinkSync(
        realpathSync('node_modules/@lupinum/ginko-content'),
        join(scope, 'ginko-content'),
        'dir',
      )
      const script = join(consumer, 'probe.mjs')
      copyFileSync('scripts/packed-content-safety-probe.mjs', script)
      expect(execFileSync(process.execPath, [script], { encoding: 'utf8' })).toContain(
        'packed Content safety and CMS V2 authoring probes passed',
      )
    } finally {
      rmSync(consumer, { recursive: true, force: true })
    }
  })
})
