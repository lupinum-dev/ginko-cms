import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const root = new URL('../..', import.meta.url).pathname
describe('release-clean backend has no old-system zombie paths', () => {
  it('imports the Content CMS contract directly without a vendored copy', () => {
    const oldVendorRoot = join(root, 'packages/convex/src/lib/cmsContract')
    expect(existsSync(oldVendorRoot) ? readdirSync(oldVendorRoot) : []).toEqual([])
    expect(readFileSync(join(root, 'package.json'), 'utf8')).not.toContain(
      'sync:cms-contract-vendor',
    )
    expect(readFileSync(join(root, 'MAINTAINING.md'), 'utf8')).not.toContain(
      'sync:cms-contract-vendor',
    )
    const directConsumers = [
      'packages/convex/src/entries/workflow/commands.ts',
      'packages/convex/src/entries/workflow/path.ts',
      'packages/convex/src/entries/workflow/projectionBuild.ts',
    ]
    for (const file of directConsumers) {
      expect(readFileSync(join(root, file), 'utf8')).toContain(
        "from '@lupinum/ginko-content/cms-contract'",
      )
    }
  })

  it('keeps public content API reads on published projections only', () => {
    const source = readFileSync(join(root, 'packages/convex/src/public.ts'), 'utf8')
    const forbidden = [
      /\.query\(['"]entries['"]\)/,
      /\.query\(['"]entryDrafts['"]\)/,
      /\.query\(['"]entryRevisions['"]\)/,
      /\bctx\.db\.get\(/,
    ]

    expect(
      forbidden.filter((pattern) => pattern.test(source)).map(String),
      'public.ts must not read draft/editor/source-of-truth content tables',
    ).toEqual([])
  })
})
