import { describe, expect, it } from 'vitest'

import {
  PORTABLE_ASSET_LIMIT,
  PORTABLE_DOCUMENT_LIMIT,
  assertImportPlanPayload,
} from '../../packages/convex/src/portability/model.js'

function payload(itemCount: number, assetCount: number) {
  return {
    format: 'ginko-cms-portability-plan' as const,
    version: 1 as const,
    mode: 'import' as const,
    deploymentId: 'limits-test',
    scope: { collections: ['posts'] },
    targetContractSha256: 'a'.repeat(64),
    sourceManifestSha256: 'b'.repeat(64),
    sourceContractSha256: 'c'.repeat(64),
    itemCount,
    itemRootSha256: 'd'.repeat(64),
    assetCount,
    assetRootSha256: 'e'.repeat(64),
  }
}

describe('CMS portability supported envelope', () => {
  it('accepts exactly 5,000 localized documents and rejects 5,001', () => {
    expect(assertImportPlanPayload(payload(PORTABLE_DOCUMENT_LIMIT, 0)).itemCount).toBe(5_000)
    expect(() => assertImportPlanPayload(payload(PORTABLE_DOCUMENT_LIMIT + 1, 0))).toThrow(
      /plan payload is invalid/i,
    )
  })

  it('accepts exactly 500 assets and rejects 501', () => {
    expect(assertImportPlanPayload(payload(0, PORTABLE_ASSET_LIMIT)).assetCount).toBe(500)
    expect(() => assertImportPlanPayload(payload(0, PORTABLE_ASSET_LIMIT + 1))).toThrow(
      /plan payload is invalid/i,
    )
  })
})
