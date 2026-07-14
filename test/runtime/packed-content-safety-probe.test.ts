import { execFileSync } from 'node:child_process'

import { describe, expect, it } from 'vitest'

describe('packed Content safety probe', () => {
  it('executes the decoder and render-policy probes against the installed package', () => {
    expect(
      execFileSync(process.execPath, ['scripts/packed-content-safety-probe.mjs'], {
        encoding: 'utf8',
      }),
    ).toContain('packed Content safety probes passed')
  })
})
