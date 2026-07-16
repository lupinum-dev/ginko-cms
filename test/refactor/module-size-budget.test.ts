import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '../..')

const budgets = {
  // W8 decomposition: the ~2150-line browser was split into a shell + focused
  // ./assets components behind a provided context seam. The shell now owns only
  // props/expose, the finder call, context assembly, the split-pane skeleton and
  // the view dispatch; the toolbar and manage drawer are the two heaviest leaves.
  'packages/cms/studio-app/src/components/studio/StudioAssetBrowser.vue': 480,
  'packages/cms/studio-app/src/components/studio/assets/StudioAssetToolbar.vue': 300,
  'packages/cms/studio-app/src/components/studio/assets/StudioAssetManageDrawer.vue': 280,
  'packages/cms/studio-app/src/composables/internal/useStudioAssetFinder.ts': 1_000,
  'packages/contract/src/validators.ts': 1_400,
  'packages/convex/src/public.ts': 1_400,
  'packages/convex/src/entries/workflow/commands.ts': 1_400,
} as const

describe('maintainability size budgets', () => {
  it('prevents the reviewed ownership boundaries from growing again', () => {
    for (const [file, maxLines] of Object.entries(budgets)) {
      const lines = readFileSync(resolve(root, file), 'utf8').split('\n').length
      expect(lines, `${file} exceeds its ${maxLines}-line reviewed budget`).toBeLessThanOrEqual(
        maxLines,
      )
    }
  })
})
