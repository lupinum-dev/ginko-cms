import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '../..')

const budgets = {
  // 2150 → 2160 (design review S3, reviewed): the asset browser gained the
  // on-demand filter row + merged Library nav; net growth after the F1c
  // primitive conversions is +7 lines.
  'packages/cms/studio-app/src/components/studio/StudioAssetBrowser.vue': 2_160,
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
