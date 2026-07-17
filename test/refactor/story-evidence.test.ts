import { describe, expect, it } from 'vitest'

import { buildUserStoryEvidenceReport } from '../../scripts/check-user-story-evidence.mjs'

describe('accepted user-story evidence', () => {
  it('maps every ACC–DEV story and keeps every CND story explicitly deferred', () => {
    const report = buildUserStoryEvidenceReport()

    expect(report.accepted).toHaveLength(111)
    expect(report.deferred).toHaveLength(12)
    expect(Object.keys(report.mappings).sort()).toEqual(report.accepted)
    expect(report.evidenceFiles.length).toBeGreaterThan(50)
  })
})
