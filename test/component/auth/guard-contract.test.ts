import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

describe('protected callable guard contract', () => {
  it('does not expose scope-blind owner guards to direct MCP calls', () => {
    for (const file of [
      'packages/convex/src/assetRecovery.ts',
      'packages/convex/src/diagnostics.ts',
    ]) {
      const source = readFileSync(resolve(process.cwd(), file), 'utf8')
      expect(source, file).not.toMatch(/guard:\s*hasRole\(['"]owner['"]\)/)
    }
  })
})
