import { describe, expect, it } from 'vitest'

import { buildUserStoryEvidenceReport } from '../../scripts/check-user-story-evidence.mjs'

describe('user-story traceability index', () => {
  it('indexes tagged executable cases without treating titles as acceptance evidence', () => {
    const report = buildUserStoryEvidenceReport()

    expect(report.accepted).toHaveLength(111)
    expect(report.deferred).toHaveLength(12)
    expect(Object.keys(report.mappings).sort()).toEqual(report.accepted)
    expect(report.evidenceFiles.length).toBeGreaterThan(50)
    expect(Array.isArray(report.unmapped)).toBe(true)
    expect(report.mappings['QUA-07']).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ file: 'test/refactor/target-scale.test.ts' }),
      ]),
    )
    expect(report.mappings['DEV-06']).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ file: 'test/module/candidate-release-contract.test.ts' }),
      ]),
    )
  })
})
